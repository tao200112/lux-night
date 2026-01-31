/**
 * Admin Event V2 Detail API
 * GET /api/admin/events-v2/[id] - 获取活动详情
 * PUT /api/admin/events-v2/[id] - 更新活动基础信息
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Verify Admin Access using standard client for auth check
  const supabase = await createClient(); // Standard client for auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' },
      { status: 401 }
    );
  }
  
  // Check admin role
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    return NextResponse.json(
      { success: false, code: 'FORBIDDEN', message: 'Must be admin' },
      { status: 403 }
    );
  }
  
  try {
    const { id } = await params;

    // Use Service Role client to bypass RLS for detailed data fetching
    // (Ensure we can read merchants/venues even if admin is not a direct member)
    const adminSupabase = createAdminClient();

    const { data: event, error } = await adminSupabase
      .from('events_v2')
      .select(`
        *,
        merchants!inner (
          id,
          name,
          region_id,
          venues (
            id,
            name,
            address
          )
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

    // Map merchant venue to event venue (fallback strategy)
    // events_v2 uses merchant's venue
    let venue = null;
    const m = (event.merchants as any);
    if (m && m.venues) {
        // If venues is an array, pick first (or default if available)
        venue = Array.isArray(m.venues) ? m.venues[0] : m.venues;
    }

    // Attach mapped venue to response so frontend works
    (event as any).venue = venue;

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
    const { title, description, poster_url, status, venue_name, venue_address } = body;
    // Note: 'subtitle' is not supported in events_v2 schema yet

    const supabase = createAdminClient();

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    // if (subtitle !== undefined) updates.subtitle = subtitle; // Schema restriction
    if (description !== undefined) updates.description = description;
    if (poster_url !== undefined) updates.poster_url = poster_url;
    if (status !== undefined) updates.status = status;

    const { data: event, error } = await supabase
      .from('events_v2')
      .update(updates)
      .eq('id', id)
      .select('*, merchants(venues(id))')
      .single();

    if (error) {
      console.error('Error updating event:', error);
      return NextResponse.json(
        { error: 'Failed to update event', details: error.message },
        { status: 500 }
      );
    }

    // Update Venue if needed
    // We update the merchant's venue (CAUTION: Affects Merchant globally, but assumed intended for this simplified model)
    if (venue_name !== undefined || venue_address !== undefined) {
       const m = (event.merchants as any);
       const v = (m && m.venues && Array.isArray(m.venues)) ? m.venues[0] : null;
       
       if (v && v.id) {
           const venueUpdates: any = {};
           if (venue_name !== undefined) venueUpdates.name = venue_name;
           if (venue_address !== undefined) venueUpdates.address = venue_address;
           
           const { error: venueError } = await supabase
             .from('venues')
             .update(venueUpdates)
             .eq('id', v.id);
             
           if (venueError) {
               console.warn('Failed to update venue:', venueError);
           }
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
