/**
 * Public Event V2 API
 * GET /api/public/events-v2/[id] - 获取活动详情（公开）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // 获取活动详情（仅 active/paused）
    // 使用直接关联 (Proposed Plan A) 避免 PGRST201
    const { data: event, error } = await supabase
      .from('events_v2')
      .select(`
        *,
        merchant:merchants!events_v2_merchant_id_fkey (
          id,
          name
        ),
        venue:venues!events_v2_venue_id_fkey (
          id,
          name,
          address,
          city,
          state
        ),
        region:regions!events_v2_region_id_fkey (
          id,
          name
        )
      `)
      .eq('id', id)
      .in('status', ['active', 'temp_closed', 'paused'])
      .single();

    if (error || !event) {
      console.error('[CUSTOMER EVENT V2] Error:', error);
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    // Direct venue access
    const venue = event.venue;
    const address = venue?.address || null;

    return NextResponse.json({
      id: event.id,
      title: event.title,
      description: event.description,
      poster_url: event.poster_url,
      status: event.status,
      merchant: {
        id: event.merchant?.id,
        name: event.merchant?.name,
      },
      venue: venue ? {
        id: venue.id,
        name: venue.name,
        address: address,
      } : null,
    });
  } catch (error: any) {
    console.error('Error in GET /api/public/events-v2/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
