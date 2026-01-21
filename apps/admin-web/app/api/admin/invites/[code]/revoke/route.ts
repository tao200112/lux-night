/**
 * POST /api/admin/invites/[code]/revoke
 * Admin Revoke Invite API
 * 撤销邀请码（必须写 audit_logs）
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
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
    
    // 规范化 token
    const normalizedToken = code.toUpperCase().trim();
    
    // 获取邀请码当前状态
    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*')
      .eq('token', normalizedToken)
      .eq('issued_by_type', 'admin')
      .single();
    
    if (inviteError || !invite) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Invite not found' },
        { status: 404 }
      );
    }
    
    if (invite.disabled) {
      return NextResponse.json(
        { success: false, code: 'ALREADY_REVOKED', message: 'Invite is already revoked' },
        { status: 400 }
      );
    }
    
    const beforeState = { disabled: invite.disabled, is_active: invite.is_active };
    const afterState = { disabled: true, is_active: false };
    
    // 更新邀请码状态
    const { error: updateError } = await supabase
      .from('invites')
      .update({ disabled: true, is_active: false })
      .eq('id', invite.id);
    
    if (updateError) {
      throw updateError;
    }
    
    // 写 audit log
    await supabase.rpc('log_audit', {
      p_action: 'revoke_invite',
      p_entity_type: 'invite',
      p_entity_id: invite.id,
      p_before_state: beforeState,
      p_after_state: afterState,
      p_metadata: { token: normalizedToken },
    });
    
    return NextResponse.json({
      success: true,
      data: {
        id: invite.id,
        token: normalizedToken,
        message: 'Invite code revoked successfully',
      },
    });
  } catch (error: any) {
    console.error('[ADMIN INVITES REVOKE API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
