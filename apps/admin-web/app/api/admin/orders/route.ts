/**
 * GET /api/admin/orders
 * Admin Orders List API
 * 
 * 强制修复版：确保所有分支都返回响应，绝不 pending
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

    // STEP 4: 查询 Orders
    step = 'query_orders';
    
    // Base Select string
    const selectString = `
      id,
      status,
      amount_cents,
      user_id,
      stripe_payment_intent_id,
      created_at,
      merchant_id,
      events_v2 (
        id,
        title,
        merchants (
          id,
          name
        )
      ),
      order_items (
         quantity,
         ticket_type_id_v2,
         ticket_types_v2 (
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
          ),
          order_items (
            quantity,
            ticket_type_id_v2,
            ticket_types_v2 (
              name
            )
          )
       `);
       // Apply filter on the joined table
       queryBuilder = queryBuilder.eq('events_v2.merchant_id', merchant);
    } 

    // Apply Time Filter
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
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Database Error',
          code: 'QUERY_ERROR',
          message: ordersError.message,
          hint: 'Check if orders table schema matches query',
          route: '/api/admin/orders',
          step,
        },
        { status: 500 }
      );
    }

    step = 'orders_ok';

    // STEP 5: Fetch user profiles separately (no FK dependency)
    step = 'fetch_profiles';
    const userIds = [...new Set((orders || []).map((o: any) => o.user_id).filter(Boolean))];
    let profilesMap: Record<string, any> = {};

    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await withTimeout(
        Promise.resolve(
          adminClient
            .from('profiles')
            .select('id, display_name, email')
            .in('id', userIds)
        ),
        TIMEOUT_MS,
        'profiles query'
      );

      if (!profilesError && profiles) {
        profilesMap = profiles.reduce((acc: any, p: any) => {
          acc[p.id] = p;
          return acc;
        }, {});
      }
    }

    step = 'profiles_ok';

    // STEP 6: 格式化响应
    step = 'format_response';
    const formattedOrders = (orders || []).map((order: any) => {
      const profile = profilesMap[order.user_id];
      
      // Extract Ticket Info
      const items = order.order_items || [];
      const ticketNames = items.map((item: any) => {
          // Try ticket_types_v2 name first, fallback to unknown
           return item.ticket_types_v2?.name || 'Unknown Ticket';
      }).filter((n: string) => n);
      const uniqueTicketNames = Array.from(new Set(ticketNames));
      const ticketDisplay = uniqueTicketNames.length > 0 ? uniqueTicketNames.join(', ') : 'Unknown';

      // Extract Merchant/Event Info
      // events_v2 might be an array or object depending on join, usually object if FK is singular
      const eventData = Array.isArray(order.events_v2) ? order.events_v2[0] : order.events_v2;
      const merchantData = eventData?.merchants;
      const merchantName = merchantData?.name || 'Multiple Merchants'; // Fallback if join failed
      const eventTitle = eventData?.title || 'Unknown Event';

      return {
        id: order.id,
        status: order.status,
        amount: order.amount_cents || 0,
        amountFormatted: `$${((order.amount_cents || 0) / 100).toFixed(2)}`,
        userId: order.user_id,
        customerName: profile?.display_name || 'Anonymous',
        customerEmail: profile?.email || 'N/A', // Show N/A if missing
        paymentIntentId: order.stripe_payment_intent_id,
        createdAt: order.created_at,
        // Added fields
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
