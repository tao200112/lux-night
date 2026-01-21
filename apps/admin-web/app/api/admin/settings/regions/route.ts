/**
 * POST /api/admin/settings/regions
 * Admin Update Region Settings API
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

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
    const { regionId, status, reason } = body;
    
    if (!regionId) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: 'Region ID is required' },
        { status: 400 }
      );
    }
    
    if (status && !['Operational', 'Maintenance'].includes(status)) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: 'Invalid status' },
        { status: 400 }
      );
    }
    
    // 获取地区当前状态
    const { data: region, error: regionError } = await supabase
      .from('regions')
      .select('*')
      .eq('id', regionId)
      .single();
    
    if (regionError || !region) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Region not found' },
        { status: 404 }
      );
    }
    
    const beforeState = { status: region.status, is_active: region.is_active };
    const updateData: any = {};
    
    if (status) {
      updateData.status = status;
    }
    
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: 'No update data provided' },
        { status: 400 }
      );
    }
    
    // 更新地区
    const { error: updateError } = await supabase
      .from('regions')
      .update(updateData)
      .eq('id', regionId);
    
    if (updateError) {
      throw updateError;
    }
    
    // 写 audit log
    await supabase.rpc('log_audit', {
      p_action: 'update_region_status',
      p_entity_type: 'region',
      p_entity_id: regionId,
      p_before_state: beforeState,
      p_after_state: { ...beforeState, ...updateData },
      p_metadata: { reason: reason || null },
    });
    
    return NextResponse.json({
      success: true,
      data: {
        id: regionId,
        status: updateData.status,
        message: 'Region status updated successfully',
      },
    });
  } catch (error: any) {
    console.error('[ADMIN SETTINGS REGIONS API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
