/**
 * POST /api/admin/settings/regions
 * Admin Create/Update Region Settings API
 * 
 * Create: { name, state?, country?, lat?, lng? }
 * Update: { regionId, status, reason? }
 */

import { createAdminClient } from '@/lib/supabase/admin';
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
    
    // 判断是创建还是更新：如果有name字段，则是创建；如果有regionId，则是更新
    if (body.name) {
      // 创建新地区
      return await createRegion(body);
    } else if (body.regionId) {
      // 更新地区状态
      return await updateRegionStatus(body);
    } else {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: 'Either name (for create) or regionId (for update) is required' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('[ADMIN SETTINGS REGIONS API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}

async function createRegion(body: any) {
  const { name, state, country, lat, lng } = body;
  
  if (!name || !name.trim()) {
    return NextResponse.json(
      { success: false, code: 'VALIDATION_ERROR', message: 'Region name is required' },
      { status: 400 }
    );
  }
  
  // 使用admin client绕过RLS
  const adminClient = createAdminClient();
  
  // 检查是否已存在（唯一约束：name, state, country）
  const { data: existing } = await adminClient
    .from('regions')
    .select('id, name')
    .eq('name', name.trim())
    .eq('state', state || null)
    .eq('country', country || 'US')
    .single();
  
  if (existing) {
    return NextResponse.json(
      { 
        success: false, 
        code: 'DUPLICATE_REGION', 
        message: `Region "${name}" already exists in ${state || ''} ${country || 'US'}` 
      },
      { status: 409 }
    );
  }
  
  // 创建新地区
  const { data: newRegion, error: createError } = await adminClient
    .from('regions')
    .insert({
      name: name.trim(),
      state: state || null,
      country: country || 'US',
      lat: lat || null,
      lng: lng || null,
      is_active: true,
      status: 'Operational', // 默认状态
    })
    .select()
    .single();
  
  if (createError || !newRegion) {
    console.error('[CREATE REGION] Error:', createError);
    
    // 处理唯一约束冲突
    if (createError?.code === '23505') {
      return NextResponse.json(
        { 
          success: false, 
          code: 'DUPLICATE_REGION', 
          message: `Region "${name}" already exists` 
        },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { 
        success: false, 
        code: 'CREATE_FAILED', 
        message: createError?.message || 'Failed to create region' 
      },
      { status: 500 }
    );
  }
  
  // 写 audit log
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.rpc('log_audit', {
        p_action: 'create_region',
        p_entity_type: 'region',
        p_entity_id: newRegion.id,
        p_before_state: null,
        p_after_state: { name: newRegion.name, state: newRegion.state, country: newRegion.country },
        p_metadata: null,
      });
    }
  } catch (auditError) {
    console.warn('[CREATE REGION] Audit log failed:', auditError);
    // 不阻断流程
  }
  
  return NextResponse.json({
    success: true,
    data: {
      id: newRegion.id,
      name: newRegion.name,
      state: newRegion.state,
      country: newRegion.country,
      status: newRegion.status || 'Operational',
      isActive: newRegion.is_active,
      message: 'Region created successfully',
    },
  });
}

async function updateRegionStatus(body: any) {
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
  
  const supabase = await createClient();
  
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
}
