/**
 * Admin Dashboard Data Fetching
 * Dashboard 数据获取逻辑
 * 
 * Update 2026-02-01:
 * - Uses orders.merchant_id as source of truth.
 * - Adds Top Invites / Top Ambassadors / Unlinked Orders stats.
 */

import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/admin/api';
import { getNYStartOfDay, getNYDateString } from '@lux-night/shared/timezone'; 

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
  topMerchants: Array<{ id: string; name: string; count: number; revenue: number; revenueFormatted: string }>;
  topInvites: Array<{ code: string; ambassadorName: string; merchantName: string; revenue: number; orders: number }>;
  topAmbassadors: Array<{ name: string; merchantName: string; revenue: number; orders: number }>;
  alerts: Array<{ type: string; title: string; message: string; severity: 'warning' | 'error' | 'info' }>;
  pendingApprovals: number;
}

export async function getDashboardData(): Promise<DashboardData | null> {
  try {
    const supabase = await createClient();
    
    // Auth Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Must be logged in');
    
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) throw new Error('Must be admin');
    
    // Admin Client
    const adminClient = createServiceRoleClient();

    // Dates
    const now = new Date();
    const todayStart = new Date(getNYStartOfDay(now));
    
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // FETCH ORDERS with new fields
    const { data: allOrders, error: ordersError } = await adminClient
        .from('orders')
        .select('id, amount_cents, status, created_at, merchant_id, invite_id, ambassador_id')
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

    // KPI Calculation
    const totalRevenueCents = recentOrders.reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0);
    const previousRevenueCents = previousOrders.reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0);
    
    // Net Revenue (Wait, what is the logic? previously it was just totalRevenue or * 0.79? prompt from step 233 had 'netRevenue = totalRevenue'. Route.ts had 0.79. I'll stick to Route.ts 0.79 assumption or just 100% since "Net" usually implies "after stripe fees" but we don't know stripe fees exactly without fetching. I'll use 100% for now or 0.79 if that's business logic. I'll use 0.79 to match route.ts)
    const netRevenueCents = Math.round(totalRevenueCents * 0.79);
    const previousNetRevenueCents = Math.round(previousRevenueCents * 0.79);

    const ordersCount = todayOrdersArr.length;
    const previousOrdersCount = yesterdayOrders.length;

    const calculateTrend = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);
    
    const revenueTrendPercent = calculateTrend(totalRevenueCents, previousRevenueCents);
    const netRevenueTrendPercent = calculateTrend(netRevenueCents, previousNetRevenueCents);
    const ordersTrendPercent = calculateTrend(ordersCount, previousOrdersCount);

    // Fetch Independent Counts
    const [ticketsRes, requestsRes, merchantsRes, eventsRes] = await Promise.all([
        adminClient.from('checkins').select('*', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
        adminClient.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        adminClient.from('merchants').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        adminClient.from('events_v2').select('*', { count: 'exact', head: true }).eq('status', 'active')
    ]);

    const ticketsRedeemed = ticketsRes.count || 0;
    const pendingApprovals = requestsRes.count || 0;
    const totalMerchantsCount = merchantsRes.count || 0;
    const activeEvents = eventsRes.count || 0;

    // Aggregations
    const merchantAgg: Record<string, { revenue: number; count: number }> = {};
    const inviteAgg: Record<string, { revenue: number; count: number; invite_id: string }> = {};
    const ambassadorAgg: Record<string, { revenue: number; count: number; ambassador_id: string }> = {};
    let unlinkedOrdersCount = 0;

    recentOrders.forEach((o: any) => {
        if (!o.merchant_id) unlinkedOrdersCount++;
        
        if (o.merchant_id) {
            if (!merchantAgg[o.merchant_id]) merchantAgg[o.merchant_id] = { revenue: 0, count: 0 };
            merchantAgg[o.merchant_id].revenue += o.amount_cents;
            merchantAgg[o.merchant_id].count++;
        }
        
        if (o.invite_id) {
            if (!inviteAgg[o.invite_id]) inviteAgg[o.invite_id] = { revenue: 0, count: 0, invite_id: o.invite_id };
            inviteAgg[o.invite_id].revenue += o.amount_cents;
            inviteAgg[o.invite_id].count++;
        }
        
        if (o.ambassador_id) {
             if (!ambassadorAgg[o.ambassador_id]) ambassadorAgg[o.ambassador_id] = { revenue: 0, count: 0, ambassador_id: o.ambassador_id };
             ambassadorAgg[o.ambassador_id].revenue += o.amount_cents;
             ambassadorAgg[o.ambassador_id].count++;
        }
    });

    // Top Lists IDs
    const topMerchantIds = Object.keys(merchantAgg).sort((a,b) => merchantAgg[b].revenue - merchantAgg[a].revenue).slice(0, 5);
    const topInviteIds = Object.keys(inviteAgg).sort((a,b) => inviteAgg[b].revenue - inviteAgg[a].revenue).slice(0, 5);
    const topAmbassadorIds = Object.keys(ambassadorAgg).sort((a,b) => ambassadorAgg[b].revenue - ambassadorAgg[a].revenue).slice(0, 5);

    // Metadata Fetch
    const pMerchants = topMerchantIds.length > 0 ? adminClient.from('merchants').select('id, name').in('id', topMerchantIds) : Promise.resolve({ data: [] });
    const pInvites = topInviteIds.length > 0 ? adminClient.from('ambassador_invites').select('id, code, merchant_id, ambassador:ambassadors(display_name)').in('id', topInviteIds) : Promise.resolve({ data: [] });
    const pAmbassadors = topAmbassadorIds.length > 0 ? adminClient.from('ambassadors').select('id, display_name, merchant_id').in('id', topAmbassadorIds) : Promise.resolve({ data: [] });

    // We also need merchant names for Invites and Ambassadors list rows
    // Efficiently: we need them. For now, fetch ALL merchants mentioned in top lists.
    const [merchantsDataRes, invitesRes, ambassadorsRes] = await Promise.all([pMerchants, pInvites, pAmbassadors]);
    
    // Map
    const merchantsMap: Record<string, any> = {};
    (merchantsDataRes.data || []).forEach((m: any) => merchantsMap[m.id] = m);
    
    // Check if we need more merchants (for invites/ambassadors)
    const extraMerchantIds = new Set<string>();
    (invitesRes.data || []).forEach((i: any) => extraMerchantIds.add(i.merchant_id));
    (ambassadorsRes.data || []).forEach((a: any) => extraMerchantIds.add(a.merchant_id));
    
    const missingMerchantIds = [...extraMerchantIds].filter(id => !merchantsMap[id]);
    if (missingMerchantIds.length > 0) {
        const { data: moreMerchants } = await adminClient.from('merchants').select('id, name').in('id', missingMerchantIds);
        (moreMerchants || []).forEach((m: any) => merchantsMap[m.id] = m);
    }

    // Assemble Lists
    const formatCurrency = (cents: number): string => {
      const dollars = cents / 100;
      if (dollars >= 1000000) return `$${(dollars / 1000000).toFixed(2)}M`;
      if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}K`;
      return `$${dollars.toFixed(0)}`;
    };

    const topMerchants = topMerchantIds.map(id => ({
        id,
        name: merchantsMap[id]?.name || 'Unknown',
        count: merchantAgg[id].count,
        revenue: merchantAgg[id].revenue,
        revenueFormatted: formatCurrency(merchantAgg[id].revenue)
    }));

    const topInvites = topInviteIds.map(id => {
        const inv = (invitesRes.data || []).find((i: any) => i.id === id);
        return {
            code: inv?.code || '???',
            // @ts-ignore
            ambassadorName: inv?.ambassador?.display_name || 'Unknown',
            merchantName: merchantsMap[inv?.merchant_id]?.name || 'Unknown',
            revenue: inviteAgg[id].revenue,
            orders: inviteAgg[id].count
        };
    });

    const topAmbassadors = topAmbassadorIds.map(id => {
        const amb = (ambassadorsRes.data || []).find((a: any) => a.id === id);
        return {
            name: amb?.display_name || 'Unknown',
            merchantName: merchantsMap[amb?.merchant_id]?.name || 'Unknown',
            revenue: ambassadorAgg[id].revenue,
            orders: ambassadorAgg[id].count
        };
    });

    // Orders by Region (via merchant.region_id)
    const merchantIds = [...new Set(recentOrders.map((o: any) => o.merchant_id).filter(Boolean))];
    const regionAgg: Record<string, { count: number; revenue: number }> = {};
    let regionNameMap: Record<string, string> = {};
    if (merchantIds.length > 0) {
      const { data: merchants } = await adminClient
        .from('merchants')
        .select('id, region_id')
        .in('id', merchantIds);
      const merchantRegionMap: Record<string, string> = {};
      (merchants || []).forEach((m: any) => {
        if (m.region_id) merchantRegionMap[m.id] = m.region_id;
      });
      const regionIds = [...new Set(Object.values(merchantRegionMap))];
      if (regionIds.length > 0) {
        const { data: regions } = await adminClient.from('regions').select('id, name').in('id', regionIds);
        (regions || []).forEach((r: any) => { regionNameMap[r.id] = r.name; });
      }
      recentOrders.forEach((o: any) => {
        const rid = o.merchant_id ? merchantRegionMap[o.merchant_id] : null;
        if (!rid) return;
        if (!regionAgg[rid]) regionAgg[rid] = { count: 0, revenue: 0 };
        regionAgg[rid].count++;
        regionAgg[rid].revenue += o.amount_cents || 0;
      });
    }
    const totalRegionOrders = Object.values(regionAgg).reduce((s, v) => s + v.count, 0);
    const ordersByRegion = Object.entries(regionAgg).map(([rid, v]) => ({
      name: regionNameMap[rid] || 'Unknown',
      count: v.count,
      percentage: totalRegionOrders > 0 ? Math.round((v.count / totalRegionOrders) * 100) : 0,
    })).sort((a, b) => b.count - a.count);

    // Revenue Trend
    const revenueTrend: Array<{ date: string; revenue: number }> = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = getNYDateString(d);
        const dayRevenue = recentOrders
            .filter((o: any) => o.created_at.startsWith(dateStr))
            .reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0);
        revenueTrend.push({ date: dateStr, revenue: dayRevenue });
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
            message: `Found ${unlinkedOrdersCount} orders not linked to any merchant.`,
            severity: 'warning'
        });
    }

    console.log('[DASHBOARD DATA] Calculated:', {
        ordersFound: orders.length,
        totalRevenue: totalRevenueCents
    });

    return {
      kpis: {
        totalRevenue: {
          formatted: formatCurrency(totalRevenueCents),
          trend: revenueTrendPercent,
        },
        netRevenue: {
          formatted: formatCurrency(netRevenueCents),
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
          formatted: totalMerchantsCount.toLocaleString(),
        },
        activeEvents: {
          formatted: activeEvents.toLocaleString(),
        },
      },
      revenueTrend,
      ordersByRegion,
      topMerchants,
      topInvites,
      topAmbassadors,
      alerts,
      pendingApprovals,
    };
  } catch (error: any) {
    console.error('[ADMIN DASHBOARD DATA] Error:', error);
    throw error;
  }
}
