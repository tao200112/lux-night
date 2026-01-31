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
  const supabase = await createClient();
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

    // Use Service Role client to bypass RLS
    const adminSupabase = createAdminClient();

    // Use explicit relationship for venues to avoid PGRST201
    const { data: event, error } = await adminSupabase
      .from('events_v2')
      .select(`
        *,
        merchants!inner (
          id,
          name,
          region_id,
          default_venue_id,
          venues:venues!merchants_default_venue_id_fkey (
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

    // Map merchant venue to event venue
    // With explicit relationship, venues is a single object (if default_venue_id is set)
    let venue = null;
    const m = (event.merchants as any);
    if (m && m.venues) {
        venue = m.venues;
    }

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

  const { id } = await params;
  let body: any = {};
  
  try {
    body = await req.json();
    const { title, description, poster_url, status, venue_name, venue_address } = body;

    const supabase = createAdminClient();

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (poster_url !== undefined) updates.poster_url = poster_url;
    if (status !== undefined) updates.status = status;

    // Update Event V2 Only
    const { data: event, error } = await supabase
      .from('events_v2')
      .update(updates)
      .eq('id', id)
      .select('merchant_id') 
      .single();

    if (error) {
      console.error("[events-v2 PUT] Update Error", { id, body, error });
      return NextResponse.json(
        { ok: false, error: 'Failed to update event', details: error.message, context: "events_v2 update" },
        { status: 500 }
      );
    }

    // Update Venue if needed
    if (venue_name !== undefined || venue_address !== undefined) {
       // 1. Get Merchant's default venue ID
       const { data: merchant, error: merchantError } = await supabase
           .from('merchants')
           .select('default_venue_id')
           .eq('id', event.merchant_id)
           .single();
           
       if (merchantError || !merchant) {
           console.error("[events-v2 PUT] Merchant not found", { id, merchantId: event.merchant_id, merchantError });
           // Non-blocking but logged
       } else if (!merchant.default_venue_id) {
           console.warn("[events-v2 PUT] No default venue set for merchant", { id, merchantId: event.merchant_id });
           return NextResponse.json(
                { ok: false, error: 'Merchant has no default venue set. Cannot update venue details.', context: "venue update" },
                { status: 400 }
           );
       } else {
           // 2. Update the Venue
           const venueUpdates: any = {};
           if (venue_name !== undefined) venueUpdates.name = venue_name;
           if (venue_address !== undefined) venueUpdates.address = venue_address;
           
           const { error: venueUpdateError } = await supabase
             .from('venues')
             .update(venueUpdates)
             .eq('id', merchant.default_venue_id);
             
           if (venueUpdateError) {
               console.error("[events-v2 PUT] Venue Update Failed", { id, venueId: merchant.default_venue_id, venueUpdateError });
               return NextResponse.json(
                    { ok: false, error: 'Failed to update venue details', details: venueUpdateError.message },
                    { status: 500 }
               );
           }
       }
    }

    return NextResponse.json({ ok: true, data: { id, message: 'Updated successfully' } });
  } catch (error: any) {
    console.error('[events-v2 PUT] Exception', { id, body, error });
    return NextResponse.json(
      { ok: false, error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
