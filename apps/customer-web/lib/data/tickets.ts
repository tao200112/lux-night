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
  /** Validity Window (UTC) */
  validStartAt?: string;
  validEndAt?: string;
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
      valid_start_at,
      valid_end_at,
      event:events_v2!tickets_events_v2_id_fkey (
        title,
        poster_url,
        venue:venues!events_v2_venue_id_fkey (
          name, 
          address
        )
      ),
      ticket_type:ticket_types_v2!tickets_ticket_types_v2_id_fkey (name)
    `)
    .eq('user_id', userId)
    // Order by validity start (upcoming first), then creation
    .order('valid_start_at', { ascending: true, nullsFirst: false })
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
    const ev = t.event; 
    const ven = ev?.venue;
    
    // Formatting Date logic (local display)
    let displayDate = '';
    let displayTime = '';
    let startAtISO = t.valid_start_at;

    if (t.valid_start_at) {
       // Parse as local date by removing the 'Z' suffix if present
       // This ensures the date is treated as local time, not UTC
       const dateStr = t.valid_start_at.replace('Z', '');
       const d = new Date(dateStr);
       displayDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
       displayTime = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    return {
      id: t.id,
      eventId: t.event_id,
      eventName: ev?.title || '—',
      venue: ven?.name || '—',
      date: displayDate,
      time: displayTime,
      startAt: startAtISO, 
      validStartAt: t.valid_start_at,
      validEndAt: t.valid_end_at,
      posterUrl: ev?.poster_url || null,
      status: t.status,
      tierName: t.ticket_type?.name || '—',
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
      valid_start_at,
      valid_end_at,
      event:events_v2!tickets_events_v2_id_fkey (
        title,
        poster_url,
        venue:venues!events_v2_venue_id_fkey (
          name, 
          address,
          city
        ),
        merchant:merchants!events_v2_merchant_id_fkey (name)
      ),
      ticket_type:ticket_types_v2!tickets_ticket_types_v2_id_fkey (name)
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

  const evRaw: any = data.event;
  const ev = Array.isArray(evRaw) ? evRaw[0] : evRaw;
  
  const venRaw = ev?.venue;
  const ven = Array.isArray(venRaw) ? venRaw[0] : venRaw;

  const merRaw = ev?.merchant;
  const mer = Array.isArray(merRaw) ? merRaw[0] : merRaw;
  
  // Rule: Venue Name || Merchant + City. No 'Unknown'.
  const venueCity = ven?.city || (ven?.address ? ven.address.split(',').pop()?.trim() : '') || '';
  const venueName = ven?.name || (mer?.name ? `${mer.name} ${venueCity ? '• ' + venueCity : ''}` : 'Location TBD');

  const ttRaw: any = data.ticket_type;
  const ticketTypeData = Array.isArray(ttRaw) ? ttRaw[0] : ttRaw;

  const token = data.public_token || data.qr_seed;
  const base = getAppBaseUrl();

  // Formatting Date logic
  let displayDate = '';
  let displayTime = '';
  let startAtISO = data.valid_start_at;

  if (data.valid_start_at) {
      // Parse as local date by removing the 'Z' suffix if present
      // This ensures the date is treated as local time, not UTC
      const dateStr = data.valid_start_at.replace('Z', '');
      const d = new Date(dateStr);
      displayDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      displayTime = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  return {
    id: data.id,
    eventId: data.event_id,
    eventName: ev?.title || 'Event',
    venue: venueName,
    date: displayDate,
    time: displayTime,
    startAt: startAtISO,
    validStartAt: data.valid_start_at,
    validEndAt: data.valid_end_at,
    posterUrl: ev?.poster_url || null,
    status: data.status,
    tierName: ticketTypeData?.name || 'Ticket',
    qrToken: data.qr_seed,
    publicToken: token,
    qrCodeUrl: base ? generateQRCodeUrl(`${base}/t/${token}`) : generateQRCodeUrl(`/t/${token}`),
    purchaseDate: new Date(data.created_at).toLocaleDateString(),
    redeemedAt: data.redeemed_at || undefined,
    redeemedBy: data.redeemed_by || undefined,
  };
}
