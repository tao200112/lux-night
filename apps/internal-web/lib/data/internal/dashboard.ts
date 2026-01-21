/**
 * Internal Dashboard Data Queries
 * 商家端 Dashboard 数据查询
 */

import { createClient } from '@/lib/supabase/server';

export interface DashboardStats {
  totalEvents: number;
  upcomingEvents: number;
  totalTickets: number;
  checkedInToday: number;
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
}

/**
 * 获取 Dashboard 统计数据
 */
export async function getDashboardStats(
  merchantId: string,
  venueId?: string
): Promise<DashboardStats> {
  const supabase = await createClient();

  // 获取活动数据
  let eventsQuery = supabase
    .from('events')
    .select('id, status, start_at')
    .eq('merchant_id', merchantId);

  if (venueId) {
    eventsQuery = eventsQuery.eq('venue_id', venueId);
  }

  const { data: events } = await eventsQuery;

  const now = new Date();
  const upcomingEvents = events?.filter(
    (e: any) => new Date(e.start_at) > now && e.status === 'published'
  ).length || 0;

  // 获取票务数据
  let ticketsQuery = supabase
    .from('tickets')
    .select('id, status, created_at')
    .in(
      'event_id',
      (events || []).map((e: any) => e.id)
    );

  if (ticketsQuery) {
    const { data: tickets } = await ticketsQuery;
    const totalTickets = tickets?.length || 0;

    // 获取今日核销数据
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const { data: checkinsToday } = await supabase
      .from('checkins')
      .select('id')
      .eq('result', 'OK')
      .eq('success', true)
      .gte('created_at', todayStart.toISOString());

    const checkedInToday = checkinsToday?.length || 0;

    // 获取今日订单数据（revenue）
    const { data: ordersToday } = await supabase
      .from('orders')
      .select('amount_cents')
      .eq('status', 'paid')
      .in(
        'id',
        (tickets || []).map((t: any) => t.order_id).filter(Boolean)
      )
      .gte('created_at', todayStart.toISOString());

    const revenueToday = ordersToday?.reduce(
      (sum: number, o: any) => sum + (o.amount_cents || 0),
      0
    ) || 0;

    // 获取本周起始时间
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const { data: ordersThisWeek } = await supabase
      .from('orders')
      .select('amount_cents')
      .eq('status', 'paid')
      .in(
        'id',
        (tickets || []).map((t: any) => t.order_id).filter(Boolean)
      )
      .gte('created_at', weekStart.toISOString());

    const revenueThisWeek = ordersThisWeek?.reduce(
      (sum: number, o: any) => sum + (o.amount_cents || 0),
      0
    ) || 0;

    // 获取本月起始时间
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data: ordersThisMonth } = await supabase
      .from('orders')
      .select('amount_cents')
      .eq('status', 'paid')
      .in(
        'id',
        (tickets || []).map((t: any) => t.order_id).filter(Boolean)
      )
      .gte('created_at', monthStart.toISOString());

    const revenueThisMonth = ordersThisMonth?.reduce(
      (sum: number, o: any) => sum + (o.amount_cents || 0),
      0
    ) || 0;

    return {
      totalEvents: events?.length || 0,
      upcomingEvents,
      totalTickets,
      checkedInToday,
      revenue: {
        today: revenueToday / 100, // 转换为美元
        thisWeek: revenueThisWeek / 100,
        thisMonth: revenueThisMonth / 100,
      },
    };
  }

  return {
    totalEvents: events?.length || 0,
    upcomingEvents,
    totalTickets: 0,
    checkedInToday: 0,
    revenue: {
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
    },
  };
}
