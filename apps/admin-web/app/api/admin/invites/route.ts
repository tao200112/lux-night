/**
 * GET /api/admin/invites
 * Admin Invites List API
 * 返回邀请码列表（支持筛选）
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Zod schema for query validation
const InvitesQuerySchema = z.object({
  status: z.enum(['all', 'active', 'used', 'expired', 'revoked']).optional(),
  region_id: z.string().uuid().optional(),
  merchant_id: z.string().uuid().optional(),
  role: z.enum(['owner', 'manager', 'staff', 'admin']).optional(),
  q: z.string().optional(), // search query
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 检查 Admin 权限
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' },
        { status: 401 }
      );
    }
    
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', message: 'Must be admin' },
        { status: 403 }
      );
    }
    
    // 获取并验证查询参数
    const searchParams = request.nextUrl.searchParams;
    const queryParams = {
      status: searchParams.get('status') || 'all',
      region_id: searchParams.get('region_id') || undefined,
      merchant_id: searchParams.get('merchant_id') || undefined,
      role: searchParams.get('role') || undefined,
      q: searchParams.get('q') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '50',
    };
    
    const validationResult = InvitesQuerySchema.safeParse(queryParams);
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ') },
        { status: 400 }
      );
    }
    
    const { status, region_id, merchant_id, role, q, page, limit } = validationResult.data;
    
    // 使用 admin client 查询（绕过 RLS）
    const adminClient = createAdminClient();
    
    // 构建查询
    let invitesQuery = adminClient
      .from('invites')
      .select(`
        id,
        token,
        intended_role,
        max_uses,
        used_count,
        expires_at,
        disabled,
        is_active,
        created_at,
        created_by,
        note,
        region_id,
        merchant_id,
        redeemed_by,
        redeemed_at,
        revoked_at,
        merchants(
          id,
          name
        )
      `, { count: 'exact' })
      .eq('issued_by_type', 'admin'); // 只显示 admin 创建的邀请码
    
    // 搜索筛选（code, merchant name）
    if (q) {
      invitesQuery = invitesQuery.or(`token.ilike.%${q}%,merchants.name.ilike.%${q}%`);
    }
    
    // 状态筛选
    if (status === 'active') {
      invitesQuery = invitesQuery
        .eq('is_active', true)
        .eq('disabled', false)
        .is('revoked_at', null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        // used_count < max_uses 在应用层过滤
    } else if (status === 'used') {
      // used_count >= max_uses 在应用层过滤
    } else if (status === 'revoked') {
      invitesQuery = invitesQuery.not('revoked_at', 'is', null);
    } else if (status === 'expired') {
      invitesQuery = invitesQuery
        .not('expires_at', 'is', null)
        .lt('expires_at', new Date().toISOString())
        .is('revoked_at', null)
        // used_count < max_uses 在应用层过滤
    }
    
    // 其他筛选
    if (region_id) {
      invitesQuery = invitesQuery.eq('region_id', region_id);
    }
    if (merchant_id) {
      invitesQuery = invitesQuery.eq('merchant_id', merchant_id);
    }
    if (role) {
      invitesQuery = invitesQuery.eq('intended_role', role);
    }
    
    // 分页
    const offset = (page - 1) * limit;
    invitesQuery = invitesQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    const { data: invites, error: invitesError, count } = await invitesQuery;
    
    if (invitesError) {
      console.error('[ADMIN INVITES API] Error:', invitesError);
      return NextResponse.json(
        { success: false, code: 'QUERY_ERROR', message: invitesError.message },
        { status: 500 }
      );
    }
    
    // 获取地区信息（批量）
    const regionIds = [...new Set((invites || []).map((invite: any) => invite.region_id).filter(Boolean))];
    const { data: regionsData } = await adminClient
      .from('regions')
      .select('id, name, state, country')
      .in('id', regionIds);
    
    const regionMap: Record<string, any> = {};
    (regionsData || []).forEach((region: any) => {
      regionMap[region.id] = region;
    });
    
    // 获取创建者和使用者信息（批量）
    const creatorIds = [...new Set((invites || []).map((invite: any) => invite.created_by).filter(Boolean))];
    const usedByIds = [...new Set((invites || []).map((invite: any) => invite.redeemed_by).filter(Boolean))];
    const allUserIds = [...new Set([...creatorIds, ...usedByIds])];
    
    const { data: users } = await adminClient
      .from('profiles')
      .select('id, display_name, avatar_url, email')
      .in('id', allUserIds);
    
    const userMap: Record<string, any> = {};
    (users || []).forEach((user: any) => {
      userMap[user.id] = user;
    });
    
    // 处理邀请码数据（应用层状态过滤）
    let filteredInvites = invites || [];
    
    // 应用层状态过滤（用于无法在SQL中表达的复杂条件）
    if (status === 'active') {
      filteredInvites = filteredInvites.filter((invite: any) => {
        return invite.used_count < invite.max_uses;
      });
    } else if (status === 'used') {
      filteredInvites = filteredInvites.filter((invite: any) => {
        return invite.used_count >= invite.max_uses;
      });
    } else if (status === 'expired') {
      filteredInvites = filteredInvites.filter((invite: any) => {
        return invite.used_count < invite.max_uses;
      });
    }
    
    const invitesWithDetails = filteredInvites.map((invite: any) => {
      const now = new Date();
      const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null;
      const isExpired = expiresAt !== null && expiresAt < now;
      const isUsed = invite.used_count >= invite.max_uses;
      const isRevoked = invite.revoked_at !== null || invite.disabled;
      const isActive = !isRevoked && !isUsed && !isExpired && invite.is_active;
      
      // 确定状态
      let status: 'active' | 'used' | 'expired' | 'revoked';
      if (isRevoked) {
        status = 'revoked';
      } else if (isUsed) {
        status = 'used';
      } else if (isExpired) {
        status = 'expired';
      } else {
        status = 'active';
      }
      
      const creator = invite.created_by ? userMap[invite.created_by] : null;
      const usedBy = invite.redeemed_by ? userMap[invite.redeemed_by] : null;
      const region = invite.region_id ? regionMap[invite.region_id] : null;
      
      // 格式化 token（每3位加横线）
      const token = invite.token.toUpperCase();
      const formattedToken = token.match(/.{1,3}/g)?.join('-') || token;
      
      return {
        id: invite.id,
        token,
        formattedToken,
        intendedRole: invite.intended_role,
        maxUses: invite.max_uses,
        usedCount: invite.used_count,
        expiresAt: invite.expires_at,
        revokedAt: invite.revoked_at,
        disabled: invite.disabled,
        status,
        createdAt: invite.created_at,
        createdBy: creator ? {
          id: creator.id,
          name: creator.display_name || 'Unknown',
          email: creator.email,
          avatar: creator.avatar_url,
        } : null,
        usedBy: usedBy ? {
          id: usedBy.id,
          name: usedBy.display_name || 'Unknown',
          email: usedBy.email,
          avatar: usedBy.avatar_url,
        } : null,
        usedAt: invite.redeemed_at,
        region: region ? {
          id: region.id,
          name: region.name,
          state: region.state,
          country: region.country,
        } : null,
        merchant: (() => {
          if (!invite.merchants) return null;
          const merchantData = Array.isArray(invite.merchants) ? invite.merchants[0] : invite.merchants;
          return merchantData ? {
            id: merchantData.id,
            name: merchantData.name,
          } : null;
        })(),
        note: invite.note,
      };
    });
    
    // 重新计算总数（因为应用层过滤）
    const actualTotal = status === 'all' ? (count || 0) : invitesWithDetails.length;
    
    return NextResponse.json({
      success: true,
      data: {
        items: invitesWithDetails,
        total: actualTotal,
        page,
        limit,
        totalPages: Math.ceil(actualTotal / limit),
      },
    });
  } catch (error: any) {
    console.error('[ADMIN INVITES API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/invites
 * Create new admin invite code
 */
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

