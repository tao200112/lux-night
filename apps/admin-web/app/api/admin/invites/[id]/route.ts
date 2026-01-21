/**
 * GET /api/admin/invites/[id]
 * Admin Invite Detail API
 * 返回单个邀请码详情
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const InviteIdSchema = z.string().uuid('inviteId must be a valid UUID');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: inviteIdParam } = await params;
    
    // 验证 inviteId 格式
    const inviteIdValidation = InviteIdSchema.safeParse(inviteIdParam);
    if (!inviteIdValidation.success) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: `Invalid inviteId: ${inviteIdValidation.error.errors.map(e => e.message).join(', ')}` },
        { status: 400 }
      );
    }
    const inviteId = inviteIdValidation.data;
    
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
    
    // 使用 admin client 查询（绕过 RLS）
    const adminClient = createAdminClient();
    
    // 获取邀请码详情
    const { data: invite, error: inviteError } = await adminClient
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
      `)
      .eq('id', inviteId)
      .single();
    
    if (inviteError || !invite) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Invite not found' },
        { status: 404 }
      );
    }
    
    // 获取地区信息
    let region = null;
    if (invite.region_id) {
      const { data: regionData } = await adminClient
        .from('regions')
        .select('id, name, state, country')
        .eq('id', invite.region_id)
        .single();
      
      if (regionData) {
        region = {
          id: regionData.id,
          name: regionData.name,
          state: regionData.state,
          country: regionData.country,
        };
      }
    }
    
    // 获取创建者信息
    let createdBy = null;
    if (invite.created_by) {
      const { data: creatorData } = await adminClient
        .from('profiles')
        .select('id, display_name, avatar_url, email')
        .eq('id', invite.created_by)
        .single();
      
      if (creatorData) {
        createdBy = {
          id: creatorData.id,
          name: creatorData.display_name || 'Unknown',
          email: creatorData.email,
          avatar: creatorData.avatar_url,
        };
      }
    }
    
    // 获取使用者信息
    let usedBy = null;
    if (invite.redeemed_by) {
      const { data: userData } = await adminClient
        .from('profiles')
        .select('id, display_name, avatar_url, email')
        .eq('id', invite.redeemed_by)
        .single();
      
      if (userData) {
        usedBy = {
          id: userData.id,
          name: userData.display_name || 'Unknown',
          email: userData.email,
          avatar: userData.avatar_url,
        };
      }
    }
    
    // 计算状态
    const now = new Date();
    const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null;
    const isExpired = expiresAt !== null && expiresAt < now;
    const isUsed = invite.used_count >= invite.max_uses;
    const isRevoked = invite.revoked_at !== null || invite.disabled;
    const isActive = !isRevoked && !isUsed && !isExpired && invite.is_active;
    
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
    
    // 格式化 token
    const token = invite.token.toUpperCase();
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
        intendedRole: invite.intended_role,
        maxUses: invite.max_uses,
        usedCount: invite.used_count,
        expiresAt: invite.expires_at,
        revokedAt: invite.revoked_at,
        disabled: invite.disabled,
        status,
        createdAt: invite.created_at,
        createdBy,
        usedBy,
        usedAt: invite.redeemed_at,
        region,
        merchant: invite.merchants && (Array.isArray(invite.merchants) ? invite.merchants[0] : invite.merchants) ? {
          id: Array.isArray(invite.merchants) ? invite.merchants[0].id : invite.merchants.id,
          name: Array.isArray(invite.merchants) ? invite.merchants[0].name : invite.merchants.name,
        } : null,
        note: invite.note,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN INVITE DETAIL API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
