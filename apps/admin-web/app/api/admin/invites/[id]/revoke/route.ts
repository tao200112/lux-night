/**
 * POST /api/admin/invites/[id]/revoke
 * Admin Revoke Invite API
 * 撤销邀请码
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const InviteIdSchema = z.string().uuid('inviteId must be a valid UUID');

export async function POST(
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
    
    // 获取邀请码当前状态
    const { data: invite, error: inviteError } = await adminClient
      .from('invites')
      .select('id, used_count, max_uses, revoked_at')
      .eq('id', inviteId)
      .single();
    
    if (inviteError || !invite) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Invite not found' },
        { status: 404 }
      );
    }
    
    // 检查是否已使用
    if (invite.used_count >= invite.max_uses) {
      return NextResponse.json(
        { success: false, code: 'CONFLICT', message: 'Cannot revoke an invite that has already been used' },
        { status: 409 }
      );
    }
    
    // 检查是否已撤销
    if (invite.revoked_at !== null) {
      return NextResponse.json(
        { success: false, code: 'CONFLICT', message: 'Invite has already been revoked' },
        { status: 409 }
      );
    }
    
    // 撤销邀请码
    const { data: updatedInvite, error: updateError } = await adminClient
      .from('invites')
      .update({
        revoked_at: new Date().toISOString(),
        disabled: true,
        is_active: false,
      })
      .eq('id', inviteId)
      .select()
      .single();
    
    if (updateError || !updatedInvite) {
      console.error('[ADMIN REVOKE INVITE API] Update error:', updateError);
      return NextResponse.json(
        { success: false, code: 'DB_ERROR', message: updateError?.message || 'Failed to revoke invite' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: {
        id: updatedInvite.id,
        revokedAt: updatedInvite.revoked_at,
        message: 'Invite revoked successfully',
      },
    });
  } catch (error: any) {
    console.error('[ADMIN REVOKE INVITE API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
