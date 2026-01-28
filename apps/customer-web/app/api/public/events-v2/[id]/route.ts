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
    const { data: event, error } = await supabase
      .from('events_v2')
      .select(`
        *,
        merchants!inner (
          id,
          name,
          venues!inner (
            id,
            name,
            address
          )
        )
      `)
      .eq('id', id)
      .in('status', ['active', 'paused'])
      .single();

    if (error || !event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    // 获取第一个 venue 的地址（用于展示）
    const venue = event.merchants?.venues?.[0];
    const address = venue?.address || null;

    return NextResponse.json({
      id: event.id,
      title: event.title,
      description: event.description,
      poster_url: event.poster_url,
      status: event.status,
      merchant: {
        id: event.merchants.id,
        name: event.merchants.name,
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
