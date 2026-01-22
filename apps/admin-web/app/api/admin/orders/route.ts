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
    let ordersQuery = adminClient
      .from('orders')
      .select(`
        id,
        status,
        amount_cents,
        total_cents,
        customer_id,
        payment_intent_id,
        created_at,
        profiles!orders_customer_id_fkey(
          id,
          display_name,
          email
        )
      `)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(100); // 限制返回数量避免超时

    if (status && status !== 'all') {
      ordersQuery = ordersQuery.eq('status', status);
    }

    const { data: orders, error: ordersError } = await withTimeout(
      Promise.resolve(ordersQuery),
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
          step,
        },
        { status: 500 }
      );
    }

    step = 'orders_ok';

    // STEP 5: 格式化响应
    step = 'format_response';
    const formattedOrders = (orders || []).map((order: any) => ({
      id: order.id,
      status: order.status,
      amount: order.amount_cents || 0,
      total: order.total_cents || 0,
      totalFormatted: `$${((order.total_cents || 0) / 100).toFixed(2)}`,
      customerId: order.customer_id,
      customerName: order.profiles?.display_name || 'Unknown',
      customerEmail: order.profiles?.email || null,
      paymentIntentId: order.payment_intent_id,
      createdAt: order.created_at,
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
