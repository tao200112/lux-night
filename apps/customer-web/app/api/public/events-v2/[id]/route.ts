/**
 * Public Event V2 API
 * GET /api/public/events-v2/[id] - 获取活动详情（公开）
 * Uses merchant → venue/region (events_v2 has no venue_id/region_id).
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

    const { data: event, error } = await supabase
      .from('events_v2')
      .select(`
        *,
        merchant:merchants!events_v2_merchant_id_fkey (
          id,
          name,
          region_id,
          default_venue_id
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

    const m = event.merchant as { id: string; name: string; region_id?: string; default_venue_id?: string } | null;
    const merchantId = m?.id;

    // Venue: merchant.default_venue_id or first venue for merchant
    let venue: { id: string; name: string; address: string | null; formatted_address: string | null; city: string | null; state: string | null; postal_code: string | null } | null = null;
    if (merchantId) {
      let venueId = m?.default_venue_id;
      if (!venueId) {
        const { data: vList } = await supabase
          .from('venues')
          .select('id')
          .eq('merchant_id', merchantId)
          .limit(1);
        venueId = vList?.[0]?.id;
      }
      if (venueId) {
        const { data: v } = await supabase
          .from('venues')
          .select('id, name, address, formatted_address, city, state, postal_code')
          .eq('id', venueId)
          .single();
        if (v) venue = { id: v.id, name: v.name, address: v.address ?? null, formatted_address: v.formatted_address ?? null, city: v.city ?? null, state: v.state ?? null, postal_code: v.postal_code ?? null };
      }
    }

    // Region: merchant.region_id
    let region: { id: string; name: string; city?: string | null; state?: string | null } | null = null;
    if (m?.region_id) {
      const { data: r } = await supabase
        .from('regions')
        .select('id, name, city, state')
        .eq('id', m.region_id)
        .single();
      if (r) region = { id: r.id, name: r.name, city: r.city ?? null, state: r.state ?? null };
    }

    const venueName = (event as any).venue_name || venue?.name || 'Venue TBD';
    const address = (event as any).address || venue?.address || null;
    const fullAddress = (event as any).address || venue?.formatted_address
      || (venue ? [venue.address, [venue.city, venue.state, venue.postal_code].filter(Boolean).join(', ')].filter(Boolean).join(', ') : null);

    return NextResponse.json({
      id: event.id,
      title: event.title,
      subtitle: (event as any).subtitle ?? null,
      description: event.description,
      poster_url: event.poster_url,
      status: event.status,
      merchant: { id: m?.id ?? '', name: m?.name ?? '' },
      venue: {
        id: venue?.id ?? '',
        name: venueName,
        address,
        full_address: fullAddress,
        city: venue?.city ?? region?.city ?? null,
        state: venue?.state ?? region?.state ?? null,
      },
      region,
    });
  } catch (error: any) {
    console.error('Error in GET /api/public/events-v2/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
