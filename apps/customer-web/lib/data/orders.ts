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
      order_items (
        quantity,
        events (title, start_at, venues (name))
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
    const first = items[0];
    const ev = first?.events;
    const event = Array.isArray(ev) ? ev[0] : ev;
    const ven = event?.venues;
    const venue = Array.isArray(ven) ? ven[0] : ven;
    const ticketCount = items.reduce((sum: number, i: any) => sum + (Number(i?.quantity) || 0), 0);
    return {
      id: o.id,
      status: o.status,
      amountCents: o.amount_cents ?? 0,
      currency: o.currency || 'usd',
      createdAt: o.created_at,
      eventName: event?.title || '—',
      venueName: venue?.name || '—',
      startAt: event?.start_at || null,
      ticketCount,
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
    .select('id, status, amount_cents, currency, created_at')
    .eq('id', orderId)
    .eq('user_id', userId)
    .maybeSingle();

  if (orderErr || !order) return null;

  const { data: oiRows } = await supabase
    .from('order_items')
    .select(`
      id,
      event_id,
      quantity,
      unit_price_cents,
      events (title, start_at, venues (name)),
      ticket_types (name)
    `)
    .eq('order_id', orderId);

  const { data: ticketRows } = await supabase
    .from('tickets')
    .select('id, status, ticket_types (name)')
    .eq('order_id', orderId);

  const items: OrderItemDetail[] = (oiRows || []).map((i: any) => {
    const ev = Array.isArray(i.events) ? i.events[0] : i.events;
    const ven = ev?.venues;
    const v = Array.isArray(ven) ? ven[0] : ven;
    const tt = Array.isArray(i.ticket_types) ? i.ticket_types[0] : i.ticket_types;
    return {
      id: i.id,
      eventId: i.event_id,
      eventName: ev?.title || '—',
      venueName: v?.name || '—',
      startAt: ev?.start_at || null,
      ticketTypeName: tt?.name || '—',
      quantity: i.quantity ?? 0,
      unitPriceCents: i.unit_price_cents ?? 0,
    };
  });

  const tickets: TicketInOrder[] = (ticketRows || []).map((t: any) => {
    const tt = Array.isArray(t.ticket_types) ? t.ticket_types[0] : t.ticket_types;
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
