/**
 * POST /api/admin/invites/create-merchant
 * Admin API: 创建商家邀请码（使用 service role）
 * 
 * 此 API 使用 SUPABASE_SERVICE_ROLE_KEY 直接操作数据库，
 * 不需要依赖 auth.uid()，可用于 seed 数据或管理员操作。
 */

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

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

export async function POST(req: Request) {
  const rl = await rateLimitOrResponse(req, rateLimitPolicies.loginOrInviteRedeem, { userId: 'anon' });
  if ('response' in rl) return rl.response;

  const debugId = randomUUID().substring(0, 8);
  
  // 环境自检
  const envCheck = {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  
  console.log('[ADMIN INVITES CREATE-MERCHANT]', {
    debugId,
    step: 'env.check',
    ...envCheck,
  });
  
  try {
    // 验证 service role key 存在
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceRoleKey || !supabaseUrl) {
      return NextResponse.json(
        { 
          error: 'MISSING_CONFIG', 
          message: 'Service role key or Supabase URL not configured',
          debugId,
          step: 'env.check',
        },
        { status: 500 }
      );
    }

    // 使用 service role 创建 Supabase client（绕过 RLS）
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      console.log('[ADMIN INVITES CREATE-MERCHANT]', {
        debugId,
        step: 'request.readBody',
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Invalid request body',
          debugId,
          step: 'request.readBody',
          details: {
            parseError: e instanceof Error ? e.message : String(e),
          },
        },
        { status: 400 }
      );
    }
    
    const { merchantId, regionId, token, role, maxUses, expiresDays, createdByUserId } = body;
    
    // 打印请求体信息
    const merchantIdRaw = merchantId ? String(merchantId) : null;
    const merchantIdType = typeof merchantId;
    const merchantIdIsValid = merchantId ? isValidUuid(merchantId) : false;
    
    console.log('[ADMIN INVITES CREATE-MERCHANT]', {
      debugId,
      step: 'request.body',
      merchantId: merchantId || null,
      merchantIdRaw,
      merchantIdType,
      merchantIdIsValid,
      regionId: regionId || null,
      role: role || 'owner',
      intendedRole: role?.toLowerCase() || 'owner',
      issuedByType: 'admin',
    });

    // 验证必填字段：必须有 merchantId 或 regionId
    if (!merchantId && !regionId) {
      return NextResponse.json(
        { 
          error: 'INVALID_REQUEST', 
          message: 'Either merchantId or regionId is required',
          debugId,
          step: 'validate.required',
        },
        { status: 400 }
      );
    }
    
    // 如果提供了 merchantId，验证它必须是有效的 UUID
    if (merchantId && !isValidUuid(merchantId)) {
      console.log('[ADMIN INVITES CREATE-MERCHANT]', {
        debugId,
        step: 'validate.uuid',
        ok: false,
        merchantId,
        merchantIdIsValid: false,
      });
      return NextResponse.json(
        {
          error: 'INVALID_MERCHANT_ID',
          message: `Invalid merchant_id format: ${merchantId}. merchant_id must be a valid UUID.`,
          debugId,
          step: 'validate.uuid',
          details: {
            merchantId,
            merchantIdType: typeof merchantId,
          },
        },
        { status: 400 }
      );
    }

    // 验证角色（admin 可以创建 owner/manager）
    const validRoles = ['owner', 'manager'];
    const normalizedRole = role?.toLowerCase() || 'owner';
    if (!validRoles.includes(normalizedRole)) {
      return NextResponse.json(
        { error: 'INVALID_ROLE', message: `Role must be one of: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    // 验证 merchant 存在（如果提供了 merchantId）
    let merchant: { id: string; name: string; region_id: string } | null = null;
    let merchantIdFinal: string | null = null;
    
    if (merchantId) {
      merchantIdFinal = merchantId; // 已验证是有效的 UUID
      
      const { data: merchantData, error: merchantError } = await supabaseAdmin
        .from('merchants')
        .select('id, name, region_id')
        .eq('id', merchantIdFinal)
        .single();

      console.log('[ADMIN INVITES CREATE-MERCHANT]', {
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
        return NextResponse.json(
          { 
            error: 'MERCHANT_NOT_FOUND', 
            message: 'Merchant does not exist',
            debugId,
            step: 'merchant.resolve',
            details: {
              merchantId: merchantIdFinal,
            },
          },
          { status: 404 }
        );
      }
      merchant = merchantData;
    } else {
      console.log('[ADMIN INVITES CREATE-MERCHANT]', {
        debugId,
        step: 'merchant.resolve',
        ok: true,
        merchantIdFinal: null,
        note: 'No merchantId provided (will create new merchant)',
      });
    }

    // 验证 region 存在（如果提供了 regionId，或者 merchantId 不存在时）
    let finalRegionId: string | null = null;
    if (regionId) {
      const { data: region, error: regionError } = await supabaseAdmin
        .from('regions')
        .select('id, name')
        .eq('id', regionId)
        .eq('is_active', true)
        .single();

      if (regionError || !region) {
        return NextResponse.json(
          { error: 'REGION_NOT_FOUND', message: 'Region does not exist or is inactive' },
          { status: 404 }
        );
      }
      finalRegionId = regionId;
    } else if (merchant) {
      // 如果只有 merchantId，使用 merchant 的 region_id
      finalRegionId = merchant.region_id;
    }

    // 规范化 token（如果提供）
    let normalizedToken: string;
    if (token) {
      normalizedToken = token.trim().toUpperCase();
      
      // 检查 token 是否已存在
      const { data: existing } = await supabaseAdmin
        .from('invites')
        .select('id')
        .eq('token', normalizedToken)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: 'TOKEN_EXISTS', message: 'Token already exists' },
          { status: 409 }
        );
      }
    } else {
      // 自动生成 token（格式: ROLE-YYYYMMDD-XXXX）
      let generatedToken: string;
      let attempts = 0;
      do {
        const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
        generatedToken = `${normalizedRole}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomPart}`;
        
        const { data: existing } = await supabaseAdmin
          .from('invites')
          .select('id')
          .eq('token', generatedToken)
          .single();
        
        if (!existing) {
          normalizedToken = generatedToken;
          break;
        }
        
        attempts++;
        if (attempts > 10) {
          return NextResponse.json(
            { error: 'TOKEN_GENERATION_FAILED', message: 'Failed to generate unique token' },
            { status: 500 }
          );
        }
      } while (true);
    }

    // 计算过期时间
    const expiresAt = expiresDays
      ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // 获取 created_by（优先使用传入的，否则查找系统用户）
    let createdBy: string | null = createdByUserId || null;
    if (!createdBy) {
      // 查找第一个 admin 用户
      const { data: adminUser } = await supabaseAdmin
        .from('admin_users')
        .select('user_id')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (adminUser?.user_id) {
        createdBy = adminUser.user_id;
      } else {
        // 如果没有 admin，查找第一个用户（使用 service role 的 auth.admin API）
        const { data: users } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1,
        });
        if (users?.users && users.users.length > 0) {
          createdBy = users.users[0].id;
        }
      }
    }

    // 插入邀请码（使用 service role 绕过 RLS）
    // 如果 merchantId 为空，则 merchant_id 为 NULL，region_id 必须提供
    const insertData = {
      token: normalizedToken,
      merchant_id: merchantIdFinal, // 使用验证后的 merchantIdFinal（可能是 null，但必须是有效的 UUID 或 null）
      region_id: finalRegionId || null, // region_id（用于创建新 merchant）
      venue_id: null,
      intended_role: normalizedRole,
      issued_by_type: 'admin',
      max_uses: maxUses || 999999,
      used_count: 0,
      expires_at: expiresAt,
      disabled: false,
      is_active: true,
      created_by: createdBy,
    };
    
    console.log('[ADMIN INVITES CREATE-MERCHANT]', {
      debugId,
      step: 'db.insert',
      ok: false, // 将在插入后更新
      payload: {
        token: normalizedToken,
        merchant_id: merchantIdFinal,
        intended_role: normalizedRole,
        issued_by_type: 'admin',
      },
    });
    
    const { data: invite, error: insertError } = await supabaseAdmin
      .from('invites')
      .insert(insertData)
      .select()
      .single();

    console.log('[ADMIN INVITES CREATE-MERCHANT]', {
      debugId,
      step: 'db.insert',
      ok: !!invite && !insertError,
      inviteId: invite?.id || null,
      token: invite?.token || null,
      merchant_id写入值: invite?.merchant_id || null,
      insertError: insertError ? {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
      } : null,
    });

    if (insertError) {
      console.error('Insert invite error:', insertError);
      return NextResponse.json(
        { 
          error: 'INSERT_FAILED', 
          message: insertError.message || 'Failed to create invite',
          debugId,
          step: 'db.insert',
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

    console.log('[ADMIN INVITES CREATE-MERCHANT]', {
      debugId,
      step: 'response.ok',
      ok: true,
      inviteId: invite.id,
      token: invite.token,
      merchant_id: invite.merchant_id,
      intendedRole: normalizedRole,
    });
    
    // 返回创建的邀请码信息
    return NextResponse.json({
      success: true,
      id: invite.id,
      token: invite.token,
      merchant_id: invite.merchant_id,
      merchant_name: merchant?.name || null,
      region_id: invite.region_id,
      role: invite.intended_role,
      issued_by_type: invite.issued_by_type,
      max_uses: invite.max_uses,
      expires_at: invite.expires_at,
      note: invite.merchant_id ? 'Bound to existing merchant' : 'Will create new merchant on redemption',
      debugId,
    });
  } catch (error: any) {
    const errorStack = error?.stack ? error.stack.substring(0, 500) : null;
    
    console.log('[ADMIN INVITES CREATE-MERCHANT]', {
      debugId,
      step: 'catch.unhandled',
      ok: false,
      error: {
        name: error?.name || 'Unknown',
        message: error?.message || 'Unknown error',
        stack: errorStack,
      },
    });
    
    console.error('Create merchant invite error:', error);
    return NextResponse.json(
      { 
        error: 'INTERNAL_ERROR', 
        message: error.message || 'An unexpected error occurred',
        debugId,
        step: 'catch.unhandled',
        details: {
          errorMessage: error?.message || 'Unknown error',
          errorName: error?.name,
        },
      },
      { status: 500 }
    );
  }
}
