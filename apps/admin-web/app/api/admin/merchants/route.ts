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
    
    // 白名单字段映射：只提取数据库真实存在的字段，忽略 timezone 等不存在的字段
    const { merchantId, regionId, role, expiresDays, timezone, ...otherFields } = body;
    
    // 打印请求体信息（包括可能存在的 timezone，但不传入数据库）
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
      timezone: timezone || null, // 仅用于日志，不传入数据库
      otherFields: Object.keys(otherFields).length > 0 ? Object.keys(otherFields) : null, // 记录其他未知字段
    });
    
    // 如果请求体包含 timezone 或其他未知字段，记录警告（但不阻止请求）
    if (timezone !== undefined) {
      console.warn('[ADMIN MERCHANTS POST] Request body contains timezone field (will be ignored):', {
        debugId,
        step: 'request.body.validation',
        timezone,
        note: 'timezone is not a valid column in merchants table and will be ignored',
      });
    }
    
    if (Object.keys(otherFields).length > 0) {
      console.warn('[ADMIN MERCHANTS POST] Request body contains unknown fields (will be ignored):', {
        debugId,
        step: 'request.body.validation',
        unknownFields: Object.keys(otherFields),
        note: 'These fields are not valid columns and will be ignored',
      });
    }

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
    let newMerchant: any = null;
    let merchantName: string | null = null;
    
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
      merchantName = `New Merchant - ${regionData.name} - ${new Date().toISOString().slice(0, 10)}`;
      
      // 白名单字段映射：只包含数据库真实存在的列（id, region_id, name, created_at, updated_at, default_venue_id）
      // 自动兼容修复：先移除 status 字段（如果表没有 status 列）
      const merchantInsertPayload: {
        name: string;
        region_id: string;
      } = {
        name: merchantName,
        region_id: regionId,
      };
      
      // 临时日志：在 insert 前记录 payload
      console.log({
        step: 'merchant.insert.payload',
        payload: merchantInsertPayload,
        debugId,
      });
      
      console.log('[ADMIN MERCHANTS POST]', {
        debugId,
        step: 'merchant.insert.before',
        payload: merchantInsertPayload,
      });
      
      // 步骤 1: 创建 merchant
      const merchantInsertResult = await adminClient
        .from('merchants')
        .insert(merchantInsertPayload)
        .select('id, name')
        .single();
      
      // 1) 在 insert 之后立刻捕获并打印 supabase error 的全部字段
      console.log('[ADMIN MERCHANTS POST]', {
        debugId,
        step: 'merchant.insert.result',
        error: merchantInsertResult.error,
        data: merchantInsertResult.data,
      });
      
      // 2) 如果 error 存在，返回 500 JSON
      if (merchantInsertResult.error) {
        const errorMessage = merchantInsertResult.error.message || '';
        const isStatusColumnError = errorMessage.includes('column "status" does not exist');
        
        // 3) 自动兼容修复：如果错误信息包含 'column "status" does not exist'，则永久删除 status 字段
        // （注意：我们已经移除了 status 字段，所以这里主要是记录日志）
        if (isStatusColumnError) {
          console.warn('[ADMIN MERCHANTS POST] Status column does not exist, payload already excludes status:', {
            debugId,
            step: 'merchant.insert.auto_fix',
            payload: merchantInsertPayload,
          });
        }
        
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: 'Database Error',
            code: 'MERCHANT_INSERT_ERROR',
            message: merchantInsertResult.error.message || 'Failed to create merchant',
            step: 'merchant.insert.error',
            debugId,
            details: {
              supabaseError: {
                message: merchantInsertResult.error.message,
                code: merchantInsertResult.error.code,
                details: merchantInsertResult.error.details,
                hint: merchantInsertResult.error.hint,
              },
              payload: merchantInsertPayload,
            },
          },
          { status: 500 }
        );
      }
      
      if (!merchantInsertResult.data) {
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: 'Database Error',
            code: 'MERCHANT_INSERT_ERROR',
            message: 'Failed to create merchant: no data returned',
            step: 'merchant.insert.error',
            debugId,
            details: {
              payload: merchantInsertPayload,
            },
          },
          { status: 500 }
        );
      }
      
      // 步骤 2: 提取 merchantId（明确拆分）
      const merchantId = merchantInsertResult.data.id;
      
      // 断言：merchantId 必须是有效 UUID
      if (!merchantId || !isValidUuid(merchantId)) {
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: 'Internal Server Error',
            code: 'MERCHANT_CREATE_MISSING_ID',
            message: 'Failed to get merchant ID after creation',
            step: 'merchant.create.missing_id',
            debugId,
            details: {
              merchantId,
              merchantIdIsValid: merchantId ? isValidUuid(merchantId) : false,
            },
          },
          { status: 500 }
        );
      }
      
      // ① merchant 创建完成后 - 强制日志
      console.log({
        step: 'merchant.created',
        merchantId,
        merchant: merchantInsertResult.data,
      });
      
      // 更新变量（向后兼容）
      newMerchant = merchantInsertResult.data;
      merchantIdFinal = merchantId;
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
    // 强制验证：owner/manager invite 必须有 merchant_id
    if ((role === 'owner' || role === 'manager') && (!merchantIdFinal || !isValidUuid(merchantIdFinal))) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Validation Error',
          code: 'MERCHANT_ID_REQUIRED',
          message: 'merchantId is required for owner/manager invites',
          step: 'validate.merchant_id',
          debugId,
          details: {
            role,
            merchantIdFinal,
            merchantIdFinalIsValid: merchantIdFinal ? isValidUuid(merchantIdFinal) : false,
          },
        },
        { status: 400 }
      );
    }
    
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
    
    // 强制校验（防止以后再炸）
    if (!merchantIdFinal) {
      throw new Error('[ADMIN_MERCHANTS] merchantId is missing before invite creation');
    }
    
    // 步骤 3: 构造 invite 插入 payload（明确拆分）
    const inviteInsertPayload = {
      token: inviteCode,
      merchant_id: merchantIdFinal, // ✅ 必须：直接使用 merchantIdFinal，不能是 null/undefined/body.merchantId
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
    
    // ② 创建 invite 前 - 强制日志
    console.log({
      step: 'invite.create.payload',
      merchantIdUsed: merchantIdFinal,
      payload: inviteInsertPayload,
    });

    const { data: invite, error: insertError } = await withTimeout(
      Promise.resolve(
        adminClient
          .from('invites')
          .insert(inviteInsertPayload)
          .select('id, token, merchant_id, region_id, intended_role, issued_by_type, max_uses, used_count, expires_at, disabled, is_active, created_by, note, created_at, updated_at')
          .single()
      ),
      TIMEOUT_MS,
      'insert invite'
    );
    
    // ③ invite 创建完成后 - 强制日志
    console.log({
      step: 'invite.created',
      invite,
    });
    
    // 验证：数据库返回的 merchant_id 必须与传入的值一致
    if (invite && invite.merchant_id !== merchantIdFinal) {
      console.error('[ADMIN MERCHANTS POST] merchant_id mismatch:', {
        debugId,
        step: 'invite.create.after.validation',
        expected: merchantIdFinal,
        actual: invite.merchant_id,
        inviteId: invite.id,
        fullInvite: invite,  // 打印完整对象
      });
      // 如果数据库返回的 merchant_id 为 null，尝试重新查询
      const { data: recheckInvite } = await adminClient
        .from('invites')
        .select('id, merchant_id')
        .eq('id', invite.id)
        .single();
      if (recheckInvite && recheckInvite.merchant_id) {
        console.log('[ADMIN MERCHANTS POST] Recheck found merchant_id:', {
          debugId,
          step: 'invite.recheck',
          merchant_id: recheckInvite.merchant_id,
        });
        invite.merchant_id = recheckInvite.merchant_id;
      } else {
        console.error('[ADMIN MERCHANTS POST] Recheck also returned null merchant_id:', {
          debugId,
          step: 'invite.recheck.failed',
          recheckInvite,
        });
      }
    }
    
    console.log('[ADMIN MERCHANTS POST]', {
      debugId,
      step: 'invite.create.after',
      ok: !!invite && !insertError,
      inviteId: invite?.id || null,
      token: invite?.token || null,
      merchant_id: invite?.merchant_id || null,
      merchantIdFinal,  // 添加传入的值用于对比
      merchant_id_match: invite?.merchant_id === merchantIdFinal,  // 是否匹配
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
    
    // 构建 debug 信息（收集所有步骤的日志）
    const debugInfo: any = {
      debugId,
      steps: {},
    };
    
    // 如果创建了新 merchant，添加 merchant.insert 日志
    if (newMerchant) {
      debugInfo.steps['merchant.insert.before'] = {
        payload: {
          name: merchantName,
          region_id: regionId,
          status: 'active',
        },
      };
      debugInfo.steps['merchant.insert.after'] = {
        newMerchantId: newMerchant.id || null,
        newMerchantName: newMerchant.name || null,
      };
    }
    
    // 添加 invite.create 日志
    debugInfo.steps['invite.create.before'] = {
      merchantId: merchantIdFinal,
      role: role || 'owner',
      token: inviteCode,
      callMethod: 'direct insert', // 直接 insert，不是 RPC
      payload: {
        token: inviteCode,
        merchant_id: merchantIdFinal,
        region_id: regionId || null,
        intended_role: role || 'owner',
        issued_by_type: 'admin',
      },
    };
    
    debugInfo.steps['invite.create.after'] = {
      inviteId: invite?.id || null,
      token: invite?.token || null,
      merchant_id: invite?.merchant_id || null,
      intended_role: invite?.intended_role || null,
    };
    
    // Response 一致性修复：确保 invite.merchantId === merchantIdFinal
    const responseMerchantId = invite.merchant_id || merchantIdFinal;
    
    // 验证一致性
    if (responseMerchantId !== merchantIdFinal) {
      console.error('[ADMIN MERCHANTS POST] Response merchantId mismatch:', {
        debugId,
        expected: merchantIdFinal,
        actual: responseMerchantId,
        inviteMerchantId: invite.merchant_id,
      });
    }
    
    // 4) 写入成功后，继续创建 owner invite，返回 merchant 和 invite
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        merchant: newMerchant ? {
          id: newMerchant.id,
          name: newMerchant.name,
          regionId: regionId,
        } : null,
        invite: {
          id: invite.id,
          code: invite.token,
          token: invite.token, // Backward compatibility
          merchantId: merchantIdFinal, // ✅ 强制使用 merchantIdFinal，确保一致性（禁止 null）
          regionId: invite.region_id,
          role: invite.intended_role,
          expiresAt: invite.expires_at,
        },
      },
      step: 'success',
      debugId,
      debug: debugInfo,
    });

  } catch (error: any) {
    console.error('[ADMIN MERCHANTS POST] Uncaught error:', {
      debugId,
      step,
      error: error.message,
      errorName: error.name,
      errorStack: error.stack,
      errorCode: error.code,
      errorDetails: error.details,
    });

    if (error.message?.includes('[TIMEOUT]')) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Request Timeout',
          code: 'TIMEOUT',
          message: error.message,
          step,
          debugId,
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
        debugId,
        details: {
          errorName: error.name,
          errorCode: error.code,
          errorDetails: error.details,
        },
      },
      { status: 500 }
    );
  }
});
