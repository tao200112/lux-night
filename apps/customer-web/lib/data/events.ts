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
  };
}

export async function getEvents(regionId?: string): Promise<EventWithVenue[]> {
  const supabase = createClient();
  
  let query = supabase
    .from('events')
    .select(`
      *,
      venues!inner(id, name, address)
    `)
    .eq('status', 'published')
    .order('start_at', { ascending: true });

  if (regionId) {
    query = query.eq('region_id', regionId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching events:', error);
    throw new Error('Failed to fetch events');
  }

  return (data || []) as EventWithVenue[];
}

export async function getEvent(id: string): Promise<EventWithVenue | null> {
  const supabase = createClient();
  
  console.log('[getEvent] Fetching event:', id);
  
  // Use left join to handle cases where venue might be missing
  const { data, error } = await supabase
    .from('events')
    .select(`
      *,
      venues(id, name, address)
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
    };
  }
  
  return {
    ...data,
    venue: {
      id: venue.id,
      name: venue.name,
      address: venue.address,
    },
  } as EventWithVenue;
}

