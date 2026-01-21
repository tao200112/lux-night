/**
 * POST /api/admin/approvals/[id]/reject
 * Admin Reject Request API
 * 审批拒绝：更新状态，写 audit_logs
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { note } = body;
    
    if (!note || note.trim().length === 0) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: 'Note is required' },
        { status: 400 }
      );
    }
    
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
    
    // 获取审批请求详情
    const { data: request, error: requestError } = await supabase
      .from('requests')
      .select('*')
      .eq('id', id)
      .single();
    
    if (requestError || !request) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Request not found' },
        { status: 404 }
      );
    }
    
    if (request.status !== 'pending') {
      return NextResponse.json(
        { success: false, code: 'INVALID_STATUS', message: 'Request is not pending' },
        { status: 400 }
      );
    }
    
    // 更新 request 状态为 rejected
    const { error: updateRequestError } = await supabase
      .from('requests')
      .update({
        status: 'rejected',
        admin_note: note,
        decided_by: user.id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', id);
    
    if (updateRequestError) {
      throw updateRequestError;
    }
    
    // 写 audit log
    await supabase.rpc('log_audit', {
      p_action: 'reject',
      p_entity_type: 'request',
      p_entity_id: id,
      p_before_state: { status: 'pending' },
      p_after_state: { status: 'rejected', admin_note: note },
      p_metadata: { note },
    });
    
    return NextResponse.json({
      success: true,
      data: {
        id,
        status: 'rejected',
        message: 'Request rejected successfully',
      },
    });
  } catch (error: any) {
    console.error('[ADMIN REJECT API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
