/**
 * POST /api/admin/settings/regions
 * Admin Create/Update Region Settings API
 *
 * Create: { name, place_id } — 必须用地址选择器选 place_id
 * Update 地址: { regionId, place_id }
 * Update 状态: { regionId, status?, reason? }
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getPlaceDetails, slugFromName } from '@/lib/places';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

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

    if (body.regionId && body.place_id) {
      return await updateRegionAddress(body);
    }
    if (body.regionId) {
      return await updateRegionStatus(body);
    }
    if (body.name) {
      return await createRegion(body);
    }
    return NextResponse.json(
      { success: false, code: 'VALIDATION_ERROR', message: 'For create: name and place_id required. For update: regionId and optionally place_id or status.' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[ADMIN SETTINGS REGIONS API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}

async function updateRegionAddress(body: { regionId: string; place_id: string }) {
  const { regionId, place_id } = body;
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json(
      { success: false, code: 'CONFIG', message: 'GOOGLE_MAPS_API_KEY not configured. Set it in .env to update region address.' },
      { status: 503 }
    );
  }
  const details = await getPlaceDetails(place_id.trim());
  if (!details) {
    return NextResponse.json(
      { success: false, code: 'INVALID_PLACE', message: 'Invalid place_id or Places API error' },
      { status: 400 }
    );
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('regions')
    .update({
      city: details.city || null,
      state: details.state || null,
      country: details.country || null,
      lat: details.lat || null,
      lng: details.lng || null,
      center_lat: details.lat || null,
      center_lng: details.lng || null,
    })
    .eq('id', regionId)
    .select('id, name, slug, city, state, country, center_lat, center_lng')
    .single();
  if (error) {
    return NextResponse.json(
      { success: false, code: 'UPDATE_FAILED', message: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true, data, message: 'Region address updated' });
}

async function createRegion(body: { name?: string; place_id?: string }) {
  const name = body.name?.trim();
  const place_id = body.place_id?.trim();

  if (!name) {
    return NextResponse.json(
      { success: false, code: 'VALIDATION_ERROR', message: 'Region name is required' },
      { status: 400 }
    );
  }
  if (!place_id) {
    return NextResponse.json(
      { success: false, code: 'VALIDATION_ERROR', message: 'Base address is required. Use the address search to select a place.' },
      { status: 400 }
    );
  }
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json(
      { success: false, code: 'CONFIG', message: 'GOOGLE_MAPS_API_KEY not configured. Set it in .env to add regions with address.' },
      { status: 503 }
    );
  }

  const details = await getPlaceDetails(place_id);
  if (!details) {
    return NextResponse.json(
      { success: false, code: 'INVALID_PLACE', message: 'Invalid place_id or Places API error' },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();
  let slug = slugFromName(name);
  const { data: existingSlug } = await adminClient.from('regions').select('id').eq('slug', slug).maybeSingle();
  if (existingSlug) slug = `${slug}-${Date.now().toString(36)}`;

  const { data: newRegion, error: createError } = await adminClient
    .from('regions')
    .insert({
      name,
      slug,
      city: details.city || null,
      state: details.state || null,
      country: details.country || 'US',
      lat: details.lat || null,
      lng: details.lng || null,
      center_lat: details.lat || null,
      center_lng: details.lng || null,
      is_active: true,
      status: 'Operational',
    })
    .select()
    .single();

  if (createError || !newRegion) {
    console.error('[CREATE REGION] Error:', createError);
    if (createError?.code === '23505') {
      return NextResponse.json(
        { success: false, code: 'DUPLICATE_REGION', message: `Region "${name}" or slug already exists` },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, code: 'CREATE_FAILED', message: createError?.message || 'Failed to create region' },
      { status: 500 }
    );
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.rpc('log_audit', {
        p_action: 'create_region',
        p_entity_type: 'region',
        p_entity_id: newRegion.id,
        p_before_state: null,
        p_after_state: { name: newRegion.name, state: newRegion.state, country: newRegion.country, city: newRegion.city },
        p_metadata: null,
      });
    }
  } catch (auditError) {
    console.warn('[CREATE REGION] Audit log failed:', auditError);
  }

  return NextResponse.json({
    success: true,
    data: {
      id: newRegion.id,
      name: newRegion.name,
      slug: newRegion.slug,
      state: newRegion.state,
      country: newRegion.country,
      city: newRegion.city,
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
