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
export async function POST(request: NextRequest) {
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
    
    const body = await request.json();
    const { type, region, expiresAt, expiresDays, note } = body;
    
    if (!region) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: 'Region is required' },
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
        { success: false, code: 'NOT_FOUND', message: 'Region not found' },
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
    
    // 映射 type 到 intended_role
    const roleMap: Record<string, string> = {
      'VIP Access': 'owner',
      'General': 'owner',
      'Staff': 'staff',
    };
    const intendedRole = roleMap[type] || 'owner';
    
    // 创建邀请码（使用 admin client）
    const adminClient = createAdminClient();
    const { data: invite, error: insertError } = await adminClient
      .from('invites')
      .insert({
        token,
        region_id: region,
        merchant_id: null,
        venue_id: null,
        intended_role: intendedRole,
        issued_by_type: 'admin',
        max_uses: 1,
        used_count: 0,
        expires_at: expiresAtValue,
        disabled: false,
        is_active: true,
        created_by: user.id,
        note: note || `Admin-created invite for ${regionData.name}`,
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('[ADMIN INVITES CREATE API] Error:', insertError);
      return NextResponse.json(
        { success: false, code: 'INSERT_ERROR', message: insertError.message },
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
    
    return NextResponse.json({
      success: true,
      data: {
        id: invite.id,
        token,
        formattedToken,
        inviteLink,
        regionId: invite.region_id,
        regionName: regionInfo?.name || null,
        expiresAt: invite.expires_at,
        intendedRole: intendedRole,
        createdAt: invite.created_at,
        message: 'Invite code created successfully',
      },
    });
  } catch (error: any) {
    console.error('[ADMIN INVITES CREATE API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
