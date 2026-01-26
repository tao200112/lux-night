import { createClient } from '@/lib/supabase/client';
import { generateQRCodeUrl } from '@/lib/utils/qr';

export interface TicketData {
  id: string;
  order_id: string;
  user_id: string;
  event_id: string;
  venue_id: string;
  ticket_type_id: string;
  status: 'issued' | 'active' | 'used' | 'refunded' | 'void' | 'expired';
  redeem_limit: number;
  redeemed_count: number;
  qr_seed: string;
  created_at: string;
  updated_at: string;
  events?: {
    title: string;
    start_at: string;
    end_at: string;
    venues?: {
      name: string;
      address: string | null;
    };
  };
  ticket_types?: {
    name: string;
    category: 'ENTRY' | 'DRINK';
  };
}

/** Base URL for /t/[token] and QR; prefer NEXT_PUBLIC_APP_URL. */
function getAppBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
  }
  return process.env.NEXT_PUBLIC_APP_URL || '';
}

export interface Ticket {
  id: string;
  eventId: string;
  eventName: string;
  venue: string;
  date: string;
  time: string;
  /** ISO string for event start; used for "Tonight" and ordering */
  startAt?: string;
  /** Event poster (商家海报) for card background */
  posterUrl?: string | null;
  status: 'issued' | 'active' | 'used' | 'refunded' | 'void' | 'expired';
  tierName: string;
  /** @deprecated use publicToken for QR/URL */
  qrToken: string;
  /** Token for /t/[token] and /redeem/[token]; 128-bit+, not guessable */
  publicToken: string;
  qrCodeUrl: string;
  purchaseDate: string;
  redeemedAt?: string;
  redeemedBy?: string;
}

export async function getTickets(userId: string, status?: string): Promise<Ticket[]> {
  const supabase = createClient();
  
  let query = supabase
    .from('tickets')
    .select(`
      id,
      event_id,
      status,
      qr_seed,
      public_token,
      redeemed_at,
      redeemed_by,
      created_at,
      updated_at,
      events!inner(
        title,
        start_at,
        end_at,
        poster_url,
        venues!inner(name, address)
      ),
      ticket_types!inner(name)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching tickets:', error);
    throw new Error('Failed to fetch tickets');
  }

  const base = getAppBaseUrl();
  return (data || []).map((t: any) => {
    const token = t.public_token || t.qr_seed;
    const ev = Array.isArray(t.events) ? t.events[0] : t.events;
    const ven = ev?.venues ? (Array.isArray(ev.venues) ? ev.venues[0] : ev.venues) : null;
    return {
      id: t.id,
      eventId: t.event_id,
      eventName: ev?.title || '—',
      venue: ven?.name || '—',
      date: ev?.start_at ? new Date(ev.start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
      time: ev?.start_at ? new Date(ev.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
      startAt: ev?.start_at || undefined,
      posterUrl: ev?.poster_url || null,
      status: t.status,
      tierName: t.ticket_types?.name || '—',
      qrToken: t.qr_seed,
      publicToken: token,
      qrCodeUrl: base ? generateQRCodeUrl(`${base}/t/${token}`) : generateQRCodeUrl(`/t/${token}`),
      purchaseDate: new Date(t.created_at).toLocaleDateString(),
      redeemedAt: t.redeemed_at || undefined,
      redeemedBy: t.redeemed_by || undefined,
    };
  });
}

export async function getTicket(id: string, userId?: string): Promise<Ticket | null> {
  const supabase = createClient();
  
  let query = supabase
    .from('tickets')
    .select(`
      id,
      event_id,
      status,
      qr_seed,
      public_token,
      redeemed_at,
      redeemed_by,
      created_at,
      updated_at,
      events!inner(
        title,
        start_at,
        end_at,
        poster_url,
        venues!inner(name, address)
      ),
      ticket_types!inner(name)
    `)
    .eq('id', id);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    console.error('Error fetching ticket:', error);
    return null;
  }

  // Transform data - safely access arrays
  const eventData = Array.isArray(data.events) ? data.events[0] : data.events;
  const venueData = eventData?.venues ? (Array.isArray(eventData.venues) ? eventData.venues[0] : eventData.venues) : null;
  const ticketTypeData = Array.isArray(data.ticket_types) ? data.ticket_types[0] : data.ticket_types;

  const token = data.public_token || data.qr_seed;
  const base = getAppBaseUrl();
  return {
    id: data.id,
    eventId: data.event_id,
    eventName: eventData?.title || 'Unknown Event',
    venue: venueData?.name || 'Unknown Venue',
    date: eventData?.start_at ? new Date(eventData.start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
    time: eventData?.start_at ? new Date(eventData.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
    startAt: eventData?.start_at || undefined,
    posterUrl: eventData?.poster_url || null,
    status: data.status,
    tierName: ticketTypeData?.name || 'Unknown',
    qrToken: data.qr_seed,
    publicToken: token,
    qrCodeUrl: base ? generateQRCodeUrl(`${base}/t/${token}`) : generateQRCodeUrl(`/t/${token}`),
    purchaseDate: new Date(data.created_at).toLocaleDateString(),
    redeemedAt: data.redeemed_at || undefined,
    redeemedBy: data.redeemed_by || undefined,
  };
}
