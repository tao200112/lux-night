import { createClient } from '@/lib/supabase/client';

export interface Event {
  id: string;
  region_id: string;
  merchant_id: string;
  venue_id: string;
  status: 'draft' | 'pending_review' | 'approved' | 'published' | 'rejected' | 'archived';
  title: string;
  description: string | null;
  poster_url: string | null;
  start_at: string;
  end_at: string;
  age_policy: '21+' | 'UNDER21' | 'BOTH';
  refund_policy: 'no_refund' | '24h' | 'flexible' | 'venue_policy';
  publish_at: string | null;
  created_at: string;
  updated_at: string;
  venue?: {
    id: string;
    name: string;
    address: string | null;
  };
}

export interface EventWithVenue extends Event {
  venue: {
    id: string;
    name: string;
    address: string | null;
    address_line1?: string | null;
    city?: string | null;
    state?: string | null;
    region_id?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  region?: {
    id: string;
    name: string;
    city?: string | null;
    state?: string | null;
  } | null;
}

export async function getEvents(regionId?: string): Promise<EventWithVenue[]> {
  const supabase = createClient();

  let query = supabase
    .from('events')
    .select(`
      *,
      venues!inner(id, name, address, address_line1, formatted_address, city, state, region_id, lat, lng),
      regions(id, name, city, state)
    `)
    .eq('status', 'published')
    .gte('start_at', new Date().toISOString())
    .order('start_at', { ascending: true });

  if (regionId) {
    query = query.eq('region_id', regionId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching events:', error);
    throw new Error('Failed to fetch events');
  }

  const rows = data || [];
  return rows.map((row: Record<string, unknown>) => {
    const { venues, regions, ...rest } = row;
    const v = Array.isArray(venues) ? venues[0] : venues;
    const vv = v && typeof v === 'object' && 'id' in v ? (v as Record<string, unknown>) : null;
    const address = vv ? ((vv.formatted_address as string | null) || (vv.address as string | null)) ?? null : null;
    const venue = vv
      ? {
          id: (vv.id as string) ?? '',
          name: (vv.name as string) ?? '—',
          address,
          address_line1: (vv.address_line1 as string | null | undefined) ?? null,
          city: (vv.city as string | null | undefined) ?? null,
          state: (vv.state as string | null | undefined) ?? null,
          region_id: (vv.region_id as string | null | undefined) ?? null,
          lat: (vv.lat as number | null | undefined) ?? null,
          lng: (vv.lng as number | null | undefined) ?? null,
        }
      : { id: '', name: '—', address: null as string | null, address_line1: null, city: null, state: null, region_id: null, lat: null, lng: null };
    
    // 处理 region
    const r = Array.isArray(regions) ? regions[0] : regions;
    const rr = r && typeof r === 'object' && 'id' in r ? (r as Record<string, unknown>) : null;
    const region = rr ? {
      id: (rr.id as string) ?? '',
      name: (rr.name as string) ?? '',
      city: (rr.city as string | null | undefined) ?? null,
      state: (rr.state as string | null | undefined) ?? null,
    } : null;
    
    return { ...rest, venue, region } as EventWithVenue;
  });
}

/** 按 region 取活动，regionId 必填；供 Home/Events 使用 */
export async function getEventsByRegion(regionId: string): Promise<EventWithVenue[]> {
  return getEvents(regionId);
}

/**
 * 按 region 取 Drops；与 Home 同源，按 region 过滤的已发布、未过期活动。
 * 后续若有 drops 表或 events.is_drop，可改为专用查询。
 */
export async function getDropsByRegion(regionId: string): Promise<EventWithVenue[]> {
  return getEvents(regionId);
}

export async function getEvent(id: string): Promise<EventWithVenue | null> {
  const supabase = createClient();
  
  console.log('[getEvent] Fetching event:', id);
  
  // Use left join to handle cases where venue might be missing
  const { data, error } = await supabase
    .from('events')
    .select(`
      *,
      venues(id, name, address, address_line1, formatted_address, city, state, region_id, lat, lng),
      regions(id, name, city, state)
    `)
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle();

  if (error) {
    console.error('[getEvent] Supabase error:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  if (!data) {
    console.warn('[getEvent] No event found with id:', id);
    return null;
  }

  console.log('[getEvent] Event data received:', {
    id: data.id,
    title: data.title,
    hasVenue: !!data.venues,
    venueType: Array.isArray(data.venues) ? 'array' : typeof data.venues,
    hasRegion: !!data.regions,
  });

  // Ensure venue exists, provide fallback if missing
  let venue;
  if (data.venues) {
    // Handle array vs single object (Supabase can return either)
    venue = Array.isArray(data.venues) ? data.venues[0] : data.venues;
    console.log('[getEvent] Venue found:', venue);
  } else {
    // Fallback if venue is missing
    console.warn('[getEvent] No venue data, using fallback');
    venue = {
      id: data.venue_id || '',
      name: 'Venue TBA',
      address: null,
      address_line1: null,
    };
  }
  
  // Handle region
  let region = null;
  if (data.regions) {
    const r = Array.isArray(data.regions) ? data.regions[0] : data.regions;
    if (r && typeof r === 'object' && 'id' in r) {
      region = {
        id: r.id,
        name: r.name,
        city: r.city ?? null,
        state: r.state ?? null,
      };
    }
  }
  
  const address = (venue.formatted_address ?? venue.address) ?? null;
  return {
    ...data,
    venue: {
      id: venue.id,
      name: venue.name,
      address,
      address_line1: venue.address_line1 ?? null,
      city: venue.city ?? null,
      state: venue.state ?? null,
      region_id: venue.region_id ?? null,
      lat: venue.lat ?? null,
      lng: venue.lng ?? null,
    },
    region,
  } as EventWithVenue;
}

