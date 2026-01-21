/**
 * POST /api/admin/merchants/[id]/status
 * Admin Update Merchant Status API
 * 更新商家状态（必须写 audit_logs）
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
    const { status, reason } = body;
    
    if (!status || !['active', 'suspended', 'closed'].includes(status)) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: 'Invalid status' },
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
    
    // 获取商家当前状态
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('*')
      .eq('id', id)
      .single();
    
    if (merchantError || !merchant) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Merchant not found' },
        { status: 404 }
      );
    }
    
    if (merchant.status === status) {
      return NextResponse.json(
        { success: false, code: 'INVALID_STATUS', message: 'Merchant already has this status' },
        { status: 400 }
      );
    }
    
    const beforeState = { status: merchant.status };
    const afterState = { status };
    
    // 更新商家状态
    const { error: updateError } = await supabase
      .from('merchants')
      .update({ status })
      .eq('id', id);
    
    if (updateError) {
      throw updateError;
    }
    
    // 写 audit log
    await supabase.rpc('log_audit', {
      p_action: 'update_merchant_status',
      p_entity_type: 'merchant',
      p_entity_id: id,
      p_before_state: beforeState,
      p_after_state: afterState,
      p_metadata: { reason: reason || null },
    });
    
    return NextResponse.json({
      success: true,
      data: {
        id,
        status,
        message: 'Merchant status updated successfully',
      },
    });
  } catch (error: any) {
    console.error('[ADMIN MERCHANT STATUS API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
