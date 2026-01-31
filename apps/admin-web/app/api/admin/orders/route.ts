/**
 * GET /api/admin/orders
 * Admin Orders List API
 * 
 * 强制修复版：确保所有分支都返回响应，绝不 pending
 * Uses fully decoupled queries to avoid 500 errors from missing relationships.
 * Addresses:
 * 1. No 'merchant_id' in orders table.
 * 2. Missing 'event_v2_id' (Legacy/Unlinked).
 * 3. Profiles missing email (fetch from auth.users).
 * 4. Reliable ticket name aggregation.
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

const TIMEOUT_MS = 15000; // Build in buffer for multiple queries

export const GET = handlerWrapper(async (request: NextRequest): Promise<NextResponse> => {
  let step = 'init';

  try {
    // STEP 1: 权限检查
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

    // STEP 2: 获取查询参数
    step = 'parse_params';
    const searchParams = request.nextUrl.searchParams;
    // const query = searchParams.get('query') || ''; // Not implemented in this phase
    const status = searchParams.get('status') || '';
    // const merchant = searchParams.get('merchant') || ''; // Filtering by merchant requires advanced manual filtering if we decouple
    const dateRange = searchParams.get('dateRange') || '7';
    step = 'params_ok';

    // STEP 3: 计算时间范围
    step = 'calc_dates';
    const now = new Date();
    const daysAgo = parseInt(dateRange) || 7;
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    step = 'dates_ok';

    // STEP 4: 查询 Orders (Primary Query - NO JOINS)
    // Removed: merchant_id (does not exist)
    // Kept: event_v2_id (to link manually), user_id (to link manually)
    step = 'query_orders_base';
    
    let queryBuilder = adminClient
      .from('orders')
      .select(`
        id,
        status,
        amount_cents,
        user_id,
        stripe_payment_intent_id,
        created_at,
        event_v2_id,
        currency
      `);

    // Apply Time Filter (created_at)
    queryBuilder = queryBuilder.gte('created_at', startDate.toISOString());

    // Apply Status Filter
    if (status && status !== 'all') {
      queryBuilder = queryBuilder.eq('status', status);
    }
    
    // Order and Limit
    queryBuilder = queryBuilder
      .order('created_at', { ascending: false })
      .limit(100);

    const { data: orders, error: ordersError } = await withTimeout(
      Promise.resolve(queryBuilder),
      TIMEOUT_MS,
      'orders query'
    );

    if (ordersError) {
      console.error('[ADMIN ORDERS] Main query failed', ordersError);
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Database Error',
          code: 'QUERY_ERROR',
          message: ordersError.message,
          hint: 'Main orders query failed',
          route: '/api/admin/orders',
          step,
        },
        { status: 500 }
      );
    }

    const rawOrders = orders || [];
    step = 'orders_base_ok';

    // STEP 5: Collect IDs for batch fetching
    step = 'collect_ids';
    const orderIds = rawOrders.map((o: any) => o.id);
    const userIds = [...new Set(rawOrders.map((o: any) => o.user_id).filter(Boolean))];
    const eventV2Ids = [...new Set(rawOrders.map((o: any) => o.event_v2_id).filter(Boolean))];

    // STEP 6: Parallel Batch Fetches
    step = 'batch_fetches';
    
    // 6a. Order Items (to get tickets) - Use decoupled select
    const pOrderItems = orderIds.length > 0 
      ? adminClient.from('order_items').select('order_id, quantity, ticket_type_v2_id, ticket_type_id_v2').in('order_id', orderIds)
      : Promise.resolve({ data: [] });

    // 6b. Profiles (Display Name)
    const pProfiles = userIds.length > 0
      ? adminClient.from('profiles').select('id, display_name, avatar_url').in('id', userIds)
      : Promise.resolve({ data: [] });

    // 6c. Auth Users (Emails - Service Role required)
    const pAuthUsers = userIds.length > 0
      // @ts-ignore: schema('auth') is valid for service role client but types might be strict
      ? adminClient.schema('auth').from('users').select('id, email').in('id', userIds)
      : Promise.resolve({ data: [] });

    // 6d. Events V2
    const pEvents = eventV2Ids.length > 0
      ? adminClient.from('events_v2').select('id, title, merchant_id').in('id', eventV2Ids)
      : Promise.resolve({ data: [] });

    const [orderItemsRes, profilesRes, authUsersRes, eventsRes] = await Promise.all([
      pOrderItems, pProfiles, pAuthUsers, pEvents
    ]);

    // Handle Fetch Results
    const orderItems = orderItemsRes.data || [];
    const profiles = profilesRes.data || [];
    const authUsers = authUsersRes.data || [];
    const events = eventsRes.data || [];

    // STEP 7: Second Layer Fetches (Merchants & Ticket Types)
    step = 'layer2_fetches';

    // 7a. Get Merchant IDs from Events
    const merchantIds = [...new Set(events.map((e: any) => e.merchant_id).filter(Boolean))];
    
    // 7b. Get Ticket Type IDs from Order Items
    // Prioritize ticket_type_v2_id, fallback to ticket_type_id_v2
    const ticketTypeIds = [...new Set(orderItems.map((item: any) => item.ticket_type_v2_id || item.ticket_type_id_v2).filter(Boolean))];

    const [merchantsRes, ticketTypesRes] = await Promise.all([
      merchantIds.length > 0 
        ? adminClient.from('merchants').select('id, name').in('id', merchantIds)
        : Promise.resolve({ data: [] }),
      
      ticketTypeIds.length > 0
        ? adminClient.from('ticket_types_v2').select('id, name').in('id', ticketTypeIds)
        : Promise.resolve({ data: [] })
    ]);

    const merchants = merchantsRes.data || [];
    const ticketTypes = ticketTypesRes.data || [];

    // STEP 8: Create Lookup Maps
    step = 'create_maps';

    const eventsMap = events.reduce((acc: any, e: any) => { acc[e.id] = e; return acc; }, {});
    const merchantsMap = merchants.reduce((acc: any, m: any) => { acc[m.id] = m; return acc; }, {});
    const profilesMap = profiles.reduce((acc: any, p: any) => { acc[p.id] = p; return acc; }, {});
    const authUsersMap = authUsers.reduce((acc: any, u: any) => { acc[u.id] = u.email; return acc; }, {});
    const ticketTypesMap = ticketTypes.reduce((acc: any, t: any) => { acc[t.id] = t.name; return acc; }, {});

    // Group items by order
    const itemsByOrder: Record<string, any[]> = {};
    orderItems.forEach((item: any) => {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      
      const ttId = item.ticket_type_v2_id || item.ticket_type_id_v2;
      const name = ticketTypesMap[ttId] || 'Unknown Ticket';
      
      itemsByOrder[item.order_id].push({
        ...item,
        ticket_type_name: name
      });
    });

    // STEP 9: Assemble Final Data
    step = 'assemble';

    const formattedOrders = rawOrders.map((order: any) => {
      // 1. Resolve Event & Merchant
      const event = eventsMap[order.event_v2_id];
      const merchant = event ? merchantsMap[event.merchant_id] : null;

      const eventTitle = event ? event.title : 'Unlinked Order';
      const merchantName = merchant ? merchant.name : (event ? 'Unknown Merchant' : 'N/A');

      // 2. Resolve User
      const profile = profilesMap[order.user_id];
      const email = authUsersMap[order.user_id];
      
      const buyerName = profile?.display_name || 'Unknown User';
      const buyerEmail = email || 'Unknown Email';

      // 3. Resolve Tickets
      const items = itemsByOrder[order.id] || [];
      const ticketNames = items.map((i: any) => i.ticket_type_name);
      // Dedup ticket names
      const uniqueTicketNames = Array.from(new Set(ticketNames));
      const ticketDisplay = uniqueTicketNames.length > 0 ? uniqueTicketNames.join(', ') : 'No Tickets';

      return {
        id: order.id,
        status: order.status,
        amount: order.amount_cents || 0,
        amountFormatted: order.currency 
           ? new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currency }).format((order.amount_cents || 0) / 100)
           : `$${((order.amount_cents || 0) / 100).toFixed(2)}`,
        
        created_at: order.created_at,
        
        // Buyer Info
        buyer: {
          name: buyerName,
          email: buyerEmail,
          id: order.user_id
        },

        // Context Info
        eventTitle: eventTitle,
        merchantName: merchantName,
        ticketNames: ticketDisplay,

        // Legacy compatibility
        customerName: buyerName,
        customerEmail: buyerEmail,
        ticketName: ticketDisplay,
        eventName: eventTitle
      };
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        orders: formattedOrders,
        count: formattedOrders.length,
        dateRange: {
          start: startDate.toISOString(),
          end: now.toISOString(),
          days: daysAgo,
        },
      },
      step,
    });

  } catch (error: any) {
    console.error('[ADMIN ORDERS GET] Error:', {
      step,
      error: error.message,
      stack: error.stack,
    });

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
