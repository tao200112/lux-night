/**
 * GET /api/admin/merchants
 * POST /api/admin/merchants
 * Admin Merchants API
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

const TIMEOUT_MS = 10000; // 10秒超时

// ============================================================
// GET /api/admin/merchants
// ============================================================

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
      // 401 或 403
      return authResult.response;
    }

    const { adminClient } = authResult;
    step = 'auth_ok';

    // STEP 2: 获取查询参数
    step = 'parse_params';
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    const region = searchParams.get('region') || '';
    const status = searchParams.get('status') || '';
    step = 'params_ok';

    // STEP 3: 查询 Merchants
    step = 'query_merchants';
    let merchantsQuery = adminClient
      .from('merchants')
      .select(`
        id,
        name,
        status,
        created_at,
        regions!inner(
          id,
          name,
          state,
          country
        )
      `)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      merchantsQuery = merchantsQuery.eq('status', status);
    }

    if (region) {
      merchantsQuery = merchantsQuery.eq('region_id', region);
    }

    if (query) {
      merchantsQuery = merchantsQuery.ilike('name', `%${query}%`);
    }

    const { data: merchants, error: merchantsError } = await withTimeout(
      Promise.resolve(merchantsQuery),
      TIMEOUT_MS,
      'merchants query'
    );

    if (merchantsError) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Database Error',
          code: 'QUERY_ERROR',
          message: merchantsError.message,
          step,
        },
        { status: 500 }
      );
    }

    step = 'merchants_ok';

    // STEP 4: 查询 Regions
    step = 'query_regions';
    const { data: regions, error: regionsError } = await withTimeout(
      Promise.resolve(
        adminClient
          .from('regions')
          .select('id, name, state, country')
          .eq('is_active', true)
          .order('name')
      ),
      TIMEOUT_MS,
      'regions query'
    );

    step = 'regions_ok';

    // STEP 5: 格式化响应
    step = 'format_response';
    const merchantsWithStats = (merchants || []).map((merchant: any) => ({
      id: merchant.id,
      name: merchant.name,
      status: merchant.status,
      region: merchant.regions && Array.isArray(merchant.regions) && merchant.regions.length > 0
        ? {
            id: merchant.regions[0].id,
            name: merchant.regions[0].name,
            state: merchant.regions[0].state,
            country: merchant.regions[0].country,
          }
        : null,
      stats: {
        ordersCount: 0, // TODO: 可选优化
        revenue: 0,
        revenueFormatted: '$0',
        activeEvents: 0,
      },
      createdAt: merchant.created_at,
    }));

    step = 'success';
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        merchants: merchantsWithStats,
        regions: regions || [],
      },
      step,
    });

  } catch (error: any) {
    console.error('[ADMIN MERCHANTS GET] Error:', {
      step,
      error: error.message,
      stack: error.stack,
    });

    // 超时错误
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

    // 其他错误
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

// ============================================================
// POST /api/admin/merchants
// ============================================================

export const POST = handlerWrapper(async (request: NextRequest): Promise<NextResponse> => {
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

    step = 'auth_ok';

    // STEP 2: 读取请求体
    step = 'parse_body';
    const body = await request.json();
    const { merchantId, regionId, role, expiresDays } = body;

    if (!merchantId && !regionId) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Bad Request',
          code: 'VALIDATION_ERROR',
          message: 'Either merchantId or regionId is required',
          step,
        },
        { status: 400 }
      );
    }

    step = 'validated';

    // TODO: 实现邀请码创建逻辑
    step = 'not_implemented';
    return NextResponse.json<ApiResponse>(
      {
        ok: false,
        error: 'Not Implemented',
        code: 'NOT_IMPLEMENTED',
        message: 'Merchant invite creation not yet implemented',
        step,
      },
      { status: 501 }
    );

  } catch (error: any) {
    console.error('[ADMIN MERCHANTS POST] Error:', {
      step,
      error: error.message,
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
