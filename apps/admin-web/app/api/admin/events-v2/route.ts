/**
 * Admin Events V2 API
 * POST /api/admin/events-v2 - 创建活动
 * GET /api/admin/events-v2 - 获取活动列表
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin();
  if ('error' in authResult) {
    return authResult.error;
  }

  try {
    const body = await req.json();
    const { merchant_id, title, subtitle, description, poster_url, status = 'active', venue_name, address } = body;

    if (!merchant_id || !title || !poster_url) {
      return NextResponse.json(
        { error: 'Missing required fields: merchant_id, title, poster_url' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. 获取 Merchant 信息以自动绑定 Region 和 Venue
    const { data: merchantData, error: merchantError } = await supabase
      .from('merchants')
      .select(`
        id, 
        region_id, 
        venues:venues!venues_merchant_id_fkey(id)
      `)
      .eq('id', merchant_id)
      .single();

    if (merchantError || !merchantData) {
      return NextResponse.json(
        { error: 'Merchant not found' },
        { status: 404 }
      );
    }

    // 默认选用第一个 Venue (如有)
    const defaultVenueId = merchantData.venues?.[0]?.id || null;

    // 创建活动
    const { data: event, error: insertError } = await supabase
      .from('events_v2')
      .insert({
        merchant_id,
        title,
        subtitle: subtitle || null,
        description: description || null,
        poster_url,
        venue_name: venue_name || null,
        address: address || null,
        status,
        region_id: merchantData.region_id,
        venue_id: defaultVenueId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating event:', insertError);
      return NextResponse.json(
        { error: 'Failed to create event', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ event });
  } catch (error: any) {
    console.error('Error in POST /api/admin/events-v2:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const authResult = await requireAdmin();
  if ('error' in authResult) {
    return authResult.error;
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const merchantId = searchParams.get('merchant_id');
    const status = searchParams.get('status');

    const supabase = createAdminClient();

    let query = supabase
      .from('events_v2')
      .select(`
        *,
        merchants!inner (
          id,
          name,
          region_id
        )
      `)
      .order('created_at', { ascending: false });

    if (merchantId) {
      query = query.eq('merchant_id', merchantId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error('Error fetching events:', error);
      return NextResponse.json(
        { error: 'Failed to fetch events', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ events: events || [] });
  } catch (error: any) {
    console.error('Error in GET /api/admin/events-v2:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
