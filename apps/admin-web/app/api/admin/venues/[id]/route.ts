/**
 * GET /api/admin/venues/[id] — 单条
 * PUT /api/admin/venues/[id] — 更新；允许 name、address_line1、address_line2、postal_code
 * 重构版：移除 Google Places API 依赖
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('venues')
      .select(`
        id, name, merchant_id, region_id, 
        address, formatted_address, address_line1, address_line2, 
        postal_code, is_active,
        region:regions(id, name, city, state),
        merchant:merchants(id, name)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: 'Venue not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error('[ADMIN VENUES GET id]', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/venues/[id]
 * 可更新字段：name, address_line1, address_line2, postal_code
 * region_id 由 DB trigger 自动从 merchant 继承，不允许手动修改
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    let body: { 
      name?: string; 
      address_line1?: string;
      address_line2?: string; 
      postal_code?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: 'JSON body required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const update: Record<string, unknown> = {};
    
    // 可更新的字段
    if (body.name !== undefined) {
      update.name = String(body.name).trim();
    }
    if (body.address_line1 !== undefined) {
      update.address_line1 = body.address_line1 === '' ? null : String(body.address_line1).trim();
      // 同步更新 address 和 formatted_address 用于展示
      if (update.address_line1) {
        update.address = update.address_line1;
      }
    }
    if (body.address_line2 !== undefined) {
      update.address_line2 = body.address_line2 === '' ? null : String(body.address_line2).trim();
    }
    if (body.postal_code !== undefined) {
      update.postal_code = body.postal_code === '' ? null : String(body.postal_code).trim();
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No allowed fields to update (name, address_line1, address_line2, postal_code)' 
      }, { status: 400 });
    }

    // 更新并获取关联的 region 信息
    const { data, error } = await admin
      .from('venues')
      .update(update)
      .eq('id', id)
      .select(`
        id, name, region_id, 
        address_line1, address_line2, formatted_address, postal_code,
        region:regions(id, name, city, state),
        merchant:merchants(id, name)
      `)
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 重新构建 formatted_address
    if (data && (body.address_line1 !== undefined || body.address_line2 !== undefined)) {
      const region = data.region as { city?: string; state?: string } | null;
      const formattedAddress = [
        data.address_line1,
        data.address_line2,
        region?.city,
        region?.state,
      ].filter(Boolean).join(', ');
      
      // 更新 formatted_address
      await admin
        .from('venues')
        .update({ formatted_address: formattedAddress })
        .eq('id', id);
    }

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error('[ADMIN VENUES PUT id]', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
