import { createClient } from '@/lib/supabase/client';

export type OrderStatus = 'created' | 'pending_payment' | 'paid' | 'fulfilled' | 'expired' | 'canceled' | 'refunded' | 'partially_refunded';

export interface OrderListItem {
  id: string;
  status: OrderStatus;
  amountCents: number;
  currency: string;
  createdAt: string;
  /** 首条 order_item 的 event，用于卡片展示 */
  eventName: string;
  venueName: string;
  startAt: string | null;
  /** 订单内票务数量（order_items.quantity 之和） */
  ticketCount: number;
  /** 简要如 "GA × 2, VIP × 1" */
  itemsSummary: string;
}

export interface OrderItemDetail {
  id: string;
  eventId: string;
  eventName: string;
  venueName: string;
  startAt: string | null;
  ticketTypeName: string;
  quantity: number;
  unitPriceCents: number;
}

export interface TicketInOrder {
  id: string;
  status: string;
  ticketTypeName: string;
  /** 用于展示，不暴露完整 id */
  shortId: string;
}

export interface OrderDetail {
  id: string;
  status: OrderStatus;
  amountCents: number;
  currency: string;
  createdAt: string;
  items: OrderItemDetail[];
  tickets: TicketInOrder[];
}

function toDisplayStatus(s: OrderStatus): string {
  if (['paid', 'fulfilled'].includes(s)) return 'Paid';
  if (['refunded', 'partially_refunded', 'canceled'].includes(s)) return 'Refunded';
  return 'Pending';
}

export { toDisplayStatus };

/**
 * 订单列表：当前用户的 orders + order_items + events/venues，按 created_at 倒序
 */
export async function getOrderList(userId: string): Promise<OrderListItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      status,
      amount_cents,
      currency,
      created_at,
      events_v2:event_v2_id (title, venue_name, poster_url),
      order_items (
        quantity,
        ticket_types_v2:ticket_type_v2_id (name)
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[orders] getOrderList', error);
    throw new Error('Failed to load orders');
  }

  return (data || []).map((o: any) => {
    const items = o.order_items || [];
    const ev = o.events_v2;
    const event = Array.isArray(ev) ? ev[0] : ev;
    const venueName = event?.venue_name || '—';
    const ticketCount = items.reduce((sum: number, i: any) => sum + (Number(i?.quantity) || 0), 0);
    const itemsSummary = items
      .map((i: any) => {
        const tt = Array.isArray(i?.ticket_types_v2) ? i.ticket_types_v2[0] : i?.ticket_types_v2;
        const name = tt?.name || 'Ticket';
        return `${name} × ${Number(i?.quantity) || 0}`;
      })
      .join(', ');
    return {
      id: o.id,
      status: o.status,
      amountCents: o.amount_cents ?? 0,
      currency: o.currency || 'usd',
      createdAt: o.created_at,
      eventName: event?.title || '—',
      venueName: venueName || '—',
      startAt: null,
      ticketCount,
      itemsSummary: itemsSummary || `${ticketCount} ticket(s)`,
    };
  });
}

/**
 * 订单详情：order + order_items(+events, ticket_types) + tickets(+ticket_types)
 */
export async function getOrderDetail(orderId: string, userId: string): Promise<OrderDetail | null> {
  const supabase = createClient();

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, status, amount_cents, currency, created_at, event_v2_id, events_v2:event_v2_id (title, venue_name)')
    .eq('id', orderId)
    .eq('user_id', userId)
    .maybeSingle();

  if (orderErr || !order) return null;

  const ev = (order as any).events_v2;
  const event = Array.isArray(ev) ? ev[0] : ev;

  const { data: oiRows } = await supabase
    .from('order_items')
    .select(`
      id,
      event_id,
      quantity,
      unit_price_cents,
      ticket_types_v2:ticket_type_v2_id (name)
    `)
    .eq('order_id', orderId);

  const { data: ticketRows } = await supabase
    .from('tickets')
    .select('id, status, ticket_types_v2:ticket_type_id_v2 (name)')
    .eq('order_id', orderId);

  const items: OrderItemDetail[] = (oiRows || []).map((i: any) => {
    const tt = Array.isArray(i.ticket_types_v2) ? i.ticket_types_v2[0] : i.ticket_types_v2;
    return {
      id: i.id,
      eventId: i.event_id,
      eventName: event?.title || '—',
      venueName: event?.venue_name || '—',
      startAt: null,
      ticketTypeName: tt?.name || '—',
      quantity: i.quantity ?? 0,
      unitPriceCents: i.unit_price_cents ?? 0,
    };
  });

  const tickets: TicketInOrder[] = (ticketRows || []).map((t: any) => {
    const tt = Array.isArray(t.ticket_types_v2) ? t.ticket_types_v2[0] : t.ticket_types_v2;
    return {
      id: t.id,
      status: t.status,
      ticketTypeName: tt?.name || '—',
      shortId: String(t.id).slice(-8),
    };
  });

  return {
    id: order.id,
    status: order.status,
    amountCents: order.amount_cents ?? 0,
    currency: order.currency || 'usd',
    createdAt: order.created_at,
    items,
    tickets,
  };
}
