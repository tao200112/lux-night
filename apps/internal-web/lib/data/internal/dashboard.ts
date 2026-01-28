/**
 * Internal Dashboard Data Queries (V2)
 * 商家端 Dashboard 数据查询
 */

import { createClient } from '@/lib/supabase/server';

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
  // Approximation: Total tickets = number of orders * avg qty (or strictly query order_items)
  // For standard dashboard, order count is a decent proxy, but let's try order_items if possible.
  // We'll stick to order count or just paidOrders.length for "totalTickets" proxy or 0.
  const totalTickets = paidOrders.length; // Simplified

  // Time ranges
  const now = new Date();
  const todayStart = new Date(now.setHours(0,0,0,0)).toISOString();
  
  const weekStartFn = new Date();
  weekStartFn.setDate(weekStartFn.getDate() - weekStartFn.getDay());
  const weekStart = new Date(weekStartFn.setHours(0,0,0,0)).toISOString();
  
  const monthStartFn = new Date();
  monthStartFn.setDate(1);
  const monthStart = new Date(monthStartFn.setHours(0,0,0,0)).toISOString();

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
  
  const tonightEvents = (events || [])
    .filter((e: any) => tonightEventIds.has(e.id) && e.status === 'active')
    .map((e: any) => {
        // Find specific config for time
        const config = todayConfigs?.find((c: any) => c.event_weeks.event_id === e.id);
        
        // Calculate daily stats (simplified: just total for event)
        const eventOrders = paidOrders.filter((o: any) => o.event_id === e.id);
        
        return {
            id: e.id,
            title: e.title,
            startAt: config?.start_time ? `${new Date().toISOString().split('T')[0]}T${config.start_time}` : e.created_at,
            venue: 'Main Venue', // Placeholder
            sold: eventOrders.length,
            total: 100, // Mock cap or fetch from tickets
            checkedIn: 0, // Checkins require switch to V2
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
