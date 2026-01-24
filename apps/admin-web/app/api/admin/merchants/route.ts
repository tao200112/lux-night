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
import { randomUUID } from 'crypto';

/**
 * 验证 UUID 格式（v1 或 v4）
 * @param v 待验证的值
 * @returns 是否为有效的 UUID
 */
function isValidUuid(v: any): boolean {
  if (!v || typeof v !== 'string') {
    return false;
  }
  
  // 检查是否为字符串 "null"
  if (v === 'null' || v === 'NULL') {
    return false;
  }
  
  // UUID v1/v4 格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(v);
}

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
  const debugId = randomUUID().substring(0, 8);
  let step = 'init';

  // 环境自检
  const envCheck = {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  
  console.log('[ADMIN MERCHANTS POST]', {
    debugId,
    step: 'env.check',
    ...envCheck,
  });

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
    
    console.log('[ADMIN MERCHANTS POST]', {
      debugId,
      step: 'auth.getUser',
      ok: !!user,
      hasUser: !!user,
      userId: user?.id || null,
      userEmail: user?.email || null,
    });

    // STEP 2: 读取请求体
    step = 'parse_body';
    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      console.log('[ADMIN MERCHANTS POST]', {
        debugId,
        step: 'request.readBody',
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Bad Request',
          code: 'INVALID_REQUEST',
          message: 'Invalid request body',
          step,
          debugId,
          details: {
            parseError: e instanceof Error ? e.message : String(e),
          },
        },
        { status: 400 }
      );
    }
    
    const { merchantId, regionId, role, expiresDays } = body;
    
    // 打印请求体信息
    const merchantIdRaw = merchantId ? String(merchantId) : null;
    const merchantIdType = typeof merchantId;
    const merchantIdIsValid = merchantId ? isValidUuid(merchantId) : false;
    
    console.log('[ADMIN MERCHANTS POST]', {
      debugId,
      step: 'request.body',
      merchantId: merchantId || null,
      merchantIdRaw,
      merchantIdType,
      merchantIdIsValid,
      regionId: regionId || null,
      role: role || 'owner',
      intendedRole: role || 'owner',
      issuedByType: 'admin',
    });

    if (!merchantId && !regionId) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Bad Request',
          code: 'VALIDATION_ERROR',
          message: 'Either merchantId or regionId is required',
          step,
          debugId,
        },
        { status: 400 }
      );
    }
    
    // 如果提供了 merchantId，验证它必须是有效的 UUID
    let merchantIdFinal: string | null = null;
    if (merchantId) {
      if (!isValidUuid(merchantId)) {
        console.log('[ADMIN MERCHANTS POST]', {
          debugId,
          step: 'validate.uuid',
          ok: false,
          merchantId,
          merchantIdIsValid: false,
        });
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: 'Bad Request',
            code: 'INVALID_MERCHANT_ID',
            message: `Invalid merchant_id format: ${merchantId}. merchant_id must be a valid UUID.`,
            step: 'validate.uuid',
            debugId,
            details: {
              merchantId,
              merchantIdType: typeof merchantId,
            },
          },
          { status: 400 }
        );
      }
      merchantIdFinal = merchantId;
      
      // 验证 merchant 存在
      const { data: merchantData, error: merchantError } = await adminClient
        .from('merchants')
        .select('id, name')
        .eq('id', merchantIdFinal)
        .single();
      
      console.log('[ADMIN MERCHANTS POST]', {
        debugId,
        step: 'merchant.resolve',
        ok: !merchantError && !!merchantData,
        merchantIdFinal,
        merchantName: merchantData?.name || null,
        merchantError: merchantError ? {
          message: merchantError.message,
          code: merchantError.code,
        } : null,
      });
      
      if (merchantError || !merchantData) {
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: 'Not Found',
            code: 'MERCHANT_NOT_FOUND',
            message: 'Merchant does not exist',
            step: 'merchant.resolve',
            debugId,
            details: {
              merchantId: merchantIdFinal,
            },
          },
          { status: 404 }
        );
      }
    } else {
      // 如果没有 merchantId，需要先创建 merchant
      if (!regionId) {
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: 'Bad Request',
            code: 'VALIDATION_ERROR',
            message: 'regionId is required when creating new merchant',
            step,
            debugId,
          },
          { status: 400 }
        );
      }
      
      // 验证 region 存在
      const { data: regionData, error: regionError } = await adminClient
        .from('regions')
        .select('id, name')
        .eq('id', regionId)
        .single();
      
      if (regionError || !regionData) {
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: 'Not Found',
            code: 'REGION_NOT_FOUND',
            message: 'Region does not exist',
            step: 'region.validate',
            debugId,
            details: {
              regionId,
            },
          },
          { status: 404 }
        );
      }
      
      // 创建新 merchant
      step = 'merchant.insert';
      const merchantName = `New Merchant - ${regionData.name} - ${new Date().toISOString().slice(0, 10)}`;
      
      console.log('[ADMIN MERCHANTS POST]', {
        debugId,
        step: 'merchant.insert',
        ok: false, // 将在插入后更新
        payload: {
          name: merchantName,
          region_id: regionId,
          status: 'active',
        },
      });
      
      const { data: newMerchant, error: merchantInsertError } = await adminClient
        .from('merchants')
        .insert({
          name: merchantName,
          region_id: regionId,
          status: 'active',
        })
        .select('id, name')
        .single();
      
      console.log('[ADMIN MERCHANTS POST]', {
        debugId,
        step: 'merchant.insert',
        ok: !!newMerchant && !merchantInsertError,
        newMerchantId: newMerchant?.id || null,
        newMerchantName: newMerchant?.name || null,
        merchantInsertError: merchantInsertError ? {
          message: merchantInsertError.message,
          code: merchantInsertError.code,
          details: merchantInsertError.details,
        } : null,
      });
      
      if (merchantInsertError || !newMerchant) {
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: 'Database Error',
            code: 'MERCHANT_INSERT_ERROR',
            message: merchantInsertError?.message || 'Failed to create merchant',
            step: 'merchant.insert',
            debugId,
            details: {
              merchantInsertError: merchantInsertError ? {
                message: merchantInsertError.message,
                code: merchantInsertError.code,
              } : null,
            },
          },
          { status: 500 }
        );
      }
      
      // 断言：merchantId 必须是有效 UUID
      if (!newMerchant.id || !isValidUuid(newMerchant.id)) {
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: 'Internal Server Error',
            code: 'MERCHANT_CREATE_MISSING_ID',
            message: 'Failed to get merchant ID after creation',
            step: 'merchant.create.missing_id',
            debugId,
            details: {
              newMerchantId: newMerchant.id,
              newMerchantIdIsValid: newMerchant.id ? isValidUuid(newMerchant.id) : false,
            },
          },
          { status: 500 }
        );
      }
      
      merchantIdFinal = newMerchant.id;
      
      console.log('[ADMIN MERCHANTS POST]', {
        debugId,
        step: 'merchant.resolve',
        ok: true,
        merchantIdFinal,
        merchantName: newMerchant.name,
        note: 'New merchant created',
      });
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
    // 断言：merchantIdFinal 必须是有效 UUID（不能是 null）
    if (!merchantIdFinal || !isValidUuid(merchantIdFinal)) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Internal Server Error',
          code: 'MERCHANT_CREATE_MISSING_ID',
          message: 'merchantId is required before creating invite',
          step: 'merchant.create.missing_id',
          debugId,
          details: {
            merchantIdFinal,
            merchantIdFinalIsValid: merchantIdFinal ? isValidUuid(merchantIdFinal) : false,
          },
        },
        { status: 500 }
      );
    }
    
    step = 'insert_invite';
    const inviteData: any = {
      token: inviteCode,
      merchant_id: merchantIdFinal, // 必须是有效 UUID（不能是 null）
      region_id: regionId || null,
      intended_role: role || 'owner',
      issued_by_type: 'admin',
      max_uses: 1,
      used_count: 0,
      expires_at: expiresAt.toISOString(),
      disabled: false,
      is_active: true,
      created_by: user?.id || null,
      note: `Admin-created invite for merchant ${merchantIdFinal}`,
    };
    
    console.log('[ADMIN MERCHANTS POST]', {
      debugId,
      step: 'invite.insert',
      ok: false, // 将在插入后更新
      payload: {
        token: inviteCode,
        merchant_id: merchantIdFinal,
        intended_role: role || 'owner',
        issued_by_type: 'admin',
      },
    });

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
    
    console.log('[ADMIN MERCHANTS POST]', {
      debugId,
      step: 'invite.insert',
      ok: !!invite && !insertError,
      inviteId: invite?.id || null,
      token: invite?.token || null,
      merchant_id: invite?.merchant_id || null,
      intended_role: invite?.intended_role || null,
      insertError: insertError ? {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
      } : null,
    });

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
          debugId,
          details: {
            insertError: {
              message: insertError.message,
              code: insertError.code,
            },
          },
        },
        { status: 500 }
      );
    }

    step = 'success';
    
    console.log('[ADMIN MERCHANTS POST]', {
      debugId,
      step: 'response.ok',
      ok: true,
      inviteId: invite.id,
      token: invite.token,
      merchant_id: invite.merchant_id,
      intendedRole: invite.intended_role,
    });
    
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
      debugId,
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
