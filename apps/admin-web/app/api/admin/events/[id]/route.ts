/**
 * Admin Event Detail API
 * GET /api/admin/events/[id] - 获取活动详情
 * PUT /api/admin/events/[id] - 更新活动基础信息
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { data: event, error } = await adminSupabase
      .from('events_v2')
      .select(`*, merchants!inner (id, name, region_id, default_venue_id)`)
      .eq('id', id)
      .single();

    if (error || !event) {
      console.error('Error fetching event:', error);
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    let venue = null;
    const m = event.merchants as any;

    if (m.default_venue_id) {
      const { data: v } = await adminSupabase
        .from('venues')
        .select('id, name, address')
        .eq('id', m.default_venue_id)
        .single();
      venue = v;
    }

    if (!venue) {
      const { data: vList } = await adminSupabase
        .from('venues')
        .select('id, name, address')
        .eq('merchant_id', m.id)
        .limit(1);

      if (vList && vList.length > 0) {
        venue = vList[0];
      }
    }

    (event as any).venue = venue;

    return NextResponse.json({ event });
  } catch (error: any) {
    console.error('Error in GET /api/admin/events/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await rateLimitOrResponse(req, rateLimitPolicies.sensitivePost, { userId: 'anon' });
  if ('response' in rl) return rl.response;

  const authResult = await requireAdmin();
  if ('error' in authResult) return authResult.error;

  const { id } = await params;
  let body: any = {};

  try {
    body = await req.json();
    const { title, subtitle, description, poster_url, status, venue_name, venue_address } = body;
    const adminSupabase = createAdminClient();

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (subtitle !== undefined) updates.subtitle = subtitle;
    if (description !== undefined) updates.description = description;
    if (poster_url !== undefined) updates.poster_url = poster_url;
    if (status !== undefined) updates.status = status;
    if (venue_name !== undefined) updates.venue_name = venue_name;
    if (venue_address !== undefined) updates.address = venue_address;

    const { data: event, error } = await adminSupabase
      .from('events_v2')
      .update(updates)
      .eq('id', id)
      .select('merchant_id')
      .single();

    if (error) {
      console.error("[events PUT] Event Update Error", { id, error });
      return NextResponse.json(
        { ok: false, error: 'Failed to update event', details: error.message },
        { status: 500 }
      );
    }

    let venueUpdated = false;
    let venueMessage = null;

    if (venue_name !== undefined || venue_address !== undefined) {
      const { data: merchant } = await adminSupabase
        .from('merchants')
        .select('id, default_venue_id')
        .eq('id', event.merchant_id)
        .single();

      if (merchant) {
        let targetVenueId = merchant.default_venue_id;

        if (!targetVenueId) {
          const { data: vList } = await adminSupabase
            .from('venues')
            .select('id')
            .eq('merchant_id', merchant.id)
            .order('created_at', { ascending: true })
            .limit(1);

          if (vList && vList.length > 0) {
            targetVenueId = vList[0].id;
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
            console.error("[events PUT] Venue Update Failed", vErr);
          }
        } else {
          venueMessage = "NO_VENUE_FOR_MERCHANT";
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
    console.error('[events PUT] Exception', { id, error });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
