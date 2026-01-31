/**
 * GET /api/admin/orders
 * Admin Orders List API
 * 
 * 强制修复版：确保所有分支都返回响应，绝不 pending
 * Uses decoupled queries to avoid 500 errors from missing relationships
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

const TIMEOUT_MS = 10000;

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
    const query = searchParams.get('query') || '';
    const status = searchParams.get('status') || '';
    const merchant = searchParams.get('merchant') || '';
    const dateRange = searchParams.get('dateRange') || '7';
    step = 'params_ok';

    // STEP 3: 计算时间范围
    step = 'calc_dates';
    const now = new Date();
    const daysAgo = parseInt(dateRange) || 7;
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    step = 'dates_ok';

    // STEP 4: 查询 Orders (Decoupled Phase 1: Base Orders + Events/Merchants)
    step = 'query_orders_base';
    
    // We do NOT join order_items -> ticket_types_v2 here to avoid relationship errors.
    // We keep events_v2 join as it's generally stable, but wrapped in try/catch via query error handling.
    // Base Select string
    let selectString = `
      id,
      status,
      amount_cents,
      user_id,
      stripe_payment_intent_id,
      created_at,
      merchant_id
    `;
    
    // Attempt to join events_v2 which links to merchants
    selectString += `,
      events_v2 (
        id,
        title,
        merchants (
          id,
          name
        )
      )
    `;

    let queryBuilder = adminClient
      .from('orders')
      .select(selectString);

    // Filter by Merchant ID
    if (merchant && merchant !== 'all') {
       // Re-initialize with !inner for filtering
       // Note: we must match the select structure or else TS/PostgREST might complain if fields missing
       queryBuilder = adminClient.from('orders').select(`
          id,
          status,
          amount_cents,
          user_id,
          stripe_payment_intent_id,
          created_at,
          merchant_id,
          events_v2!inner (
            id,
            title,
            merchants!inner (
              id,
              name
            )
          )
       `);
       queryBuilder = queryBuilder.eq('events_v2.merchant_id', merchant);
    } 

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

    step = 'orders_base_ok';

    // STEP 5: 查询关联数据 (Decoupled Phase 2: Items & Profiles)
    step = 'fetch_relations';
    const rawOrders = orders || [];
    const orderIds = rawOrders.map((o: any) => o.id);
    const userIds = [...new Set(rawOrders.map((o: any) => o.user_id).filter(Boolean))];

    // Parallel fetch: Items (raw) and User Profiles
    const [orderItemsResult, profilesResult] = await Promise.all([
      // 1. Order Items (Raw select, NO JOIN to ticket_types)
      orderIds.length > 0 
        ? adminClient.from('order_items').select('order_id, quantity, ticket_type_id_v2').in('order_id', orderIds)
        : Promise.resolve({ data: [], error: null }),
      
      // 2. Profiles
      userIds.length > 0
        ? adminClient.from('profiles').select('id, display_name, email').in('id', userIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    const orderItems = orderItemsResult.data || [];
    const profiles = profilesResult.data || [];

    const profilesMap = profiles.reduce((acc: any, p: any) => {
      acc[p.id] = p;
      return acc;
    }, {});

    // STEP 6: 查询 Ticket Types (Decoupled Phase 3: Ticket Types by ID)
    step = 'fetch_ticket_types';
    
    // Extract ticket type IDs from items
    const ticketTypeIds = [...new Set(orderItems.map((item: any) => item.ticket_type_id_v2).filter(Boolean))];
    
    let ticketTypesMap: Record<string, string> = {};
    
    if (ticketTypeIds.length > 0) {
       // Fetch ticket types cleanly by ID
       const { data: ticketTypes, error: ttError } = await adminClient
         .from('ticket_types_v2')
         .select('id, name')
         .in('id', ticketTypeIds);
       
       if (!ttError && ticketTypes) {
         ticketTypesMap = ticketTypes.reduce((acc: any, t: any) => {
           acc[t.id] = t.name;
           return acc;
         }, {});
       }
    }

    // STEP 7: 组装数据 (Merge all)
    step = 'assemble_data';
    
    // Group items by order
    const itemsByOrder: Record<string, any[]> = {};
    orderItems.forEach((item: any) => {
      // Resolve ticket name
      const name = ticketTypesMap[item.ticket_type_id_v2] || 'Unknown Ticket';
      
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push({
        ...item,
        ticket_type_name: name
      });
    });

    const formattedOrders = rawOrders.map((order: any) => {
      const profile = profilesMap[order.user_id];
      const items = itemsByOrder[order.id] || [];
      
      // Aggregate ticket names
      const ticketNames = items.map((i: any) => i.ticket_type_name);
      const uniqueTicketNames = Array.from(new Set(ticketNames));
      const ticketDisplay = uniqueTicketNames.length > 0 ? uniqueTicketNames.join(', ') : 'No Tickets';

      // Events info
      const eventData = Array.isArray(order.events_v2) ? order.events_v2[0] : order.events_v2;
      const merchantData = eventData?.merchants;
      const merchantName = merchantData?.name || 'Multiple Merchants';
      const eventTitle = eventData?.title || 'Unknown Event';

      return {
        id: order.id,
        status: order.status,
        amount: order.amount_cents || 0,
        amountFormatted: `$${((order.amount_cents || 0) / 100).toFixed(2)}`,
        userId: order.user_id,
        customerName: profile?.display_name || 'Anonymous',
        customerEmail: profile?.email || 'N/A',
        paymentIntentId: order.stripe_payment_intent_id,
        createdAt: order.created_at,
        ticketName: ticketDisplay,
        merchantName: merchantName,
        eventName: eventTitle
      };
    });

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
      },
      step,
    });

  } catch (error: any) {
    console.error('[ADMIN ORDERS GET] Error:', {
      step,
      error: error.message,
      stack: error.stack,
    });

    if (error.message?.includes('[TIMEOUT]')) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Request Timeout',
          code: 'TIMEOUT',
          message: error.message,
          step,
        },
        { status: 504 }
      );
    }

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
