import { createClient } from '@/lib/supabase/client';

export interface Event {
  id: string;
  region_id: string;
  merchant_id: string;
  venue_id: string;
  status: 'draft' | 'pending_review' | 'approved' | 'published' | 'rejected' | 'archived';
  title: string;
  subtitle?: string | null;
  description: string | null;
  poster_url: string | null;
  start_at: string;
  end_at: string;
  age_policy: '21+' | 'UNDER21' | 'BOTH';
  refund_policy: 'no_refund' | '24h' | 'flexible' | 'venue_policy';
  publish_at: string | null;
  created_at: string;
  updated_at: string;
  venue_name?: string | null;
  address?: string | null;
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
  merchant?: {
    id: string;
    name: string;
  };
}

export async function getEvents(regionId?: string): Promise<EventWithVenue[]> {
  const supabase = createClient();

  // Use !inner when filtering by region so PostgREST correctly filters parent rows
  const merchantHint = regionId ? '!inner' : '';
  const selectStr = `
    *,
    merchant:merchants!events_v2_merchant_id_fkey${merchantHint} (
      id,
      name,
      region_id,
      venue:venues!venues_merchant_id_fkey (
        id,
        name,
        address,
        address_line1,
        formatted_address,
        city,
        state,
        region_id,
        lat,
        lng
      ),
      region:regions!merchants_region_id_fkey (
        id,
        name,
        city,
        state
      )
    )
  `;

  let query = supabase
    .from('events_v2')
    .select(selectStr)
    .eq('status', 'active')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (regionId) {
    query = query.eq('merchant.region_id', regionId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching v2 events:', JSON.stringify(error, null, 2));
    // Return empty array instead of throwing to prevent page crash, or throw with message
    // User asked to "solve" the error. If it's RLS, we need to know.
    // I'll throw nicely.
    throw new Error(`Failed to fetch events: ${error.message} (${error.code})`);
  }

  const rows = data || [];
  // Client-side filter as safety net (PostgREST filter on nested resource can be unreliable)
  const filtered = regionId
    ? rows.filter((row: any) => {
        const m = row.merchant;
        const rid = Array.isArray(m) ? m[0]?.region_id : m?.region_id;
        return rid === regionId;
      })
    : rows;

  return filtered.map((row: any) => {
    // Flatten merchant/venue/region data
    const merchant = row.merchant;
    // Reverse FK usually returns array
    const v = Array.isArray(merchant?.venue) ? merchant.venue[0] : merchant?.venue;
    // FK usually returns object
    const r = Array.isArray(merchant?.region) ? merchant.region[0] : merchant?.region;

    const venueName = row.venue_name || v?.name || 'Venue TBD';
    const venueAddress = row.address || v?.address || v?.formatted_address || null;

    const venue = {
          id: v?.id || '',
          name: venueName,
          address: venueAddress,
          address_line1: v?.address_line1,
          city: v?.city,
          state: v?.state,
          region_id: v?.region_id,
          lat: v?.lat,
          lng: v?.lng,
        };

    const region = r
      ? {
          id: r.id,
          name: r.name,
          city: r.city,
          state: r.state,
        }
      : null;

    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      description: row.description,
      poster_url: row.poster_url,
      status: row.status,
      // Map missing V1 fields
      start_at: row.created_at, // Fallback
      end_at: row.created_at,   // Fallback
      publish_at: row.created_at,
      age_policy: '21+', // Default
      refund_policy: 'flexible',
      created_at: row.created_at,
      updated_at: row.updated_at || row.created_at,
      venue_id: venue.id,
      region_id: merchant?.region_id || '',
      merchant_id: merchant?.id || '',
      venue,
      region,
    } as EventWithVenue;
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
  
  console.log('[getEvent] Fetching v2 event:', id);
  
  // Query V2 Event
  const { data, error } = await supabase
    .from('events_v2')
    .select(`
      *,
      merchant:merchants!events_v2_merchant_id_fkey (
        id,
        name,
        region_id,
        venue:venues!venues_merchant_id_fkey (
          id,
          name,
          address,
          address_line1,
          formatted_address,
          city,
          state,
          region_id,
          lat,
          lng
        ),
        region:regions!merchants_region_id_fkey (
          id,
          name,
          city,
          state
        )
      )
    `)
    .eq('id', id)
    .neq('status', 'draft')
    .neq('status', 'archived')
    .maybeSingle();

  if (error) {
    console.error('[getEvent] Supabase error:', JSON.stringify(error, null, 2));
    throw new Error(`Failed to fetch event: ${error.message}`);
  }

  if (!data) {
    console.warn('[getEvent] No active/visible v2 event found with id:', id);
    return null;
  }

  // Flatten Data
  const merchant = data.merchant;
  const v = Array.isArray(merchant?.venue) ? merchant.venue[0] : merchant?.venue;
  const r = Array.isArray(merchant?.region) ? merchant.region[0] : merchant?.region;

  const venueName = data.venue_name || v?.name || 'Venue TBD';
  const venueAddress = data.address || v?.address || v?.formatted_address || null;

  const venue = {
        id: v?.id || '',
        name: venueName,
        address: venueAddress,
        address_line1: v?.address_line1,
        city: v?.city,
        state: v?.state,
        region_id: v?.region_id,
        lat: v?.lat,
        lng: v?.lng,
      };

  const region = r
    ? {
        id: r.id,
        name: r.name,
        city: r.city,
        state: r.state,
      }
    : null;

  return {
    id: data.id,
    title: data.title,
    subtitle: data.subtitle,
    description: data.description,
    poster_url: data.poster_url,
    status: data.status,
    // Map missing status/fields
    region_id: merchant?.region_id || '',
    merchant_id: merchant?.id || '',
    venue_id: venue.id,
    
    // Mapping V1 fields Fallback
    start_at: data.created_at, 
    end_at: data.created_at,
    publish_at: data.created_at,
    age_policy: '21+',
    refund_policy: 'flexible',
    created_at: data.created_at,
    updated_at: data.updated_at || data.created_at,
    
    venue,
    region,
  } as EventWithVenue;
}

