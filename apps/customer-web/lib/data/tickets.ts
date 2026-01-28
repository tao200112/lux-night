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
    
    // V2 currently doesn't store start_at in events_v2; it's computed from weeks.
    // For MVP/Robustness, we leave date empty or show 'Recurring'.
    const displayDate = ''; 
    const displayTime = '';

    return {
      id: t.id,
      eventId: t.event_id,
      eventName: ev?.title || '—',
      venue: ven?.name || '—',
      date: displayDate,
      time: displayTime,
      startAt: undefined, 
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
  const ttRaw: any = data.ticket_type;
  const ticketTypeData = Array.isArray(ttRaw) ? ttRaw[0] : ttRaw;

  const token = data.public_token || data.qr_seed;
  const base = getAppBaseUrl();

  return {
    id: data.id,
    eventId: data.event_id,
    eventName: ev?.title || 'Unknown Event',
    venue: ven?.name || 'Unknown Venue',
    date: '',
    time: '',
    startAt: undefined,
    posterUrl: ev?.poster_url || null,
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
