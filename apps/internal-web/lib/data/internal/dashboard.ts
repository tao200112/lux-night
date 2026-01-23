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

    // 获取退款数据
    const { data: refundsData } = await supabase
      .from('orders')
      .select('id')
      .eq('status', 'refunded')
      .in(
        'id',
        (tickets || []).map((t: any) => t.order_id).filter(Boolean)
      );

    const refunds = refundsData?.length || 0;

    // 获取今晚的活动
    // 筛选逻辑：
    // 1. start_at 在今天范围内，或
    // 2. now 在 [start_at, end_at] 范围内（正在进行的活动），或
    // 3. start_at 在未来24h内
    const tonightStart = new Date(now);
    tonightStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(now);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);

    // 先获取所有可能相关的活动（今天开始或未来24h）
    const { data: tonightEventsData, error: tonightEventsError } = await supabase
      .from('events')
      .select(`
        id,
        title,
        start_at,
        end_at,
        poster_url,
        venues:venue_id (
          name
        )
      `)
      .eq('merchant_id', merchantId)
      .gte('start_at', tonightStart.toISOString())
      .lt('start_at', tomorrowStart.toISOString())
      .order('start_at', { ascending: true })
      .limit(10);

    // 如果查询失败，记录错误但继续
    if (tonightEventsError) {
      console.error('[DASHBOARD] Error fetching tonight events:', {
        code: tonightEventsError.code,
        message: tonightEventsError.message,
        merchantId,
      });
    }

    // 进一步筛选：包括正在进行的活动（now 在 [start_at, end_at] 范围内）
    const nowISO = now.toISOString();
    const filteredEvents = (tonightEventsData || []).filter((event: any) => {
      const startAt = new Date(event.start_at);
      const endAt = event.end_at ? new Date(event.end_at) : null;
      
      // 今天开始的活动
      if (startAt >= tonightStart && startAt < tomorrowStart) {
        return true;
      }
      
      // 正在进行的活动（now 在 [start_at, end_at] 范围内）
      if (endAt && startAt <= now && endAt >= now) {
        return true;
      }
      
      return false;
    }).slice(0, 5); // 限制为5个

    // 获取每个活动的票务数据
    const tonightEvents = await Promise.all(
      filteredEvents.map(async (event: any) => {
        const { data: eventTickets } = await supabase
          .from('tickets')
          .select('id, status')
          .eq('event_id', event.id);

        const sold = eventTickets?.filter((t: any) => t.status === 'sold').length || 0;
        const total = eventTickets?.length || 0;

        const { data: eventCheckins } = await supabase
          .from('checkins')
          .select('id')
          .eq('event_id', event.id)
          .eq('result', 'OK')
          .eq('success', true);

        const checkedIn = eventCheckins?.length || 0;

        return {
          id: event.id,
          title: event.title,
          startAt: event.start_at,
          venue: event.venues?.name || 'Unknown',
          sold,
          total,
          checkedIn,
          image: event.poster_url,
        };
      })
    );

    return {
      totalEvents: events?.length || 0,
      upcomingEvents,
      totalTickets,
      checkedInToday,
      refunds,
      revenue: {
        today: revenueToday / 100, // 转换为美元
        thisWeek: revenueThisWeek / 100,
        thisMonth: revenueThisMonth / 100,
      },
      tonightEvents,
    };
  }

  return {
    totalEvents: events?.length || 0,
    upcomingEvents,
    totalTickets: 0,
    checkedInToday: 0,
    refunds: 0,
    revenue: {
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
    },
    tonightEvents: [],
  };
}
