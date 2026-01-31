/**
 * Admin Dashboard Data Fetching
 * Dashboard 数据获取逻辑
 * 
 * Fixed:
 * 1. Uses amount_cents instead of total_cents.
 * 2. Status filter: paid, fulfilled, completed.
 * 3. Decoupled Aggregation (no inner joins that filter out unlinked orders).
 */

import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/admin/api'; 
// Note: We might need service role if RLS blocks aggregation, but usually for "admin" user authenticated via Supabase it should be fine.
// However, dashboard.ts is a server action/library used in Server Components. 
// Step 1 check confirms user is logged in.

export interface DashboardData {
  kpis: {
    totalRevenue: { formatted: string; trend: number | null };
    netRevenue: { formatted: string; trend: number | null };
    ordersToday: { formatted: string; trend: number | null };
    ticketsRedeemed: { formatted: string; trend: number | null };
    totalMerchants: { formatted: string };
    activeEvents: { formatted: string };
  };
  revenueTrend: Array<{ date: string; revenue: number }>;
  ordersByRegion: Array<{ name: string; count: number; percentage: number }>;
  topMerchants: Array<{ id: string; name: string; count: number }>;
  alerts: Array<{ type: string; title: string; message: string; severity: 'warning' | 'error' | 'info' }>;
  pendingApprovals: number;
}

