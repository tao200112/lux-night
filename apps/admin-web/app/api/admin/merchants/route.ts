/**
 * GET /api/admin/merchants
 * POST /api/admin/merchants
 * Admin Merchants API
 * 
 * Update 2026-02-01:
 * - GET: Uses orders.merchant_id for robust stats aggregation.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  handlerWrapper,
  requireAdmin,
  withTimeout,
  type ApiResponse,
} from '@/lib/admin/api';
import { randomUUID } from 'crypto';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

function isValidUuid(v: any): boolean {
  if (!v || typeof v !== 'string') return false;
  if (v === 'null' || v === 'NULL') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(v);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 15000;

export const GET = handlerWrapper(async (request: NextRequest): Promise<NextResponse> => {
  const debugId = randomUUID().substring(0, 8);
  let step = 'init';

  try {
    step = 'auth_check';
    const authResult = await withTimeout(requireAdmin(request), TIMEOUT_MS, 'requireAdmin');
    if ('status' in authResult) return authResult.response;

    const { adminClient } = authResult;
    step = 'auth_ok';

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    const region = searchParams.get('region') || '';
    const status = searchParams.get('status') || '';

    // Query Merchants
    step = 'query_merchants';
    let merchantsQuery = adminClient.from('merchants')
      .select('id, name, status, created_at, regions!inner(id, name, state, country)')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') merchantsQuery = merchantsQuery.eq('status', status);
    if (region) merchantsQuery = merchantsQuery.eq('region_id', region);
    if (query) merchantsQuery = merchantsQuery.ilike('name', `%${query}%`);

    const { data: merchants, error: merchantsError } = await withTimeout(
      Promise.resolve(merchantsQuery), TIMEOUT_MS, 'merchants query'
    );

    if (merchantsError) throw merchantsError;

    // Query All Regions (for filter dropdown)
    step = 'query_regions';
    const { data: regions } = await adminClient.from('regions').select('id, name, state, country').eq('is_active', true).order('name');

    // Aggregate Stats
    step = 'aggregate_stats';
    const merchantsList = merchants || [];
    const merchantIds = merchantsList.map((m: any) => m.id);

    // 1. Active Events Count
    const { data: activeEvents } = await adminClient
        .from('events_v2')
        .select('merchant_id')
        .in('merchant_id', merchantIds)
        .eq('status', 'active');
        
    const merchantActiveEvents: Record<string, number> = {};
    (activeEvents || []).forEach((e: any) => {
        merchantActiveEvents[e.merchant_id] = (merchantActiveEvents[e.merchant_id] || 0) + 1;
    });

    // 2. Orders Stats (Direct via merchant_id)
    // Fetch aggregated stats if possible, or fetch raw amounts (fetching only necessary columns is cheap)
    // We only care about Paid/Fulfilled/Completed revenue
    let merchantStats: Record<string, { revenue: number; count: number }> = {};
    
    if (merchantIds.length > 0) {
        const { data: orderStats } = await adminClient
            .from('orders')
            .select('merchant_id, amount_cents')
            .in('merchant_id', merchantIds)
            .in('status', ['paid', 'fulfilled', 'completed']);
            
        (orderStats || []).forEach((o: any) => {
             if (o.merchant_id) {
                 if (!merchantStats[o.merchant_id]) merchantStats[o.merchant_id] = { revenue: 0, count: 0 };
                 merchantStats[o.merchant_id].revenue += (o.amount_cents || 0);
                 merchantStats[o.merchant_id].count++;
             }
        });
    }

    // Assemble
    const merchantsWithStats = merchantsList.map((merchant: any) => {
        const stats = merchantStats[merchant.id] || { revenue: 0, count: 0 };
        const activeEventsCount = merchantActiveEvents[merchant.id] || 0;
        
        return {
          id: merchant.id,
          name: merchant.name,
          status: merchant.status,
          region: merchant.regions ? {
            id: merchant.regions.id,
            name: merchant.regions.name,
            state: merchant.regions.state,
            country: merchant.regions.country,
          } : null,
          stats: {
            ordersCount: stats.count,
            revenue: stats.revenue / 100,
            revenueFormatted: `$${(stats.revenue / 100).toLocaleString()}`,
            activeEvents: activeEventsCount,
          },
          createdAt: merchant.created_at,
       };
    });

    step = 'success';
    const response = NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        merchants: merchantsWithStats,
        regions: regions || [],
      },
      step,
      debugId,
    });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;

  } catch (error: any) {
    console.error('[ADMIN MERCHANTS GET] Error:', error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: 'Internal Server Error', code: 'INTERNAL_ERROR', message: error.message, step, debugId },
      { status: 500 }
    );
  }
});

export const POST = handlerWrapper(async (request: NextRequest): Promise<NextResponse> => {
  const debugId = randomUUID().substring(0, 8);
  let step = 'init';

  try {
    const rl = await rateLimitOrResponse(request, rateLimitPolicies.sensitivePost, { userId: 'anon' });
    if ('response' in rl) return rl.response as NextResponse;

    step = 'auth_check';
    const authResult = await requireAdmin(request);
    if ('status' in authResult) return authResult.response;
    const { user, adminClient } = authResult;
    
    step = 'parse_body';
    const body = await request.json();
    const { merchantId, regionId, role, expiresDays } = body;

    // Logic: If merchantId provided, check it. Else if regionId provided, create New Merchant.
    let merchantIdFinal = merchantId;
    let newMerchant = null;

    if (merchantId) {
        if (!isValidUuid(merchantId)) throw new Error('Invalid merchantId UUID');
        const { data: m } = await adminClient.from('merchants').select('id, name').eq('id', merchantId).single();
        if (!m) return NextResponse.json({ ok: false, error: 'Merchant Not Found' }, { status: 404 });
    } else {
        if (!regionId) return NextResponse.json({ ok: false, error: 'Region ID required for new merchant' }, { status: 400 });
        
        step = 'create_merchant';
        const { data: region } = await adminClient.from('regions').select('name').eq('id', regionId).single();
        if (!region) return NextResponse.json({ ok: false, error: 'Region Not Found' }, { status: 404 });
        
        const payload = {
            name: `New Merchant - ${region.name} - ${new Date().toISOString().slice(0, 10)}`,
            region_id: regionId
        };
        
        const { data: created, error: createError } = await adminClient.from('merchants').insert(payload).select().single();
        if (createError) throw createError;
        
        newMerchant = created;
        merchantIdFinal = created.id;
    }

    step = 'create_invite';
    // Generate Invite Code (simple impl)
    const generateCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let c = ''; 
        for(let i=0; i<8; i++) c += chars.charAt(Math.floor(Math.random()*chars.length));
        return c;
    };
    let token = generateCode();
    
    // Create Invite (for Staff Onboarding, table 'invites')
    // Note: User prompt mentions 'ambassador_invites', but this POST endpoint was for staff invites ('invites' table).
    // I am preserving existing functionality for staff invites.
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (expiresDays || 30));
    
    const invitePayload = {
        token,
        merchant_id: merchantIdFinal,
        region_id: regionId || null,
        intended_role: role || 'owner',
        issued_by_type: 'admin',
        max_uses: 1,
        used_count: 0,
        expires_at: expiresAt.toISOString(),
        created_by: user?.id,
        note: `Admin-created invite for merchant ${merchantIdFinal}`
    };

    const { data: invite, error: inviteError } = await adminClient
        .from('invites')
        .insert(invitePayload)
        .select()
        .single();

    if (inviteError) throw inviteError;

    return NextResponse.json<ApiResponse>({
       ok: true,
       data: { invite, merchant: newMerchant },
       step: 'success',
       debugId
    });

  } catch (error: any) {
    console.error('[ADMIN MERCHANTS POST] Error', error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: 'Internal Error', code: 'INTERNAL_ERROR', message: error.message, step, debugId },
      { status: 500 }
    );
  }
});
