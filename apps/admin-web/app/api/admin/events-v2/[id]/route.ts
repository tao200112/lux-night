/**
 * Admin Event V2 Detail API
 * GET /api/admin/events-v2/[id] - 获取活动详情
 * PUT /api/admin/events-v2/[id] - 更新活动基础信息
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin();
  if ('error' in authResult) {
    return authResult.error;
  }

  try {
    const { id } = await params;

    const supabase = createAdminClient();

    const { data: event, error } = await supabase
      .from('events_v2')
      .select(`
        *,
        merchants!inner (
          id,
          name,
          region_id
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching event:', error);
      return NextResponse.json(
        { error: 'Event not found', details: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json({ event });
  } catch (error: any) {
    console.error('Error in GET /api/admin/events-v2/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin();
  if ('error' in authResult) {
    return authResult.error;
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { title, description, poster_url, status } = body;

    const supabase = createAdminClient();

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (poster_url !== undefined) updates.poster_url = poster_url;
    if (status !== undefined) updates.status = status;

    const { data: event, error } = await supabase
      .from('events_v2')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating event:', error);
      return NextResponse.json(
        { error: 'Failed to update event', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ event });
  } catch (error: any) {
    console.error('Error in PUT /api/admin/events-v2/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