export async function getDashboardData(): Promise<DashboardData | null> {
  try {
    const supabase = await createClient();
    
    // 检查 Admin 权限
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Must be logged in');
    }
    
    // We can use the user's client if they are admin, or switch to service role if needed.
    // For safety against RLS blocking aggregations completely, we'll verify admin then proceed.
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      throw new Error('Must be admin');
    }
    
    // Use Service Role Client for consistent data access without RLS filtering noise (optional but safer for admin dashboard)
    const adminClient = createServiceRoleClient();

    // Calculate Dates
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // ============================================
    // STEP 1: Fetch Orders (Decoupled & Raw)
    // ============================================
    // Fetch last 60 days to handle trends
    const { data: allOrders, error: ordersError } = await adminClient
        .from('orders')
        .select('id, amount_cents, status, created_at, event_v2_id')
        .gte('created_at', sixtyDaysAgo.toISOString())
        .in('status', ['paid', 'fulfilled', 'completed']);

    if (ordersError) throw new Error(`Orders fetch failed: ${ordersError.message}`);
    const orders = allOrders || [];

    // Memory Filters
    const recentOrders = orders.filter((o: any) => new Date(o.created_at) >= thirtyDaysAgo);
    const previousOrders = orders.filter((o: any) => {
        const d = new Date(o.created_at);
        return d >= sixtyDaysAgo && d < thirtyDaysAgo;
    });

    const todayOrdersArr = recentOrders.filter((o: any) => new Date(o.created_at) >= todayStart);
    
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);
    yesterdayEnd.setMilliseconds(-1);
    const yesterdayOrders = orders.filter((o: any) => {
        const d = new Date(o.created_at);
        return d >= yesterdayStart && d <= yesterdayEnd;
    });

    // ============================================
    // STEP 2: Calculate KPIs
    // ============================================
    const totalRevenue = recentOrders.reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0);
    const previousRevenue = previousOrders.reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0);

    // Net Revenue = Total Revenue (temporarily, per instruction)
    const netRevenue = totalRevenue; 
    const previousNetRevenue = previousRevenue;

    const ordersCount = todayOrdersArr.length;
    const previousOrdersCount = yesterdayOrders.length;

    // Trend Calc
    const calculateTrend = (current: number, previous: number): number | null => {
      if (previous === 0) return current > 0 ? 100 : 0; // or null
      const trend = ((current - previous) / previous) * 100;
      return isNaN(trend) ? null : Math.round(trend);
    };

    const revenueTrendPercent = calculateTrend(totalRevenue, previousRevenue);
    const netRevenueTrendPercent = calculateTrend(netRevenue, previousNetRevenue);
    const ordersTrendPercent = calculateTrend(ordersCount, previousOrdersCount);

    // ============================================
    // STEP 3: Fetch Independent Counts
    // ============================================
    const [ticketsRes, requestsRes, merchantsRes, eventsRes] = await Promise.all([
        adminClient.from('checkins').select('*', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
        adminClient.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        adminClient.from('merchants').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        adminClient.from('events_v2').select('*', { count: 'exact', head: true }).eq('status', 'active')
    ]);

    const ticketsRedeemed = ticketsRes.count || 0;
    const pendingApprovals = requestsRes.count || 0;
    const totalMerchants = merchantsRes.count || 0;
    const activeEvents = eventsRes.count || 0;

    // ============================================
    // STEP 4: Aggregations (Regions & Merchants)
    // ============================================
    const eventIds = [...new Set(recentOrders.map((o: any) => o.event_v2_id).filter(Boolean))];
    
    // Fetch Event Metadata
    const { data: eventsData } = await adminClient.from('events_v2').select('id, merchant_id').in('id', eventIds);
    const eventsMap = (eventsData || []).reduce((acc: any, e: any) => { acc[e.id] = e; return acc; }, {});

    const merchantIds = [...new Set((eventsData || []).map((e: any) => e.merchant_id).filter(Boolean))];
    
    // Fetch Merchant/Region Metadata
    const { data: merchantsData } = await adminClient
        .from('merchants')
        .select('id, name, region_id, regions(name)')
        .in('id', merchantIds);
    const merchantsMap = (merchantsData || []).reduce((acc: any, m: any) => { acc[m.id] = m; return acc; }, {});

    // Compute Stats
    const regionStats: Record<string, { name: string; count: number }> = {};
    const merchantOrders: Record<string, { name: string; count: number }> = {};
    let unlinkedOrdersCount = 0;

    recentOrders.forEach((o: any) => {
        if (!o.event_v2_id) {
            unlinkedOrdersCount++;
            return;
        }
        const event = eventsMap[o.event_v2_id];
        const merchant = event ? merchantsMap[event.merchant_id] : null;
        
        // Merchant Stats
        if (merchant) {
            if (!merchantOrders[merchant.id]) merchantOrders[merchant.id] = { name: merchant.name, count: 0 };
            merchantOrders[merchant.id].count++;
        }

        // Region Stats
        const regionName = merchant?.regions?.name || 'Unknown';
        const regionKey = merchant?.region_id || 'unknown';
        if (!regionStats[regionKey]) regionStats[regionKey] = { name: regionName, count: 0 };
        regionStats[regionKey].count++;
    });

    // Formatting
    const ordersByRegion = Object.values(regionStats)
        .sort((a, b) => b.count - a.count)
        .map(r => ({
            ...r,
            percentage: recentOrders.length > 0 ? Math.round((r.count / recentOrders.length) * 100) : 0
        }));

    const topMerchants = Object.entries(merchantOrders)
        .map(([id, stats]) => ({ id, ...stats }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // ============================================
    // STEP 5: Revenue Trend (Daily)
    // ============================================
    const revenueTrendData: Array<{ date: string; revenue: number }> = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        const dayRevenue = recentOrders
            .filter((o: any) => o.created_at.startsWith(dateStr))
            .reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0);
        
         revenueTrendData.push({ date: dateStr, revenue: dayRevenue });
    }

    // Alerts
    const alerts: Array<{ type: string; title: string; message: string; severity: 'warning' | 'error' | 'info' }> = [];
    if (pendingApprovals > 0) {
      alerts.push({
        type: 'pending_approvals',
        title: 'Pending Approvals',
        message: `${pendingApprovals} new requests are waiting for verification.`,
        severity: 'info',
      });
    }

    if (unlinkedOrdersCount > 0) {
         alerts.push({
            type: 'unlinked_orders',
            title: 'Data Integrity Warning',
            message: `Found ${unlinkedOrdersCount} orders not linked to any event.`,
            severity: 'warning'
        });
    }

    // Format Currency Helper
    const formatCurrency = (cents: number): string => {
      const dollars = cents / 100;
      if (dollars >= 1000000) return `$${(dollars / 1000000).toFixed(2)}M`;
      if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}K`;
      return `$${dollars.toFixed(0)}`;
    };

    console.log('[DASHBOARD DATA] Calculated:', {
        ordersFound: orders.length,
        recentOrders: recentOrders.length,
        totalRevenue,
        unlinkedOrdersCount
    });

    return {
      kpis: {
        totalRevenue: {
          formatted: formatCurrency(totalRevenue),
          trend: revenueTrendPercent,
        },
        netRevenue: {
          formatted: formatCurrency(netRevenue),
          trend: netRevenueTrendPercent,
        },
        ordersToday: {
          formatted: ordersCount.toLocaleString(),
          trend: ordersTrendPercent,
        },
        ticketsRedeemed: {
          formatted: ticketsRedeemed >= 1000 ? `${(ticketsRedeemed / 1000).toFixed(1)}K` : ticketsRedeemed.toString(),
          trend: null,
        },
        totalMerchants: {
          formatted: totalMerchants.toLocaleString(),
        },
        activeEvents: {
          formatted: activeEvents.toLocaleString(),
        },
      },
      revenueTrend: revenueTrendData,
      ordersByRegion,
      topMerchants,
      alerts,
      pendingApprovals,
    };
  } catch (error: any) {
    console.error('[ADMIN DASHBOARD DATA] Error:', error);
    throw error;
  }
}
