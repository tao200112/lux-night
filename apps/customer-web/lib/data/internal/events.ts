/**
 * Internal Events Data Queries
 * 内部端活动数据查询函数
 */

import { createClient } from '@/lib/supabase/server';

export interface InternalEvent {
  id: string;
  merchantId: string;
  venueId: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  status: 'draft' | 'pending_review' | 'approved' | 'published' | 'rejected' | 'archived';
  agePolicy: string;
  refundPolicy: string;
  posterUrl: string | null;
  createdAt: string;
  updatedAt: string;
  venue: {
    id: string;
    name: string;
    address: string | null;
  } | null;
  ticketTypes: Array<{
    id: string;
    name: string;
    category: 'ENTRY' | 'DRINK';
    priceCents: number;
    currency: string;
    inventoryLimit: number | null;
    soldCount: number;
    redeemLimit: number;
    isActive: boolean;
  }>;
}

/**
 * 获取merchant的活动列表
 */
export async function getMerchantEvents(
  merchantId: string,
  venueId?: string,
  status?: string
): Promise<InternalEvent[]> {
  const supabase = await createClient();

  let query = supabase
    .from('events')
    .select(`
      id,
      merchant_id,
      venue_id,
      title,
      description,
      start_at,
      end_at,
      status,
      age_policy,
      refund_policy,
      poster_url,
      created_at,
      updated_at,
      venues!inner(
        id,
        name,
        address
      )
    `)
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false });

  if (venueId) {
    query = query.eq('venue_id', venueId);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data: events, error } = await query;

  if (error || !events) {
    return [];
  }

  // 获取每个活动的ticket types
  const eventsWithTicketTypes: InternalEvent[] = await Promise.all(
    events.map(async (event: any) => {
      const { data: ticketTypes } = await supabase
        .from('ticket_types')
        .select('*')
        .eq('event_id', event.id);

      return {
        id: event.id,
        merchantId: event.merchant_id,
        venueId: event.venue_id,
        title: event.title,
        description: event.description,
        startAt: event.start_at,
        endAt: event.end_at,
        status: event.status,
        agePolicy: event.age_policy,
        refundPolicy: event.refund_policy,
        posterUrl: event.poster_url,
        createdAt: event.created_at,
        updatedAt: event.updated_at,
        venue: {
          id: event.venues.id,
          name: event.venues.name,
          address: event.venues.address,
        },
        ticketTypes: (ticketTypes || []).map((tt: any) => ({
          id: tt.id,
          name: tt.name,
          category: tt.category,
          priceCents: tt.price_cents,
          currency: tt.currency,
          inventoryLimit: tt.inventory_limit,
          soldCount: tt.sold_count,
          redeemLimit: tt.redeem_limit,
          isActive: tt.is_active,
        })),
      };
    })
  );

  return eventsWithTicketTypes;
}

/**
 * 获取单个活动详情
 */
export async function getEventById(
  eventId: string,
  merchantId?: string
): Promise<InternalEvent | null> {
  const supabase = await createClient();

  let query = supabase
    .from('events')
    .select(`
      id,
      merchant_id,
      venue_id,
      title,
      description,
      start_at,
      end_at,
      status,
      age_policy,
      refund_policy,
      poster_url,
      created_at,
      updated_at,
      venues!inner(
        id,
        name,
        address
      )
    `)
    .eq('id', eventId);

  if (merchantId) {
    query = query.eq('merchant_id', merchantId);
  }

  const { data: event, error } = await query.single();

  if (error || !event) {
    return null;
  }

  // 获取ticket types
  const { data: ticketTypes } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('event_id', event.id);

  return {
    id: event.id,
    merchantId: event.merchant_id,
    venueId: event.venue_id,
    title: event.title,
    description: event.description,
    startAt: event.start_at,
    endAt: event.end_at,
    status: event.status,
    agePolicy: event.age_policy,
    refundPolicy: event.refund_policy,
    posterUrl: event.poster_url,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
    venue: (() => {
      const venueData = Array.isArray(event.venues) ? event.venues[0] : event.venues;
      return venueData ? {
        id: venueData.id,
        name: venueData.name,
        address: venueData.address,
      } : null;
    })(),
    ticketTypes: (ticketTypes || []).map((tt: any) => ({
      id: tt.id,
      name: tt.name,
      category: tt.category,
      priceCents: tt.price_cents,
      currency: tt.currency,
      inventoryLimit: tt.inventory_limit,
      soldCount: tt.sold_count,
      redeemLimit: tt.redeem_limit,
      isActive: tt.is_active,
    })),
  };
}
