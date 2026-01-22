/**
 * POST /api/invite/consume
 * Internal Web - 邀请码兑换 API
 * 
 * 功能：
 * 1. 验证邀请码有效性（未禁用、未过期、未用尽）
 * 2. 创建 merchant_members 记录
 * 3. 更新邀请码使用计数和状态
 * 
 * 使用 Service Role Key 绕过 RLS
 * 
 * 数据库字段（invites 表）：
 * - token (text) - 邀请码
 * - merchant_id (uuid)
 * - venue_id (uuid)
 * - intended_role (text)
 * - max_uses (int), used_count (int)
 * - expires_at (timestamptz)
 * - disabled (bool), is_active (bool)
 * - redeemed_by (uuid), redeemed_at (timestamptz), revoked_at (timestamptz)
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

interface ConsumeInviteRequest {
  code: string;
}

interface ConsumeInviteResponse {
  success: boolean;
  error?: string;
  data?: {
    merchant_id: string;
    role: string;
    next: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // ============================================================
    // 1. 检查用户登录状态
    // ============================================================
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('[INVITE CONSUME] Unauthorized:', authError?.message);
      return NextResponse.json<ConsumeInviteResponse>(
        { success: false, error: 'Unauthorized. Please login first.' },
        { status: 401 }
      );
    }

    console.log('[INVITE CONSUME] User:', user.id, user.email);

    // ============================================================
    // 2. 读取并验证请求体
    // ============================================================
    let body: ConsumeInviteRequest;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json<ConsumeInviteResponse>(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { code } = body;
    
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return NextResponse.json<ConsumeInviteResponse>(
        { success: false, error: 'Invite code is required' },
        { status: 400 }
      );
    }

    const trimmedCode = code.trim();
    console.log('[INVITE CONSUME] Checking token:', trimmedCode);

    // ============================================================
    // 3. 使用 Service Role Key 查询邀请码（绕过 RLS）
    // ============================================================
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[INVITE CONSUME] Missing SUPABASE_SERVICE_ROLE_KEY');
      return NextResponse.json<ConsumeInviteResponse>(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const { createClient: createServiceClient } = await import('@supabase/supabase-js');
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // 查询邀请码 - 使用 token 字段和 maybeSingle()
    const { data: invite, error: inviteError } = await serviceSupabase
      .from('invites')
      .select('id, token, merchant_id, venue_id, intended_role, max_uses, used_count, expires_at, disabled, is_active, revoked_at')
      .eq('token', trimmedCode)
      .maybeSingle();

    if (inviteError) {
      console.error('[INVITE CONSUME] Invite query error:', inviteError);
      return NextResponse.json<ConsumeInviteResponse>(
        { success: false, error: 'Failed to verify invite code' },
        { status: 500 }
      );
    }

    if (!invite) {
      console.warn('[INVITE CONSUME] Invite not found for token:', trimmedCode);
      return NextResponse.json<ConsumeInviteResponse>(
        { success: false, error: 'Invalid invite code. Please check and try again.' },
        { status: 404 }
      );
    }

    console.log('[INVITE CONSUME] Found invite:', {
      id: invite.id,
      merchant_id: invite.merchant_id,
      intended_role: invite.intended_role,
      disabled: invite.disabled,
      is_active: invite.is_active,
      revoked_at: invite.revoked_at,
      expires_at: invite.expires_at,
      max_uses: invite.max_uses,
      used_count: invite.used_count,
    });

    // ============================================================
    // 4. 验证邀请码状态（使用新字段）
    // ============================================================
    
    // 检查是否被禁用
    if (invite.disabled === true) {
      console.warn('[INVITE CONSUME] Invite disabled');
      return NextResponse.json<ConsumeInviteResponse>(
        { success: false, error: 'This invite code has been disabled. Please contact your merchant owner.' },
        { status: 400 }
      );
    }

    // 检查是否非激活
    if (invite.is_active === false) {
      console.warn('[INVITE CONSUME] Invite not active');
      return NextResponse.json<ConsumeInviteResponse>(
        { success: false, error: 'This invite code is not active. Please contact your merchant owner.' },
        { status: 400 }
      );
    }

    // 检查是否已被撤销
    if (invite.revoked_at) {
      console.warn('[INVITE CONSUME] Invite revoked at:', invite.revoked_at);
      return NextResponse.json<ConsumeInviteResponse>(
        { success: false, error: 'This invite code has been revoked. Please contact your merchant owner.' },
        { status: 400 }
      );
    }

    // 检查是否过期
    if (invite.expires_at) {
      const expiresAt = new Date(invite.expires_at);
      const now = new Date();
      if (expiresAt < now) {
        console.warn('[INVITE CONSUME] Invite expired:', invite.expires_at);
        return NextResponse.json<ConsumeInviteResponse>(
          { success: false, error: 'This invite code has expired. Please request a new one.' },
          { status: 400 }
        );
      }
    }

    // 检查使用次数是否已用尽
    if (invite.max_uses !== null && invite.max_uses !== undefined) {
      const currentUsedCount = invite.used_count || 0;
      if (currentUsedCount >= invite.max_uses) {
        console.warn('[INVITE CONSUME] Invite usage exhausted:', {
          max_uses: invite.max_uses,
          used_count: currentUsedCount,
        });
        return NextResponse.json<ConsumeInviteResponse>(
          { success: false, error: 'This invite code has reached its maximum usage limit.' },
          { status: 400 }
        );
      }
    }

    // ============================================================
    // 5. 检查用户是否已经是该 merchant 的成员
    // ============================================================
    const { data: existingMembership, error: membershipCheckError } = await serviceSupabase
      .from('merchant_members')
      .select('id, role, is_active')
      .eq('user_id', user.id)
      .eq('merchant_id', invite.merchant_id)
      .maybeSingle();

    if (membershipCheckError) {
      console.error('[INVITE CONSUME] Membership check error:', membershipCheckError);
      return NextResponse.json<ConsumeInviteResponse>(
        { success: false, error: 'Failed to check existing membership' },
        { status: 500 }
      );
    }

    if (existingMembership) {
      console.warn('[INVITE CONSUME] User already member:', existingMembership);
      // 虽然已经是成员，但还是返回成功（幂等操作）
      return NextResponse.json<ConsumeInviteResponse>({
        success: true,
        data: {
          merchant_id: invite.merchant_id,
          role: existingMembership.role,
          next: '/workspaces',
        },
      });
    }

    // ============================================================
    // 6. 创建 merchant_member 记录
    // ============================================================
    // 使用 intended_role，为空则默认 'staff'
    const roleToAssign = invite.intended_role || 'staff';
    
    console.log('[INVITE CONSUME] Creating membership:', {
      merchant_id: invite.merchant_id,
      user_id: user.id,
      role: roleToAssign,
    });

    const { data: newMembership, error: memberError } = await serviceSupabase
      .from('merchant_members')
      .insert({
        merchant_id: invite.merchant_id,
        user_id: user.id,
        role: roleToAssign,
        is_active: true,
      })
      .select('id, merchant_id, role')
      .single();

    if (memberError) {
      console.error('[INVITE CONSUME] Failed to create membership:', memberError);
      return NextResponse.json<ConsumeInviteResponse>(
        { success: false, error: 'Failed to join merchant. Please try again.' },
        { status: 500 }
      );
    }

    console.log('[INVITE CONSUME] ✅ Membership created:', newMembership);

    // ============================================================
    // 7. 更新邀请码使用状态（使用新字段）
    // ============================================================
    const currentUsedCount = invite.used_count || 0;
    const newUsedCount = currentUsedCount + 1;
    const now = new Date().toISOString();

    // 构建更新对象
    const updateData: {
      used_count: number;
      redeemed_by: string;
      redeemed_at: string;
      is_active?: boolean;
      disabled?: boolean;
    } = {
      used_count: newUsedCount,
      redeemed_by: user.id,
      redeemed_at: now,
    };

    // 如果 max_uses 为 1 或递增后已用尽，禁用邀请码
    if (invite.max_uses !== null && invite.max_uses !== undefined) {
      if (invite.max_uses === 1 || newUsedCount >= invite.max_uses) {
        updateData.is_active = false;
        updateData.disabled = true;
        console.log('[INVITE CONSUME] Disabling invite (usage exhausted)');
      }
    }

    const { error: updateError } = await serviceSupabase
      .from('invites')
      .update(updateData)
      .eq('id', invite.id);

    if (updateError) {
      console.error('[INVITE CONSUME] Failed to update invite:', updateError);
      // 不返回错误，membership 已创建成功
    } else {
      console.log('[INVITE CONSUME] ✅ Invite updated:', {
        used_count: newUsedCount,
        redeemed_by: user.id,
        redeemed_at: now,
      });
    }

    // ============================================================
    // 8. 返回成功
    // ============================================================
    return NextResponse.json<ConsumeInviteResponse>({
      success: true,
      data: {
        merchant_id: invite.merchant_id,
        role: roleToAssign,
        next: '/workspaces',
      },
    });

  } catch (error: any) {
    console.error('[INVITE CONSUME] Unexpected error:', error);
    return NextResponse.json<ConsumeInviteResponse>(
      { success: false, error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
