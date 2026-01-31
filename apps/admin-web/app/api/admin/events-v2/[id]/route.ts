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
        ),
        venue:venues!events_v2_venue_id_fkey (
          id,
          name,
          address
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
    const { title, subtitle, description, poster_url, status, venue_name, venue_address } = body;

    const supabase = createAdminClient();

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (subtitle !== undefined) updates.subtitle = subtitle;
    if (description !== undefined) updates.description = description;
    if (poster_url !== undefined) updates.poster_url = poster_url;
    if (status !== undefined) updates.status = status;

    const { data: event, error } = await supabase
      .from('events_v2')
      .update(updates)
      .eq('id', id)
      .select('*, venue_id')
      .single();

    if (error) {
      console.error('Error updating event:', error);
      return NextResponse.json(
        { error: 'Failed to update event', details: error.message },
        { status: 500 }
      );
    }

    // Update Venue if needed
    if ((venue_name !== undefined || venue_address !== undefined) && event.venue_id) {
       const venueUpdates: any = {};
       if (venue_name !== undefined) venueUpdates.name = venue_name;
       if (venue_address !== undefined) venueUpdates.address = venue_address;
       
       const { error: venueError } = await supabase
         .from('venues')
         .update(venueUpdates)
         .eq('id', event.venue_id);
         
       if (venueError) {
           console.warn('Failed to update venue:', venueError);
           // Not blocking event update success
       }
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
