/**
 * GET /api/admin/overview
 * Admin Dashboard Overview API
 * 返回 Dashboard KPI、趋势、Top Merchants、按地区订单等
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    
    // 检查 Admin 权限
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' },
        { status: 401 }
      );
    }
    
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', message: 'Must be admin' },
        { status: 403 }
      );
    }
    
    // 计算时间范围（最近 30 天）
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // 1. Total Revenue (最近 30 天)
    const { data: revenueData, error: revenueError } = await supabase
      .from('orders')
      .select('total_cents, status')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .eq('status', 'completed');
    
    const totalRevenue = revenueData?.reduce((sum, order) => sum + (order.total_cents || 0), 0) || 0;
    const netRevenue = Math.round(totalRevenue * 0.79); // 假设平台抽成 21%
    
    // 2. Orders Today
    const { count: ordersToday, error: ordersError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString());
    
    // 3. Total Merchants
    const { count: totalMerchants, error: merchantsError } = await supabase
      .from('merchants')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    
    // 4. Active Events (published)
    const { count: activeEvents, error: eventsError } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published')
      .gte('end_at', new Date().toISOString());
    
    // 5. Tickets Redeemed Today
    const { count: ticketsRedeemed, error: ticketsError } = await supabase
      .from('checkins')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString());
    
    // 6. Orders by Region (最近 30 天)
    const { data: ordersByRegion, error: regionError } = await supabase
      .from('orders')
      .select(`
        id,
        events!inner(
          region_id,
          regions!inner(name, state, country)
        )
      `)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .eq('status', 'completed');
    
    // 聚合按地区统计
    const regionStats: Record<string, { name: string; count: number; percentage: number }> = {};
    const totalOrders = ordersByRegion?.length || 0;
    
    ordersByRegion?.forEach((order: any) => {
      const regionId = order.events?.region_id;
      const regionName = order.events?.regions?.name || 'Unknown';
      
      if (!regionStats[regionId]) {
        regionStats[regionId] = {
          name: regionName,
          count: 0,
          percentage: 0,
        };
      }
      regionStats[regionId].count++;
    });
    
    // 计算百分比
    Object.keys(regionStats).forEach((regionId) => {
      regionStats[regionId].percentage = totalOrders > 0
        ? Math.round((regionStats[regionId].count / totalOrders) * 100)
        : 0;
    });
    
    // 7. Top Merchants (按订单数，最近 30 天)
    const { data: topMerchants, error: topMerchantsError } = await supabase
      .from('orders')
      .select(`
        events!inner(
          merchant_id,
          merchants!inner(name)
        )
      `)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .eq('status', 'completed')
      .limit(100);
    
    // 聚合商户统计
    const merchantStats: Record<string, { name: string; count: number }> = {};
    
    topMerchants?.forEach((order: any) => {
      const merchantId = order.events?.merchant_id;
      const merchantName = order.events?.merchants?.name || 'Unknown';
      
      if (!merchantStats[merchantId]) {
        merchantStats[merchantId] = { name: merchantName, count: 0 };
      }
      merchantStats[merchantId].count++;
    });
    
    // 转换为数组并排序
    const topMerchantsList = Object.entries(merchantStats)
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    // 8. Revenue Trend (最近 7 天，按天统计)
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
    
    // 9. Pending Approvals Count
    const { count: pendingApprovals, error: approvalsError } = await supabase
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    
    // 10. 计算趋势（最近 30 天 vs 前 30 天，修复 NaN% 问题）
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    
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
    const yesterdayStart = new Date(yesterday.setHours(0, 0, 0, 0));
    const yesterdayEnd = new Date(yesterday.setHours(23, 59, 59, 999));
    
    const { count: previousOrdersToday } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', yesterdayStart.toISOString())
      .lte('created_at', yesterdayEnd.toISOString());
    
    // 计算趋势百分比（修复 NaN）
    const calculateTrend = (current: number, previous: number): number => {
      if (previous === 0 || isNaN(previous)) {
        return current > 0 ? 0 : 0; // 如果前值为 0，显示 0% 或 —
      }
      const trend = ((current - previous) / previous) * 100;
      return isNaN(trend) ? 0 : Math.round(trend);
    };
    
    const revenueTrendPercent = calculateTrend(totalRevenue, previousRevenue);
    const netRevenueTrendPercent = calculateTrend(netRevenue, previousNetRevenue);
    const ordersTrendPercent = calculateTrend(ordersToday || 0, previousOrdersToday || 0);
    
    // 11. Alerts (高退款率等)
    const alerts: Array<{ type: string; title: string; message: string; severity: 'warning' | 'error' | 'info' }> = [];
    
    // 检查高退款率（简化版，实际需要计算退款率）
    // TODO: 实现退款率计算
    
    // 如果有待审批，添加 alert
    if ((pendingApprovals || 0) > 0) {
      alerts.push({
        type: 'pending_approvals',
        title: 'Pending Approvals',
        message: `${pendingApprovals} new requests are waiting for verification.`,
        severity: 'info',
      });
    }
    
    // 格式化金额（M = million, K = thousand）
    const formatCurrency = (cents: number): string => {
      const dollars = cents / 100;
      if (dollars >= 1000000) {
        return `$${(dollars / 1000000).toFixed(2)}M`;
      } else if (dollars >= 1000) {
        return `$${(dollars / 1000).toFixed(1)}K`;
      }
      return `$${dollars.toFixed(0)}`;
    };
    
    return NextResponse.json({
      success: true,
      data: {
        kpis: {
          totalRevenue: {
            value: totalRevenue / 100, // 转换为美元
            formatted: formatCurrency(totalRevenue),
            trend: revenueTrendPercent,
          },
          netRevenue: {
            value: netRevenue / 100,
            formatted: formatCurrency(netRevenue),
            trend: netRevenueTrendPercent,
          },
          ordersToday: {
            value: ordersToday || 0,
            formatted: (ordersToday || 0).toLocaleString(),
            trend: ordersTrendPercent,
          },
          ticketsRedeemed: {
            value: ticketsRedeemed || 0,
            formatted: ticketsRedeemed >= 1000 ? `${(ticketsRedeemed / 1000).toFixed(1)}K` : ticketsRedeemed.toString(),
            trend: null, // 无趋势（显示 —）
          },
          totalMerchants: {
            value: totalMerchants || 0,
            formatted: (totalMerchants || 0).toLocaleString(),
          },
          activeEvents: {
            value: activeEvents || 0,
            formatted: (activeEvents || 0).toLocaleString(),
          },
        },
        revenueTrend,
        ordersByRegion: Object.values(regionStats).sort((a, b) => b.count - a.count),
        topMerchants: topMerchantsList,
        alerts,
        pendingApprovals: pendingApprovals || 0,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN OVERVIEW API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
