/**
 * POST /api/invite/consume
 * Internal Web - 邀请码兑换 API
 * 
 * 功能：
 * 1. 验证邀请码有效性（未使用、未过期、状态active）
 * 2. 创建 merchant_members 记录
 * 3. 标记邀请码为已使用
 * 
 * 使用 Service Role Key 绕过 RLS
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
    console.log('[INVITE CONSUME] Checking code:', trimmedCode);

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

    // 查询邀请码
    const { data: invite, error: inviteError } = await serviceSupabase
      .from('invites')
      .select('id, code, merchant_id, role, status, used_by, used_at, expires_at')
      .eq('code', trimmedCode)
      .single();

    if (inviteError) {
      console.error('[INVITE CONSUME] Invite query error:', inviteError);
      if (inviteError.code === 'PGRST116') {
        // No rows returned
        return NextResponse.json<ConsumeInviteResponse>(
          { success: false, error: 'Invalid invite code. Please check and try again.' },
          { status: 404 }
        );
      }
      return NextResponse.json<ConsumeInviteResponse>(
        { success: false, error: 'Failed to verify invite code' },
        { status: 500 }
      );
    }

    if (!invite) {
      return NextResponse.json<ConsumeInviteResponse>(
        { success: false, error: 'Invalid invite code' },
        { status: 404 }
      );
    }

    console.log('[INVITE CONSUME] Found invite:', {
      id: invite.id,
      merchant_id: invite.merchant_id,
      status: invite.status,
      used_by: invite.used_by,
      expires_at: invite.expires_at,
    });

    // ============================================================
    // 4. 验证邀请码状态
    // ============================================================
    
    // 检查状态
    if (invite.status !== 'active') {
      console.warn('[INVITE CONSUME] Invite not active:', invite.status);
      return NextResponse.json<ConsumeInviteResponse>(
        { success: false, error: `Invite code is ${invite.status}. Please contact your merchant owner.` },
        { status: 400 }
      );
    }

    // 检查是否已被使用
    if (invite.used_by) {
      console.warn('[INVITE CONSUME] Invite already used by:', invite.used_by);
      return NextResponse.json<ConsumeInviteResponse>(
        { success: false, error: 'This invite code has already been used.' },
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

    // ============================================================
    // 5. 检查用户是否已经是该 merchant 的成员
    // ============================================================
    const { data: existingMembership, error: membershipCheckError } = await serviceSupabase
      .from('merchant_members')
      .select('id, role, is_active')
      .eq('user_id', user.id)
      .eq('merchant_id', invite.merchant_id)
      .maybeSingle(); // 使用 maybeSingle() 允许返回 null

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
    const roleToAssign = invite.role || 'staff';
    
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
    // 7. 标记邀请码为已使用
    // ============================================================
    const { error: updateError } = await serviceSupabase
      .from('invites')
      .update({
        status: 'used',
        used_by: user.id,
        used_at: new Date().toISOString(),
      })
      .eq('id', invite.id);

    if (updateError) {
      console.error('[INVITE CONSUME] Failed to mark invite as used:', updateError);
      // 不返回错误，membership 已创建成功
    } else {
      console.log('[INVITE CONSUME] ✅ Invite marked as used');
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
