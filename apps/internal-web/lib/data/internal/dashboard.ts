/**
 * Internal Dashboard Data Queries (V2)
 * 商家端 Dashboard 数据查询
 */

import { createClient } from '@/lib/supabase/server';
import { getNYStartOfDay, getNYStartOfWeek, getNYStartOfMonth, getNYDateString } from '@lux-night/shared/timezone';

export interface DashboardStats {
  totalEvents: number;
  upcomingEvents: number;
  totalTickets: number;
  checkedInToday: number;
  refunds: number;
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  tonightEvents: Array<{
    id: string;
    title: string;
    startAt: string;
    venue: string;
    sold: number;
    total: number;
    checkedIn: number;
    image?: string;
    badge?: 'Staff' | 'VIP Only';
  }>;
}

export async function getDashboardStats(
  merchantId: string,
  venueId?: string
): Promise<DashboardStats> {
  const supabase = await createClient();

  // 1. Get V2 Events
  const { data: events } = await supabase
    .from('events_v2')
    .select('id, title, status, poster_url, created_at, merchants!inner(id, region_id)')
    .eq('merchant_id', merchantId);

  const eventIds = (events || []).map((e: any) => e.id);
  const totalEvents = events?.length || 0;
  const upcomingEvents = events?.filter((e: any) => e.status === 'active').length || 0;

  if (eventIds.length === 0) {
      return {
          totalEvents: 0,
          upcomingEvents: 0,
          totalTickets: 0,
          checkedInToday: 0,
          refunds: 0,
          revenue: { today: 0, thisWeek: 0, thisMonth: 0 },
          tonightEvents: []
      };
  }

  // 2. Revenue & Tickets from Orders
  // We assume 'orders' table is used for V2 events too (via event_id)
  const { data: allOrders } = await supabase
    .from('orders')
    .select('id, amount_cents, status, created_at, event_id')
    .in('event_id', eventIds)
    .in('status', ['paid', 'refunded']);

  const paidOrders = allOrders?.filter((o: any) => o.status === 'paid') || [];
  const refundedOrders = allOrders?.filter((o: any) => o.status === 'refunded') || [];
  
  const refunds = refundedOrders.length;

  // Total tickets: sum of order_items.quantity for paid orders
  let totalTickets = 0;
  if (paidOrders.length > 0) {
    const paidOrderIds = paidOrders.map((o: any) => o.id);
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('quantity')
      .in('order_id', paidOrderIds);
    totalTickets = (orderItems || []).reduce((sum: number, oi: any) => sum + (oi.quantity || 0), 0);
  }

  // Time ranges (NY timezone-aware)
  const todayStart = getNYStartOfDay();
  const weekStart = getNYStartOfWeek();
  const monthStart = getNYStartOfMonth();

  const calcRevenue = (fromDate: string) => {
      return paidOrders
        .filter((o: any) => o.created_at >= fromDate)
        .reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0) / 100;
  };

  const revenue = {
      today: calcRevenue(todayStart),
      thisWeek: calcRevenue(weekStart),
      thisMonth: calcRevenue(monthStart)
  };

  // 3. Tonight's Events (Active events scheduled for today's DOW)
  // Dow: 0=Sun, 6=Sat. 
  // Postgres dow: 0=Sun. 
  // event_week_days stores dow.
  const currentDow = new Date().getDay(); // 0-6

  const { data: todayConfigs } = await supabase
    .from('event_week_days')
    .select(`
        id, 
        event_week_id,
        dow,
        start_time,
        event_weeks!inner(
            event_id
        )
    `)
    .eq('dow', currentDow)
    .in('event_weeks.event_id', eventIds);

  // Map back to events
  const tonightEventIds = new Set(todayConfigs?.map((c: any) => c.event_weeks.event_id));
  
  // Fetch ticket stats for today's event_week_days
  const todayEwdIds = (todayConfigs || []).map((c: any) => c.id);
  let ewdTicketStats: Record<string, { sold: number; total: number }> = {};
  if (todayEwdIds.length > 0) {
    const { data: ticketTypes } = await supabase
      .from('ticket_types_v2')
      .select('event_week_day_id, sold_count, inventory_limit')
      .in('event_week_day_id', todayEwdIds);
    for (const tt of ticketTypes || []) {
      const ewdId = tt.event_week_day_id;
      if (!ewdTicketStats[ewdId]) ewdTicketStats[ewdId] = { sold: 0, total: 0 };
      ewdTicketStats[ewdId].sold += tt.sold_count || 0;
      ewdTicketStats[ewdId].total += tt.inventory_limit ?? 0;
    }
  }

  const tonightEvents = (events || [])
    .filter((e: any) => tonightEventIds.has(e.id) && e.status === 'active')
    .map((e: any) => {
        const config = todayConfigs?.find((c: any) => c.event_weeks?.event_id === e.id);
        const stats = config ? ewdTicketStats[config.id] : null;
        const eventOrders = paidOrders.filter((o: any) => o.event_id === e.id);
        const soldFromOrders = eventOrders.reduce((s, o) => s + 1, 0); // order count as fallback
        const sold = stats?.sold ?? soldFromOrders;
        const total = stats?.total ?? 0;
        const checkinsForEvent = 0; // TODO: link checkins to event_id if available

        return {
            id: e.id,
            title: e.title,
            startAt: config?.start_time ? `${getNYDateString()}T${config.start_time}` : e.created_at,
            venue: (e as any).venue_name || 'Venue',
            sold,
            total: total || 1,
            checkedIn: checkinsForEvent,
            image: e.poster_url,
            badge: undefined 
        };
    });

  // Checkins Today (Global for merchant)
  // Assuming checkins table links to event_id
  const { count: checkinsCount } = await supabase
      .from('checkins')
      .select('id', { count: 'exact', head: true })
      .in('event_id', eventIds)
      .gte('created_at', todayStart);

  return {
    totalEvents,
    upcomingEvents,
    totalTickets,
    checkedInToday: checkinsCount || 0,
    refunds,
    revenue,
    tonightEvents
  };
}
