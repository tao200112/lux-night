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

export async function DELETE(
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

    // 检查是否有已售出的票（通过 event_weeks -> ticket_types_v2 -> tickets）
    const { data: eventWeeks } = await supabase
      .from('event_weeks')
      .select('id')
      .eq('event_id', id)
      .limit(1);

    if (eventWeeks && eventWeeks.length > 0) {
      // 检查是否有已售出的票
      const { count: ticketCount } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id_v2', id)
        .limit(1);

      if (ticketCount && ticketCount > 0) {
        // 有已售出的票，不允许删除，改为归档
        const { data: event, error } = await supabase
          .from('events_v2')
          .update({ status: 'archived' })
          .eq('id', id)
          .select()
          .single();

        if (error) {
          console.error('Error archiving event:', error);
          return NextResponse.json(
            { error: 'Failed to archive event', details: error.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          event,
          message: 'Event has sold tickets, archived instead of deleted',
        });
      }
    }

    // 没有已售出的票，可以安全删除（级联删除会处理 event_weeks, event_week_days, ticket_types_v2）
    const { error: deleteError } = await supabase
      .from('events_v2')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting event:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete event', details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Event deleted successfully' });
  } catch (error: any) {
    console.error('Error in DELETE /api/admin/events-v2/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
