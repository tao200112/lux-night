/**
 * GET /api/admin/overview
 * Admin Dashboard Overview API
 * 返回 Dashboard KPI、趋势、Top Merchants、按地区订单等
 * 
 * Fixed:
 * 1. Uses amount_cents instead of total_cents.
 * 2. Status filter: paid, fulfilled, completed.
 * 3. Decoupled Aggregation (no inner joins that filter out unlinked orders).
 */

import { NextRequest, NextResponse } from 'next/server';
import { handlerWrapper, requireAdmin, withTimeout, type ApiResponse } from '@/lib/admin/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 15000;

export const GET = handlerWrapper(async (request: NextRequest): Promise<NextResponse> => {
  let step = 'init';

  try {
    // STEP 1: Auth Check
    step = 'auth_check';
    const authResult = await withTimeout(
      requireAdmin(request),
      TIMEOUT_MS,
      'requireAdmin'
    );

    if ('status' in authResult) {
      return authResult.response;
    }

    const { adminClient } = authResult;
    step = 'auth_ok';

    // Calculate Dates
    const now = new Date();
    // Start of Today
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // 30 Days Ago
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    // 60 Days Ago (for trend comparison)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // STEP 2: Fetch Orders (Raw) for last 60 days
    // We fetch a bit more data to handle trends and multiple stats in one go if possible, 
    // or we can make parallel queries. Given the volume might be 100s or 1000s, fetching ID/Amount/Status/Date is efficient.
    step = 'fetch_orders';
    
    const { data: allOrders, error: ordersError } = await adminClient
      .from('orders')
      .select('id, amount_cents, status, created_at, event_v2_id')
      .gte('created_at', sixtyDaysAgo.toISOString())
      .in('status', ['paid', 'fulfilled', 'completed']); // Strict status filter

    if (ordersError) {
      throw new Error(`Orders query failed: ${ordersError.message}`);
    }

    const orders = allOrders || [];

    // Filter subsets in memory
    const recentOrders = orders.filter((o: any) => new Date(o.created_at) >= thirtyDaysAgo);
    const previousOrders = orders.filter((o: any) => {
        const d = new Date(o.created_at);
        return d >= sixtyDaysAgo && d < thirtyDaysAgo;
    });

    // Subsets for Today
    const todayOrders = recentOrders.filter((o: any) => new Date(o.created_at) >= todayStart);
    
    // Previous Period (Yesterday) - simplified comparison
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);
    yesterdayEnd.setMilliseconds(-1);
    
    const yesterdayOrders = orders.filter((o: any) => {
        const d = new Date(o.created_at);
        return d >= yesterdayStart && d <= yesterdayEnd;
    });

    // STEP 3: KPIs Calculation
    step = 'calc_kpis';
    
    // 1. Revenue
    const totalRevenue = recentOrders.reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0);
    const previousRevenue = previousOrders.reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0);
    
    const netRevenue = Math.round(totalRevenue * 0.79); // 21% take assumption
    const previousNetRevenue = Math.round(previousRevenue * 0.79);

    // 2. Orders Count
    const ordersCount = todayOrders.length;
    const previousOrdersCount = yesterdayOrders.length;

    // 3. Trends
    const calculateTrend = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
    };

    const revenueTrend = calculateTrend(totalRevenue, previousRevenue);
    const netRevenueTrend = calculateTrend(netRevenue, previousNetRevenue);
    const ordersTrend = calculateTrend(ordersCount, previousOrdersCount);

    // STEP 4: Fetch Metadata for Aggregations (Events, Merchants, Regions)
    step = 'fetch_metadata';

    const eventIds = [...new Set(recentOrders.map((o: any) => o.event_v2_id).filter(Boolean))];
    
    // 4a. Fetch Events V2
    const { data: events, error: eventsError } = await adminClient
      .from('events_v2')
      .select('id, title, merchant_id')
      .in('id', eventIds);
    
    if (eventsError) throw eventsError;

    const eventsList = events || [];
    const eventMap = eventsList.reduce((acc: any, e: any) => { acc[e.id] = e; return acc; }, {});

    // 4b. Fetch Merchants & Regions
    const merchantIds = [...new Set(eventsList.map((e: any) => e.merchant_id).filter(Boolean))];
    const { data: merchants, error: merchantsError } = await adminClient
      .from('merchants')
      .select('id, name, region_id, regions(id, name)')
      .in('id', merchantIds);

    if (merchantsError) throw merchantsError;

    const merchantsList = merchants || [];
    const merchantMap = merchantsList.reduce((acc: any, m: any) => { acc[m.id] = m; return acc; }, {});

    // STEP 5: Complex Aggregations
    step = 'aggregations';

    // 5a. Orders by Region
    const regionStats: Record<string, { name: string; count: number }> = {};
    let unlinkedOrdersCount = 0;

    recentOrders.forEach((order: any) => {
        const eventId = order.event_v2_id;
        if (!eventId) {
            unlinkedOrdersCount++;
            return;
        }

        const event = eventMap[eventId];
        const merchant = event ? merchantMap[event.merchant_id] : null;
        const region = merchant ? merchant.regions : null; // Access nested region

        if (region) {
            if (!regionStats[region.id]) {
                regionStats[region.id] = { name: region.name || 'Unknown Region', count: 0 };
            }
            regionStats[region.id].count++;
        } else {
             // Count as Unlinked/Unknown Region
             if (!regionStats['unknown']) {
                 regionStats['unknown'] = { name: 'Unknown Region', count: 0 };
             }
             regionStats['unknown'].count++;
        }
    });

    const ordersByRegion = Object.values(regionStats).sort((a, b) => b.count - a.count);

    // 5b. Top Merchants
    const merchantStats: Record<string, { name: string; count: number }> = {};
    
    recentOrders.forEach((order: any) => {
        const eventId = order.event_v2_id;
        if (!eventId) return;

        const event = eventMap[eventId];
        const merchant = event ? merchantMap[event.merchant_id] : null;

        if (merchant) {
             if (!merchantStats[merchant.id]) {
                 merchantStats[merchant.id] = { name: merchant.name, count: 0 };
             }
             merchantStats[merchant.id].count++;
        }
    });

    const topMerchants = Object.entries(merchantStats)
        .map(([id, stats]) => ({ id, ...stats }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // 5c. Revenue Trend (Daily for last 7 days)
    const revenueTrendData: { date: string; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Filter orders for this day (local time approx by UTC date string match for simplicity, or strict date range)
        // Using string match on created_at is safer for simple buckets
        const dayRevenue = recentOrders
            .filter((o: any) => o.created_at.startsWith(dateStr))
            .reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0);
        
        revenueTrendData.push({ date: dateStr, revenue: dayRevenue });
    }

    // STEP 6: Other Counts (Independent queries)
    step = 'other_counts';

    const [totalMerchantsRes, activeEventsRes, pendingApprovalsRes, checkinsRes] = await Promise.all([
        adminClient.from('merchants').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        adminClient.from('events_v2').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        adminClient.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'), // Assuming 'requests' table exists
        adminClient.from('checkins').select('*', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString())
    ]);

    const totalMerchants = totalMerchantsRes.count || 0;
    const activeEvents = activeEventsRes.count || 0;
    const pendingApprovals = pendingApprovalsRes.count || 0;
    const ticketsRedeemed = checkinsRes.count || 0;

    // STEP 7: Alerts
    const alerts = [];
    if (pendingApprovals > 0) {
        alerts.push({
            type: 'pending_approvals',
            title: 'Pending Approvals',
            message: `${pendingApprovals} requests waiting.`,
            severity: 'info'
        });
    }

    if (unlinkedOrdersCount > 0) {
        alerts.push({
            type: 'unlinked_orders',
            title: 'Data Integrity Warning',
            message: `Found ${unlinkedOrdersCount} unlinked orders (missing event link).`,
            severity: 'warning'
        });
    }

    // Helper formatter
    const formatCurrency = (cents: number): string => {
      const dollars = cents / 100;
      if (dollars >= 1000000) return `$${(dollars / 1000000).toFixed(2)}M`;
      if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}K`;
      return `$${dollars.toFixed(0)}`;
    };

    step = 'success';
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        kpis: {
          totalRevenue: {
             value: totalRevenue / 100,
             formatted: formatCurrency(totalRevenue),
             trend: revenueTrend
          },
          netRevenue: {
             value: netRevenue / 100,
             formatted: formatCurrency(netRevenue),
             trend: netRevenueTrend
          },
          ordersToday: {
              value: ordersCount,
              formatted: ordersCount.toLocaleString(),
              trend: ordersTrend
          },
          ticketsRedeemed: {
              value: ticketsRedeemed,
              formatted: ticketsRedeemed >= 1000 ? `${(ticketsRedeemed/1000).toFixed(1)}K` : ticketsRedeemed.toString(),
              trend: null
          },
          totalMerchants: {
              value: totalMerchants,
              formatted: totalMerchants.toLocaleString()
          },
          activeEvents: {
              value: activeEvents,
              formatted: activeEvents.toLocaleString()
          }
        },
        revenueTrend: revenueTrendData,
        ordersByRegion,
        topMerchants,
        alerts,
        pendingApprovals,
        debug: {
            unlinkedOrdersCount
        }
      },
      step
    });

  } catch (error: any) {
    console.error('[ADMIN OVERVIEW API] Error:', error);
    return NextResponse.json<ApiResponse>(
      {
        ok: false,
        error: 'Internal Server Error',
        code: 'INTERNAL_ERROR',
        message: error.message || 'Unexpected error',
        step,
      },
      { status: 500 }
    );
  }
});
