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

export interface Ticket {
  id: string;
  eventId: string;
  eventName: string;
  venue: string;
  date: string;
  time: string;
  status: 'issued' | 'active' | 'used' | 'refunded' | 'void' | 'expired';
  tierName: string;
  qrToken: string;
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
      created_at,
      updated_at,
      events!inner(
        title,
        start_at,
        end_at,
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

  // Transform data to match Ticket interface
  return (data || []).map((t: any) => ({
    id: t.id,
    eventId: t.event_id,
    eventName: t.events.title,
    venue: t.events.venues.name,
    date: new Date(t.events.start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    time: new Date(t.events.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    status: t.status,
    tierName: t.ticket_types.name,
    qrToken: t.qr_seed,
    qrCodeUrl: generateQRCodeUrl(t.qr_seed),
    purchaseDate: new Date(t.created_at).toLocaleDateString(),
  }));
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
      created_at,
      updated_at,
      events!inner(
        title,
        start_at,
        end_at,
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

  return {
    id: data.id,
    eventId: data.event_id,
    eventName: eventData?.title || 'Unknown Event',
    venue: venueData?.name || 'Unknown Venue',
    date: eventData?.start_at ? new Date(eventData.start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
    time: eventData?.start_at ? new Date(eventData.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
    status: data.status,
    tierName: ticketTypeData?.name || 'Unknown',
    qrToken: data.qr_seed,
    qrCodeUrl: generateQRCodeUrl(data.qr_seed),
    purchaseDate: new Date(data.created_at).toLocaleDateString(),
  };
}
