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

    const { user, adminClient } = authResult;
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

    // STEP 3: 生成邀请码
    step = 'generate_code';
    const generateInviteCode = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 避免易混淆字符
      let code = '';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };

    let inviteCode = generateInviteCode();
    
    // 确保 code 唯一（最多尝试 3 次）
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: existing } = await adminClient
        .from('invites')
        .select('id')
        .eq('token', inviteCode)
        .single();
      
      if (!existing) break; // Code is unique
      inviteCode = generateInviteCode(); // Try again
    }

    step = 'code_generated';

    // STEP 4: 计算过期时间
    step = 'calc_expiry';
    const daysToExpire = expiresDays || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysToExpire);

    step = 'expiry_calculated';

    // STEP 5: 创建邀请记录
    step = 'insert_invite';
    const inviteData: any = {
      token: inviteCode,
      merchant_id: merchantId || null,
      region_id: regionId || null,
      intended_role: role || 'owner',
      issued_by_type: 'admin',
      max_uses: 1,
      used_count: 0,
      expires_at: expiresAt.toISOString(),
      disabled: false,
      is_active: true,
      created_by: user?.id || null,
      note: merchantId
        ? `Admin-created invite for merchant ${merchantId}`
        : `Admin-created invite for new merchant in region ${regionId}`,
    };

    const { data: invite, error: insertError } = await withTimeout(
      Promise.resolve(
        adminClient
          .from('invites')
          .insert(inviteData)
          .select()
          .single()
      ),
      TIMEOUT_MS,
      'insert invite'
    );

    if (insertError) {
      console.error('[ADMIN MERCHANTS POST] Insert error:', insertError);
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Database Error',
          code: 'INSERT_ERROR',
          message: insertError.message,
          hint: 'Check if invites table supports region_id when merchant_id is NULL',
          step,
        },
        { status: 500 }
      );
    }

    step = 'success';
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        invite: {
          id: invite.id,
          code: invite.token,
          token: invite.token, // Backward compatibility
          merchantId: invite.merchant_id,
          regionId: invite.region_id,
          role: invite.intended_role,
          expiresAt: invite.expires_at,
        },
      },
      step,
    });

  } catch (error: any) {
    console.error('[ADMIN MERCHANTS POST] Error:', {
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
