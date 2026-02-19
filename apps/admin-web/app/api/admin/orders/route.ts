/**
 * GET /api/admin/orders
 * Admin Orders List API
 * 
 * Update 2026-02-01:
 * - Uses orders.merchant_id for filtering (Direct & Fast).
 * - returns Invite & Ambassador info.
 * - returns merchantOptions based on actual data.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  handlerWrapper,
  requireAdmin,
  withTimeout,
  type ApiResponse,
} from '@/lib/admin/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 20000;

export const GET = handlerWrapper(async (request: NextRequest): Promise<NextResponse> => {
  let step = 'init';

  try {
    // STEP 1: Auth
    step = 'auth_check';
    const authResult = await withTimeout(requireAdmin(request), TIMEOUT_MS, 'requireAdmin');
    if ('status' in authResult) return authResult.response;
    const { adminClient } = authResult;

    // STEP 2: Params
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || '';
    const merchantId = searchParams.get('merchantId') || '';
    const dateRange = searchParams.get('dateRange') || '7';

    // Dates
    const now = new Date();
    const daysAgo = parseInt(dateRange) || 30; // Default to 30 for better visibility
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

    // STEP 3: Query Orders
    step = 'query_orders';
    
    let query = adminClient
      .from('orders')
      .select(`
        id, status, amount_cents, user_id, 
        created_at, currency, 
        merchant_id, invite_id, ambassador_id, invite_code
      `)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);

    if (status && status !== 'all') query = query.eq('status', status);
    if (merchantId && merchantId !== 'all') query = query.eq('merchant_id', merchantId);

    const { data: orders, error: ordersError } = await withTimeout(Promise.resolve(query), TIMEOUT_MS, 'orders query');
    
    if (ordersError) throw ordersError;
    const rawOrders = orders || [];

    // STEP 4: Fetch Metadata
    step = 'fetch_metadata';
    
    const userIds = [...new Set(rawOrders.map((o: any) => o.user_id).filter(Boolean))];
    const merchantIds = [...new Set(rawOrders.map((o: any) => o.merchant_id).filter(Boolean))];
    const inviteIds = [...new Set(rawOrders.map((o: any) => o.invite_id).filter(Boolean))];
    const itemOrderIds = rawOrders.map((o: any) => o.id);

    // Batch Fetches (use RPC for auth.users email - more reliable than schema('auth') across Supabase configs)
    const pProfiles = userIds.length > 0 ? adminClient.from('profiles').select('id, display_name').in('id', userIds) : Promise.resolve({ data: [] });
    const pAuthEmails = userIds.length > 0
      ? adminClient.rpc('get_user_emails', { p_user_ids: userIds }).then((r: any) => ({ data: r.data || [] }))
      : Promise.resolve({ data: [] });
    
    const pMerchants = merchantIds.length > 0 ? adminClient.from('merchants').select('id, name').in('id', merchantIds) : Promise.resolve({ data: [] });
    
    // Invites with Ambassadors
    const pInvites = inviteIds.length > 0 
        ? adminClient.from('ambassador_invites').select('id, code, ambassador:ambassadors(display_name)').in('id', inviteIds) 
        : Promise.resolve({ data: [] });

    // Order Items (still needed for validity dates)
    const pItems = itemOrderIds.length > 0
        ? adminClient.from('order_items').select('order_id, valid_start_at, valid_end_at, ticket_type_v2_id').in('order_id', itemOrderIds)
        : Promise.resolve({ data: [] });

    const [profilesRes, authEmailsRes, merchantsRes, invitesRes, itemsRes] = await Promise.all([
        pProfiles, pAuthEmails, pMerchants, pInvites, pItems
    ]);

    // Lookup Maps (auth email from RPC get_user_emails - auth.users registration email)
    const authMap = (authEmailsRes.data || []).reduce((acc: any, row: any) => {
      acc[row.user_id] = row.email || null;
      return acc;
    }, {} as Record<string, string | null>);
    const profilesMap = (profilesRes.data || []).reduce((acc: any, p: any) => { acc[p.id] = p; return acc; }, {});
    const merchantsMap = (merchantsRes.data || []).reduce((acc: any, m: any) => { acc[m.id] = m; return acc; }, {});
    const invitesMap = (invitesRes.data || []).reduce((acc: any, i: any) => { acc[i.id] = i; return acc; }, {});
    
    const itemsByOrder: Record<string, any[]> = {};
    (itemsRes.data || []).forEach((item: any) => {
        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
        itemsByOrder[item.order_id].push(item);
    });

    // STEP 5: Assemble
    step = 'assemble';
    const formattedOrders = rawOrders.map((order: any) => {
        // Merchant
        const merchant = merchantsMap[order.merchant_id];
        const merchantName = merchant ? merchant.name : 'Unknown';
        
        // Invite
        const invite = invitesMap[order.invite_id];
        // @ts-ignore
        const ambassadorName = invite?.ambassador?.display_name;
        
        // Buyer
        const buyerName = profilesMap[order.user_id]?.display_name || 'Unknown User';
        const buyerEmail = (authMap[order.user_id] && String(authMap[order.user_id]).trim()) || 'Unknown Email';
        
        // Dates (From Items)
        const items = itemsByOrder[order.id] || [];
        let minStart: number | null = null;
        let maxEnd: number | null = null;
        items.forEach((item: any) => {
             if (item.valid_start_at) {
                 const t = new Date(item.valid_start_at).getTime();
                 if (minStart === null || t < minStart) minStart = t;
             }
             if (item.valid_end_at) {
                 const t = new Date(item.valid_end_at).getTime();
                 if (maxEnd === null || t > maxEnd) maxEnd = t;
             }
        });
        
        // If unlinked or legacy, use created_at
        let dateRangeDisplay = 'Unknown Date';
        if (minStart) {
            const d1 = new Date(minStart).toLocaleDateString();
            const d2 = maxEnd ? new Date(maxEnd).toLocaleDateString() : '';
            dateRangeDisplay = (d2 && d1 !== d2) ? `${d1} - ${d2}` : d1;
        } else {
             dateRangeDisplay = new Date(order.created_at).toLocaleDateString();
        }

        return {
            id: order.id,
            status: order.status,
            amount: order.amount_cents || 0,
            amountFormatted: `$${((order.amount_cents || 0) / 100).toFixed(2)}`,
            created_at: order.created_at,
            
            buyer: { name: buyerName, email: buyerEmail, id: order.user_id },
            
            merchant: { id: order.merchant_id, name: merchantName },
            invite: invite ? { code: invite.code, ambassadorName: ambassadorName || 'Unknown Ambassador' } : null,
            
            dateRangeDisplay,
            
            // UI Helper
            merchantDisplay: { type: order.merchant_id ? 'single' : 'unknown', label: merchantName },
            
            // Legacy compat
            customerName: buyerName,
            customerEmail: buyerEmail
        };
    });

    // Merchant Options for Filter
    // Just map the merchants we found
    const merchantOptions = Object.values(merchantsMap).map((m: any) => ({ id: m.id, name: m.name }));

    step = 'success';
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        orders: formattedOrders,
        count: formattedOrders.length,
        merchantOptions
      },
      step
    });

  } catch (error: any) {
    console.error('[ADMIN ORDERS] Error', error);
      return NextResponse.json<ApiResponse>(
      {
        ok: false,
        error: 'Internal Server Error',
        code: 'INTERNAL_ERROR',
        message: error.message || 'Unexpected error',
        step,
      },
      { status: 500 }
    );
  }
});
