/**
 * GET /api/admin/orders
 * Admin Orders List API
 * 
 * Update:
 * 1. Supports 'merchantId' filter via Two-Stage Query (events -> items -> orders).
 * 2. Assembles Merchant/Date info from order_items (reliable).
 * 3. Returns merchantOptions for frontend filter.
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

const TIMEOUT_MS = 20000; // Increased buffer for two-stage queries

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
    const status = searchParams.get('status') || '';
    const merchantId = searchParams.get('merchantId') || '';
    const dateRange = searchParams.get('dateRange') || '7';
    step = 'params_ok';

    // STEP 3: 计算时间范围
    step = 'calc_dates';
    const now = new Date();
    const daysAgo = parseInt(dateRange) || 7;
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    step = 'dates_ok';

    // STEP 4: Pre-Filter by Merchant (Two-Stage Query)
    step = 'merchant_filter';
    let targetOrderIds: string[] | null = null;

    if (merchantId && merchantId !== 'all') {
        // 4a. Get all event IDs for this merchant
        const { data: mEvents } = await adminClient
            .from('events_v2')
            .select('id')
            .eq('merchant_id', merchantId);
        
        const mEventIds = (mEvents || []).map((e: any) => e.id);

        if (mEventIds.length > 0) {
            // 4b. Get order IDs linked to these events via order_items
            // Note: We use order_items because orders.event_v2_id might be null
            const { data: mItems } = await adminClient
                .from('order_items')
                .select('order_id')
                .in('event_id', mEventIds);
            
            targetOrderIds = [...new Set((mItems || []).map((i: any) => i.order_id))];
        } else {
            targetOrderIds = []; // Merchant has no events, so no orders
        }
    }

    // STEP 5: 查询 Orders (Primary Query)
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
    
    // Apply ID Filter (from Merchant Stage)
    if (targetOrderIds !== null) {
        if (targetOrderIds.length === 0) {
             // Optimization: If no orders match the merchant, return empty early
             return NextResponse.json<ApiResponse>({
                ok: true,
                data: { orders: [], count: 0, dateRange: {}, merchantOptions: [] },
                step: 'empty_result'
             });
        }
        queryBuilder = queryBuilder.in('id', targetOrderIds);
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

    if (ordersError) throw ordersError;

    const rawOrders = orders || [];
    step = 'orders_base_ok';

    // STEP 6: Collect IDs for batch fetching
    step = 'collect_ids';
    const orderIds = rawOrders.map((o: any) => o.id);
    const userIds = [...new Set(rawOrders.map((o: any) => o.user_id).filter(Boolean))];
    
    // Note: We don't rely on orders.event_v2_id for fetching events anymore, 
    // we'll get them from order_items -> event_id

    // STEP 7: Parallel Batch Fetches
    step = 'batch_fetches';
    
    // 7a. Order Items (CRITICAL: Fetch event_id and validity dates)
    const pOrderItems = orderIds.length > 0 
      ? adminClient.from('order_items').select('order_id, quantity, ticket_type_v2_id, event_id, valid_start_at, valid_end_at').in('order_id', orderIds)
      : Promise.resolve({ data: [] });

    // 7b. Profiles
    const pProfiles = userIds.length > 0
      ? adminClient.from('profiles').select('id, display_name, avatar_url').in('id', userIds)
      : Promise.resolve({ data: [] });

    // 7c. Auth Users
    const pAuthUsers = userIds.length > 0
      // @ts-ignore
      ? adminClient.schema('auth').from('users').select('id, email').in('id', userIds)
      : Promise.resolve({ data: [] });

    const [orderItemsRes, profilesRes, authUsersRes] = await Promise.all([
      pOrderItems, pProfiles, pAuthUsers
    ]);

    const orderItems = orderItemsRes.data || [];
    const profiles = profilesRes.data || [];
    const authUsers = authUsersRes.data || [];

    // STEP 8: Second Layer Fetches (Events & Merchants)
    step = 'layer2_fetches';

    // Extract Event IDs from Items
    const itemEventIds = [...new Set(orderItems.map((i: any) => i.event_id).filter(Boolean))];
    
    // Also include orders.event_v2_id as fallback
    const orderEventIds = rawOrders.map((o: any) => o.event_v2_id).filter(Boolean);
    const allEventIds = [...new Set([...itemEventIds, ...orderEventIds])];

    // Fetch Events
    const { data: eventsData } = allEventIds.length > 0
        ? await adminClient.from('events_v2').select('id, title, merchant_id').in('id', allEventIds)
        : { data: [] };
    
    const events = eventsData || [];
    
    // Fetch Merchants
    const merchantIds = [...new Set(events.map((e: any) => e.merchant_id).filter(Boolean))];
    const { data: merchantsData } = merchantIds.length > 0
        ? await adminClient.from('merchants').select('id, name').in('id', merchantIds)
        : { data: [] };

    const merchants = merchantsData || [];

    // Fetch Ticket Types (for names)
    const ticketTypeIds = [...new Set(orderItems.map((item: any) => item.ticket_type_v2_id).filter(Boolean))];
    const { data: ticketTypesData } = ticketTypeIds.length > 0
        ? await adminClient.from('ticket_types_v2').select('id, name').in('id', ticketTypeIds)
        : { data: [] };
    const ticketTypes = ticketTypesData || [];

    // STEP 9: Create Lookup Maps
    step = 'create_maps';

    const eventsMap = events.reduce((acc: any, e: any) => { acc[e.id] = e; return acc; }, {});
    const merchantsMap = merchants.reduce((acc: any, m: any) => { acc[m.id] = m; return acc; }, {});
    const profilesMap = profiles.reduce((acc: any, p: any) => { acc[p.id] = p; return acc; }, {});
    const authUsersMap = authUsers.reduce((acc: any, u: any) => { acc[u.id] = u.email; return acc; }, {});
    const ticketTypesMap = ticketTypes.reduce((acc: any, t: any) => { acc[t.id] = t.name; return acc; }, {});

    // Items by Order
    const itemsByOrder: Record<string, any[]> = {};
    orderItems.forEach((item: any) => {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      const name = ticketTypesMap[item.ticket_type_v2_id] || 'Unknown Ticket';
      itemsByOrder[item.order_id].push({ ...item, ticket_type_name: name });
    });

    // STEP 10: Assemble Final Data
    step = 'assemble';

    const formattedOrders = rawOrders.map((order: any) => {
      // Items for this order
      const items = itemsByOrder[order.id] || [];
      
      // A. Resolve Merchants (via items -> event -> merchant)
      const orderMerchantIds = new Set<string>();
      const orderMerchantNames = new Set<string>();
      let orderEventTitle = 'Unlinked Order'; // Fallback
      
      // Collect from items
      items.forEach((item: any) => {
          if (item.event_id && eventsMap[item.event_id]) {
              const evt = eventsMap[item.event_id];
              orderEventTitle = evt.title; // Last one wins, usually same event per order
              if (evt.merchant_id && merchantsMap[evt.merchant_id]) {
                  orderMerchantIds.add(evt.merchant_id);
                  orderMerchantNames.add(merchantsMap[evt.merchant_id].name);
              }
          }
      });
      
      // Fallback to order root event if items didn't yield anything
      if (orderMerchantIds.size === 0 && order.event_v2_id && eventsMap[order.event_v2_id]) {
          const evt = eventsMap[order.event_v2_id];
          orderEventTitle = evt.title;
           if (evt.merchant_id && merchantsMap[evt.merchant_id]) {
              orderMerchantIds.add(evt.merchant_id);
              orderMerchantNames.add(merchantsMap[evt.merchant_id].name);
          }
      }

      // Determine Display
      let merchantDisplay: { type: string; label: string; merchantId?: string } = {
          type: 'unknown',
          label: 'Unknown Merchant'
      };
      
      if (orderMerchantIds.size === 1) {
          const id = Array.from(orderMerchantIds)[0];
          const name = Array.from(orderMerchantNames)[0];
          merchantDisplay = { type: 'single', label: name, merchantId: id };
      } else if (orderMerchantIds.size > 1) {
          merchantDisplay = { type: 'multiple', label: 'Multiple Merchants' };
      }

      // B. Resolve Date Range
      // Using min(valid_start_at) and max(valid_end_at)
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
      
      let dateRangeDisplay = 'Unknown Date';
      if (minStart) { // At least start date
          const d1 = new Date(minStart).toLocaleDateString();
          const d2 = maxEnd ? new Date(maxEnd).toLocaleDateString() : '???';
          dateRangeDisplay = (d1 === d2) ? d1 : `${d1} - ${d2}`;
      } else {
           // Fallback to created_at if no validity dates (legacy orders)
           dateRangeDisplay = new Date(order.created_at).toLocaleDateString();
      }

      // C. User Info
      const profile = profilesMap[order.user_id];
      const email = authUsersMap[order.user_id];
      const buyerName = profile?.display_name || 'Unknown User';
      const buyerEmail = email || 'Unknown Email';

      // D. Ticket Display
      const uniqueTicketNames = Array.from(new Set(items.map((i: any) => i.ticket_type_name)));
      const ticketDisplay = uniqueTicketNames.length > 0 ? uniqueTicketNames.join(', ') : 'No Tickets';

      return {
        id: order.id,
        status: order.status,
        amount: order.amount_cents || 0,
        amountFormatted: order.currency 
           ? new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currency }).format((order.amount_cents || 0) / 100)
           : `$${((order.amount_cents || 0) / 100).toFixed(2)}`,
        created_at: order.created_at,
        
        buyer: { name: buyerName, email: buyerEmail, id: order.user_id },
        
        // Enhanced Info
        eventTitle: orderEventTitle,
        merchantDisplay,
        dateRangeDisplay,
        ticketNames: ticketDisplay,

        // Legacy compatibility
        customerName: buyerName,
        customerEmail: buyerEmail,
        ticketName: ticketDisplay,
        eventName: orderEventTitle
      };
    });

    // Extract Merchant Options for Filter
    // We return ALL merchants found in this batch. 
    // Ideally for a global filter we'd want ALL merchants in the system, but typically 'recent' is enough context.
    // Or we could fetch all active merchants if requested, but let's stick to "relevant to these orders" + "target merchant" if filtered.
    const merchantOptions = merchants.map((m: any) => ({
        id: m.id,
        name: m.name
    }));

    step = 'success';

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
        merchantOptions
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
