/**
 * Admin Event V2 Detail API
 * GET /api/admin/events-v2/[id] - 通过 Service Role 获取活动详情 (RLS Bypass)
 * PUT /api/admin/events-v2/[id] - 更新活动基础信息 (包括 Venue Fallback 逻辑)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Verify Admin Access
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, code: 'UNAUTHENTICATED' }, { status: 401 });
  }
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    return NextResponse.json({ success: false, code: 'FORBIDDEN' }, { status: 403 });
  }
  
  try {
    const { id } = await params;
    const adminSupabase = createAdminClient();

    // 1. Fetch Event + Merchant Info
    // Avoid deep embedding that causes PGRST201. Just get merchant_id.
    const { data: event, error } = await adminSupabase
      .from('events_v2')
      .select(`
        *,
        merchants!inner (
          id,
          name,
          region_id,
          default_venue_id
        )
      `)
      .eq('id', id)
      .single();

    if (error || !event) {
      console.error('Error fetching event:', error);
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // 2. Fetch Venue (Legacy/Default logic)
    let venue = null;
    const m = event.merchants as any;
    
    if (m.default_venue_id) {
       // Best Case: Merchant has default venue
       const { data: v } = await adminSupabase
         .from('venues')
         .select('id, name, address')
         .eq('id', m.default_venue_id)
         .single();
       venue = v;
    } 
    
    if (!venue) {
       // Fallback: Pick any venue for this merchant (e.g. oldest/newest)
       // This handles cases where default_venue_id is null
       const { data: vList } = await adminSupabase
         .from('venues')
         .select('id, name, address')
         .eq('merchant_id', m.id)
         .limit(1);
         
       if (vList && vList.length > 0) {
           venue = vList[0];
       }
    }

    // Attach venue
    (event as any).venue = venue;

    return NextResponse.json({ event });
  } catch (error: any) {
    console.error('Error in GET /api/admin/events-v2/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth Check
  const authResult = await requireAdmin();
  if ('error' in authResult) return authResult.error;

  const { id } = await params;
  let body: any = {};
  
  try {
    body = await req.json();
    const { title, subtitle, description, poster_url, status, venue_name, venue_address } = body;
    const adminSupabase = createAdminClient();

    // 1. Update Event V2 (Critical)
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (subtitle !== undefined) updates.subtitle = subtitle;
    if (description !== undefined) updates.description = description;
    if (poster_url !== undefined) updates.poster_url = poster_url;
    if (status !== undefined) updates.status = status;
    // Save venue info to event directly (snapshot/override)
    if (venue_name !== undefined) updates.venue_name = venue_name;
    if (venue_address !== undefined) updates.address = venue_address;

    const { data: event, error } = await adminSupabase
      .from('events_v2')
      .update(updates)
      .eq('id', id)
      .select('merchant_id') 
      .single();

    if (error) {
      console.error("[events-v2 PUT] Event Update Error", { id, error });
      return NextResponse.json(
        { ok: false, error: 'Failed to update event', details: error.message },
        { status: 500 }
      );
    }

    // 2. Update Venue (Optional / Fallback)
    let venueUpdated = false;
    let venueMessage = null;

    if (venue_name !== undefined || venue_address !== undefined) {
       // Get Merchant Info
       const { data: merchant } = await adminSupabase
           .from('merchants')
           .select('id, default_venue_id')
           .eq('id', event.merchant_id)
           .single();

       if (merchant) {
           let targetVenueId = merchant.default_venue_id;

           // Fallback: If no default, find FIRST venue
           if (!targetVenueId) {
               const { data: vList } = await adminSupabase
                   .from('venues')
                   .select('id')
                   .eq('merchant_id', merchant.id)
                   .order('created_at', { ascending: true })
                   .limit(1);
               
               if (vList && vList.length > 0) {
                   targetVenueId = vList[0].id;
                   console.log(`[events-v2 PUT] Fallback to first venue ${targetVenueId} for merchant ${merchant.id}`);
               }
           }

           if (targetVenueId) {
               const venueUpdates: any = {};
               if (venue_name !== undefined) venueUpdates.name = venue_name;
               if (venue_address !== undefined) venueUpdates.address = venue_address;

               const { error: vErr } = await adminSupabase
                   .from('venues')
                   .update(venueUpdates)
                   .eq('id', targetVenueId);
               
               if (!vErr) {
                   venueUpdated = true;
               } else {
                   console.error("[events-v2 PUT] Venue Update Failed", vErr);
               }
           } else {
               venueMessage = "NO_VENUE_FOR_MERCHANT";
               console.warn(`[events-v2 PUT] Skipped venue update: No venues found for merchant ${merchant.id}`);
           }
       }
    }

    return NextResponse.json({ 
        ok: true, 
        data: { id, message: 'Updated' },
        venueUpdated,
        venueWarning: venueMessage
    });

  } catch (error: any) {
    console.error('[events-v2 PUT] Exception', { id, error });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
