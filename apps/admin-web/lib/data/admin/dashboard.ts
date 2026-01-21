/**
 * Admin Dashboard Data Fetching
 * Dashboard 数据获取逻辑（复用 API route 的逻辑）
 */

import { createClient } from '@/lib/supabase/server';

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
    
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      throw new Error('Must be admin');
    }
    
    // 计算时间范围（最近 30 天）
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    
    // 并行获取所有数据
    const [
      revenueResult,
      ordersResult,
      ticketsResult,
      pendingResult,
      ordersByRegionResult,
      topMerchantsResult,
    ] = await Promise.all([
      // 1. Total Revenue (最近 30 天)
      supabase.from('orders').select('total_cents').gte('created_at', thirtyDaysAgo.toISOString()).eq('status', 'completed'),
      // 2. Orders Today
      supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()).lte('created_at', todayEnd.toISOString()),
      // 3. Tickets Redeemed Today
      supabase.from('checkins').select('*', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
      // 4. Pending Approvals
      supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      // 5. Orders by Region
      supabase.from('orders').select('id, events!inner(region_id, regions!inner(name))').gte('created_at', thirtyDaysAgo.toISOString()).eq('status', 'completed'),
      // 6. Top Merchants
      supabase.from('orders').select('events!inner(merchant_id, merchants!inner(name))').gte('created_at', thirtyDaysAgo.toISOString()).eq('status', 'completed').limit(100),
    ]);
    
    // 处理数据
    const totalRevenue = (revenueResult.data || []).reduce((sum, o) => sum + (o.total_cents || 0), 0);
    const netRevenue = Math.round(totalRevenue * 0.79);
    const ordersToday = ordersResult.count || 0;
    const ticketsRedeemed = ticketsResult.count || 0;
    const pendingApprovals = pendingResult.count || 0;
    
    // 前 30 天的数据（用于对比）
    const { data: previousRevenueData } = await supabase
      .from('orders')
      .select('total_cents')
      .gte('created_at', sixtyDaysAgo.toISOString())
      .lt('created_at', thirtyDaysAgo.toISOString())
      .eq('status', 'completed');
    
    const previousRevenue = previousRevenueData?.reduce((sum, order) => sum + (order.total_cents || 0), 0) || 0;
    const previousNetRevenue = Math.round(previousRevenue * 0.79);
    
    // 昨天的订单（用于对比）
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStart = new Date(yesterday);
    yesterdayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);
    
    const { count: previousOrdersToday } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', yesterdayStart.toISOString())
      .lte('created_at', yesterdayEnd.toISOString());
    
    // 计算趋势百分比（修复 NaN）
    const calculateTrend = (current: number, previous: number): number | null => {
      if (previous === 0 || isNaN(previous)) {
        return null; // 显示 —
      }
      const trend = ((current - previous) / previous) * 100;
      return isNaN(trend) ? null : Math.round(trend);
    };
    
    const revenueTrendPercent = calculateTrend(totalRevenue, previousRevenue);
    const netRevenueTrendPercent = calculateTrend(netRevenue, previousNetRevenue);
    const ordersTrendPercent = calculateTrend(ordersToday, previousOrdersToday || 0);
    
    // 格式化金额
    const formatCurrency = (cents: number): string => {
      const dollars = cents / 100;
      if (dollars >= 1000000) return `$${(dollars / 1000000).toFixed(2)}M`;
      if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}K`;
      return `$${dollars.toFixed(0)}`;
    };
    
    // 按地区统计
    const regionStats: Record<string, { name: string; count: number; percentage: number }> = {};
    const totalOrdersByRegion = ordersByRegionResult.data?.length || 0;
    
    ordersByRegionResult.data?.forEach((order: any) => {
      const regionId = order.events?.region_id;
      const regionName = order.events?.regions?.name || 'Unknown';
      
      if (!regionStats[regionId]) {
        regionStats[regionId] = { name: regionName, count: 0, percentage: 0 };
      }
      regionStats[regionId].count++;
    });
    
    Object.keys(regionStats).forEach((regionId) => {
      regionStats[regionId].percentage = totalOrdersByRegion > 0
        ? Math.round((regionStats[regionId].count / totalOrdersByRegion) * 100)
        : 0;
    });
    
    // Top Merchants 统计
    const merchantStats: Record<string, { name: string; count: number }> = {};
    
    topMerchantsResult.data?.forEach((order: any) => {
      const merchantId = order.events?.merchant_id;
      const merchantName = (order.events?.merchants && Array.isArray(order.events.merchants) && order.events.merchants.length > 0) 
        ? order.events.merchants[0].name 
        : 'Unknown';
      
      if (!merchantStats[merchantId]) {
        merchantStats[merchantId] = { name: merchantName, count: 0 };
      }
      merchantStats[merchantId].count++;
    });
    
    const topMerchantsList = Object.entries(merchantStats)
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    // Revenue Trend (最近 7 天)
    const revenueTrend: Array<{ date: string; revenue: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      
      const { data: dayOrders } = await supabase
        .from('orders')
        .select('total_cents')
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString())
        .eq('status', 'completed');
      
      const dayRevenue = dayOrders?.reduce((sum, order) => sum + (order.total_cents || 0), 0) || 0;
      
      revenueTrend.push({
        date: dayStart.toISOString().split('T')[0],
        revenue: dayRevenue,
      });
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
          formatted: ordersToday.toLocaleString(),
          trend: ordersTrendPercent,
        },
        ticketsRedeemed: {
          formatted: ticketsRedeemed >= 1000 ? `${(ticketsRedeemed / 1000).toFixed(1)}K` : ticketsRedeemed.toString(),
          trend: null,
        },
        totalMerchants: {
          formatted: '0', // TODO: 如果需要可以查询
        },
        activeEvents: {
          formatted: '0', // TODO: 如果需要可以查询
        },
      },
      revenueTrend,
      ordersByRegion: Object.values(regionStats).sort((a, b) => b.count - a.count),
      topMerchants: topMerchantsList,
      alerts,
      pendingApprovals,
    };
  } catch (error: any) {
    console.error('[ADMIN DASHBOARD DATA] Error:', error);
    throw error;
  }
}