export async function POST(request: NextRequest) {
  const debugId = randomUUID().substring(0, 8);
  
  // 环境自检
  const envCheck = {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  
  console.log('[ADMIN INVITES CREATE]', {
    debugId,
    step: 'env.check',
    ...envCheck,
  });
  
  try {
    const supabase = await createClient();
    
    // 检查 Admin 权限
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    console.log('[ADMIN INVITES CREATE]', {
      debugId,
      step: 'auth.getUser',
      ok: !!user && !authError,
      hasUser: !!user,
      userId: user?.id || null,
      userEmail: user?.email || null,
      authError: authError ? {
        message: authError.message,
        code: authError.status,
      } : null,
    });
    
    if (!user) {
      return NextResponse.json(
        { 
          success: false, 
          code: 'UNAUTHENTICATED', 
          message: 'Must be logged in',
          debugId,
          step: 'auth.getUser',
        },
        { status: 401 }
      );
    }
    
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json(
        { 
          success: false, 
          code: 'FORBIDDEN', 
          message: 'Must be admin',
          debugId,
          step: 'auth.checkAdmin',
        },
        { status: 403 }
      );
    }
    
    // 读取请求体
    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      console.log('[ADMIN INVITES CREATE]', {
        debugId,
        step: 'request.readBody',
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_REQUEST',
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
    
    const { type, region, expiresAt, expiresDays, note, merchantId } = body;
    
    // 打印请求体信息
    const merchantIdRaw = merchantId ? String(merchantId) : null;
    const merchantIdType = typeof merchantId;
    const merchantIdIsValid = merchantId ? isValidUuid(merchantId) : false;
    
    console.log('[ADMIN INVITES CREATE]', {
      debugId,
      step: 'request.body',
      type,
      region,
      merchantId: merchantId || null,
      merchantIdRaw,
      merchantIdType,
      merchantIdIsValid,
      intendedRole: type ? (type === 'Staff' ? 'staff' : 'owner') : null,
      issuedByType: 'admin',
    });
    
    // 映射 type 到 intended_role
    const roleMap: Record<string, string> = {
      'VIP Access': 'owner',
      'General': 'owner',
      'Staff': 'staff',
    };
    const intendedRole = roleMap[type] || 'owner';
    
    // 解析 merchant_id（从 body 或需要从其他地方获取）
    let merchantIdFinal: string | null = null;
    let merchantIdSource = 'none';
    
    // 如果 body 中有 merchantId，使用它
    if (merchantId) {
      merchantIdFinal = merchantId;
      merchantIdSource = 'request.body';
    }
    
    // 验证 merchant_id（如果提供了）
    if (merchantIdFinal) {
      if (!isValidUuid(merchantIdFinal)) {
        console.log('[ADMIN INVITES CREATE]', {
          debugId,
          step: 'validate.uuid',
          ok: false,
          merchantIdFinal,
          merchantIdFinalIsValid: false,
        });
        return NextResponse.json(
          {
            success: false,
            code: 'INVALID_MERCHANT_ID',
            message: `Invalid merchant_id format: ${merchantIdFinal}. merchant_id must be a valid UUID.`,
            debugId,
            step: 'validate.uuid',
            details: {
              merchantId: merchantIdFinal,
              merchantIdType: typeof merchantIdFinal,
            },
          },
          { status: 400 }
        );
      }
      
      // 验证 merchant 存在
      const { data: merchantData, error: merchantError } = await supabase
        .from('merchants')
        .select('id, name')
        .eq('id', merchantIdFinal)
        .single();
      
      if (merchantError || !merchantData) {
        console.log('[ADMIN INVITES CREATE]', {
          debugId,
          step: 'merchant.resolve',
          ok: false,
          merchantIdFinal,
          merchantError: merchantError?.message || 'Merchant not found',
        });
        return NextResponse.json(
          {
            success: false,
            code: 'MERCHANT_NOT_FOUND',
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
      
      console.log('[ADMIN INVITES CREATE]', {
        debugId,
        step: 'merchant.resolve',
        ok: true,
        merchantIdFromWorkspace: null,
        merchantIdFromUI: merchantId,
        merchantIdFromParams: null,
        merchantIdFinal,
        merchantName: merchantData.name,
      });
    } else {
      // 新规格：owner/manager 类型可以没有 merchantId（merchant 在 consume 时创建）
      // 只需要 regionId 即可
      console.log('[ADMIN INVITES CREATE]', {
        debugId,
        step: 'merchant.resolve',
        ok: true,
        merchantIdFromWorkspace: null,
        merchantIdFromUI: null,
        merchantIdFromParams: null,
        merchantIdFinal: null,
        intendedRole,
        note: 'Invite without merchantId - merchant will be created on consume',
      });
    }
    
    if (!region) {
      return NextResponse.json(
        { 
          success: false, 
          code: 'VALIDATION_ERROR', 
          message: 'Region is required',
          debugId,
          step: 'validate.region',
        },
        { status: 400 }
      );
    }
    
    // 验证 region 存在
    const { data: regionData, error: regionError } = await supabase
      .from('regions')
      .select('id, name')
      .eq('id', region)
      .single();
    
    if (regionError || !regionData) {
      return NextResponse.json(
        { 
          success: false, 
          code: 'NOT_FOUND', 
          message: 'Region not found',
          debugId,
          step: 'validate.region',
        },
        { status: 404 }
      );
    }
    
    // 生成唯一短码（6位数字+字母）
    let token = '';
    let tokenGenerated = false;
    
    // 如果 RPC 函数存在，尝试使用
    try {
      const { data: rpcToken, error: rpcError } = await supabase.rpc('generate_invite_token');
      if (!rpcError && rpcToken) {
        token = rpcToken;
        tokenGenerated = true;
      }
    } catch (rpcErr) {
      // RPC 不存在，使用客户端生成
    }
    
    // 如果 RPC 失败，使用客户端生成
    if (!tokenGenerated) {
      let exists = true;
      let attempts = 0;
      
      while (exists && attempts < 20) {
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let randomToken = '';
        for (let i = 0; i < 6; i++) {
          randomToken += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        token = randomToken;
        
        const adminClientForCheck = createAdminClient();
        const { data: existing } = await adminClientForCheck
          .from('invites')
          .select('id')
          .eq('token', token)
          .single();
        
        exists = !!existing;
        attempts++;
      }
      
      if (exists) {
        throw new Error('Failed to generate unique token after multiple attempts');
      }
    }
    
    // 计算过期时间
    let expiresAtValue: string | null = null;
    if (expiresAt) {
      expiresAtValue = new Date(expiresAt).toISOString();
    } else if (expiresDays && expiresDays > 0) {
      expiresAtValue = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();
    }
    
    // 创建邀请码（使用 admin client）
    const adminClient = createAdminClient();
    
    // 准备插入数据
    const insertData = {
      token,
      region_id: region,
      merchant_id: merchantIdFinal, // 使用验证后的 merchantIdFinal（可能是 null，但必须是有效的 UUID 或 null）
      venue_id: null,
      intended_role: intendedRole,
      issued_by_type: 'admin',
      max_uses: 1,
      used_count: 0,
      expires_at: expiresAtValue,
      disabled: false,
      is_active: true,
      created_by: user.id,
      note: note || (merchantIdFinal 
        ? `Admin-created invite for merchant ${merchantIdFinal}`
        : `Admin-created invite for ${regionData.name}`),
    };
    
    console.log('[ADMIN INVITES CREATE]', {
      debugId,
      step: 'db.insert',
      ok: false, // 将在插入后更新
      payload: {
        token,
        merchant_id: merchantIdFinal,
        intended_role: intendedRole,
        issued_by_type: 'admin',
      },
    });
    
    const { data: invite, error: insertError } = await adminClient
      .from('invites')
      .insert(insertData)
      .select()
      .single();
    
    console.log('[ADMIN INVITES CREATE]', {
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
      console.error('[ADMIN INVITES CREATE API] Error:', insertError);
      return NextResponse.json(
        { 
          success: false, 
          code: 'INSERT_ERROR', 
          message: insertError.message,
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
    
    // 获取地区信息用于返回
    const { data: regionInfo } = await adminClient
      .from('regions')
      .select('id, name')
      .eq('id', region)
      .single();
    
    // 格式化 token
    const formattedToken = token.match(/.{1,3}/g)?.join('-') || token;
    
    // 生成邀请链接
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const inviteLink = appUrl ? `${appUrl}/invite/${token}` : '';
    
    console.log('[ADMIN INVITES CREATE]', {
      debugId,
      step: 'response.ok',
      ok: true,
      inviteId: invite.id,
      token: invite.token,
      merchant_id: invite.merchant_id,
      intendedRole: intendedRole,
    });
    
    return NextResponse.json({
      success: true,
      data: {
        id: invite.id,
        token,
        formattedToken,
        inviteLink,
        regionId: invite.region_id,
        regionName: regionInfo?.name || null,
        merchantId: invite.merchant_id, // 返回 merchant_id
        expiresAt: invite.expires_at,
        intendedRole: intendedRole,
        createdAt: invite.created_at,
        message: 'Invite code created successfully',
      },
      debugId,
    });
  } catch (error: any) {
    const errorStack = error?.stack ? error.stack.substring(0, 500) : null;
    
    console.log('[ADMIN INVITES CREATE]', {
      debugId,
      step: 'catch.unhandled',
      ok: false,
      error: {
        name: error?.name || 'Unknown',
        message: error?.message || 'Unknown error',
        stack: errorStack,
      },
    });
    
    console.error('[ADMIN INVITES CREATE API] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        code: 'INTERNAL_ERROR', 
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
