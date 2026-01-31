/**
 * GET /api/admin/merchants/[id]
 * Admin Merchant Detail API
 * 
 * Fixed:
 * 1. Decoupled queries for Orders (via events_v2 list).
 * 2. Fetches member emails from auth.users (service role).
 * 3. Does not rely on inner joins that fail on unlinked data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handlerWrapper, requireAdmin, withTimeout, type ApiResponse } from '@/lib/admin/api';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 15000;

export const GET = handlerWrapper(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  let step = 'init';
  const { id } = await params;

  try {
    // STEP 1: Auth + Admin Client
    step = 'auth_check';
    const authResult = await withTimeout(
      requireAdmin(request),
      TIMEOUT_MS,
      'requireAdmin'
    );

    if ('status' in authResult) {
      return authResult.response;
    }

    const { adminClient } = authResult;
    step = 'auth_ok';

    // STEP 2: Fetch Merchant Details
    step = 'fetch_merchant';
    const { data: merchant, error: merchantError } = await adminClient
      .from('merchants')
      .select(`
        *,
        regions (
          id, name, state, country, status
        )
      `)
      .eq('id', id)
      .single();

    if (merchantError || !merchant) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Not Found', code: 'NOT_FOUND', message: 'Merchant not found', step },
        { status: 404 }
      );
    }

    // STEP 3: Parallel Fetch of Related Data
    step = 'fetch_related';
    
    // 3a. Venues
    const pVenues = adminClient.from('venues').select('id, name, address, is_active').eq('merchant_id', id);
    
    // 3b. Events V2 (Get IDs for finding orders)
    const pEvents = adminClient
        .from('events_v2')
        .select('id, title, status, created_at')
        .eq('merchant_id', id)
        .order('created_at', { ascending: false });

    // 3c. Members (Get Profile IDs for finding emails)
    const pMembers = adminClient
        .from('merchant_members')
        .select(`
           id, role, is_active, created_at, user_id,
           profiles (id, display_name, avatar_url)
        `)
        .eq('merchant_id', id)
        .eq('is_active', true);

    const [venuesRes, eventsRes, membersRes] = await Promise.all([pVenues, pEvents, pMembers]);

    const venues = venuesRes.data || [];
    const events = eventsRes.data || [];
    const members = membersRes.data || [];

    // STEP 4: Fetch Orders using Event IDs
    step = 'fetch_orders';
    const eventIds = events.map((e: any) => e.id);
    
    let orders: any[] = [];
    if (eventIds.length > 0) {
        // Fetch recent orders for these events
        const { data: ordersData } = await adminClient
            .from('orders')
            .select('id, amount_cents, status, created_at, event_v2_id')
            .in('event_v2_id', eventIds)
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
            .order('created_at', { ascending: false });
        
        orders = ordersData || [];
    }

    // STEP 5: Fetch Member Emails
    step = 'fetch_emails';
    const memberUserIds = members.map((m: any) => m.user_id).filter(Boolean);
    let memberEmails: Record<string, string> = {};

    if (memberUserIds.length > 0) {
        // @ts-ignore
        const { data: users } = await adminClient.schema('auth').from('users').select('id, email').in('id', memberUserIds);
        if (users) {
            memberEmails = users.reduce((acc: any, u: any) => { acc[u.id] = u.email; return acc; }, {});
        }
    }

    // STEP 6: Assemble Data
    step = 'assemble';

    // Stats
    const totalOrders = orders.length; // Approximate, strictly speaking we limited query by date
    const revenueOrders = orders.filter((o: any) => ['paid', 'completed', 'fulfilled'].includes(o.status));
    const totalRevenue = revenueOrders.reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0);

    // Build Response
    const responseData = {
        id: merchant.id,
        name: merchant.name,
        status: merchant.status,
        region: merchant.regions ? {
            id: merchant.regions.id,
            name: merchant.regions.name,
            state: merchant.regions.state,
            country: merchant.regions.country,
            status: merchant.regions.status
        } : null,
        venues: venues.map((v: any) => ({
            id: v.id,
            name: v.name,
            address: v.address,
            isActive: v.is_active
        })),
        events: events.slice(0, 10).map((e: any) => ({
            id: e.id,
            title: e.title,
            status: e.status,
            startAt: e.created_at,
            endAt: null
        })),
        members: members.map((m: any) => {
            const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
            return {
                id: m.id,
                role: m.role,
                isActive: m.is_active,
                user: profile ? {
                    id: profile.id,
                    name: profile.display_name || 'Unknown',
                    email: memberEmails[profile.id] || 'Unknown Email', // Filled from auth
                    avatar: profile.avatar_url
                } : null,
                joinedAt: m.created_at
            };
        }),
        recentOrders: orders.slice(0, 20).map((o: any) => ({
            id: o.id,
            total: (o.amount_cents || 0) / 100,
            status: o.status,
            createdAt: o.created_at
        })),
        stats: {
            totalOrders,
            totalRevenue: totalRevenue / 100,
            totalRevenueFormatted: `$${(totalRevenue / 100).toLocaleString()}`,
            venuesCount: venues.length,
            eventsCount: events.length,
            membersCount: members.length
        },
        createdAt: merchant.created_at,
        updatedAt: merchant.updated_at
    };

    return NextResponse.json<ApiResponse>({
        ok: true,
        data: responseData,
        step
    });

  } catch (error: any) {
    console.error('[ADMIN MERCHANT DETAIL] Error:', error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: 'Internal Error', code: 'INTERNAL_ERROR', message: error.message, step },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/admin/merchants/[id]
 * Update merchant information (name, regionId, status)
 */
export const PATCH = handlerWrapper(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const debugId = randomUUID().substring(0, 8);
  let step = 'init';

  try {
    step = 'auth_check';
    const authResult = await requireAdmin(request);
    
    if ('status' in authResult) {
      return authResult.response;
    }

    const { adminClient } = authResult;
    const { id } = await params;

    step = 'read_body';
    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Invalid Body', code: 'INVALID_BODY', message: 'Invalid JSON', step },
        { status: 400 }
      );
    }

    step = 'validate';
    const { name, regionId, status } = body;
    if (!name && !regionId && !status) {
       return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Missing Fields', code: 'MISSING_FIELDS', message: 'No fields to update', step },
        { status: 400 }
      );
    }

    step = 'update';
    const payload: any = {};
    if (name) payload.name = name.trim();
    if (regionId) payload.region_id = regionId;
    if (status) payload.status = status;

    const { data: updated, error: updateError } = await adminClient
      .from('merchants')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: updated,
      step
    });

  } catch (error: any) {
      return NextResponse.json<ApiResponse>(
      { ok: false, error: 'Internal Error', code: 'INTERNAL_ERROR', message: error.message, step },
      { status: 500 }
    );
  }
});
