/**
 * GET /api/analytics?period=day|week|month|total
 * 商家销售分析：按日/周/月/总 分类，返回系列数据供图表展示
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal/auth';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { createClient } from '@/lib/supabase/server';

type Period = 'day' | 'week' | 'month' | 'total';

export async function GET(req: NextRequest) {
  try {
    await requireInternalAuth();
    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return NextResponse.json({ error: 'NO_WORKSPACE', message: 'No active workspace' }, { status: 403 });
    }

    const period = (req.nextUrl.searchParams.get('period') || 'week') as Period;
    const validPeriods: Period[] = ['day', 'week', 'month', 'total'];
    const resolvedPeriod = validPeriods.includes(period) ? period : 'week';

    const supabase = await createClient();

    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, amount_cents, status, created_at, invite_id, ambassador_id')
      .eq('merchant_id', workspace.merchantId)
      .in('status', ['paid', 'fulfilled', 'completed'])
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    const ordersList = orders || [];

    const series: Array<{ label: string; date: string; revenue: number; orders: number }> = [];
    let totalRevenue = 0;
    let totalOrdersCount = 0;
    const toDateStr = (d: Date) => d.toISOString().split('T')[0];
    const now = new Date();

    if (resolvedPeriod === 'total') {
      totalRevenue = ordersList.reduce((s: number, o: any) => s + (o.amount_cents || 0), 0);
      totalOrdersCount = ordersList.length;
      series.push({
        label: 'All Time',
        date: toDateStr(now),
        revenue: totalRevenue / 100,
        orders: totalOrdersCount,
      });
    } else if (resolvedPeriod === 'day') {
      const days = 14;
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = toDateStr(d);
        const dayOrders = ordersList.filter((o: any) => o.created_at?.startsWith(dateStr));
        const rev = dayOrders.reduce((s: number, o: any) => s + (o.amount_cents || 0), 0);
        series.push({
          label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          date: dateStr,
          revenue: rev / 100,
          orders: dayOrders.length,
        });
        totalRevenue += rev;
        totalOrdersCount += dayOrders.length;
      }
    } else if (resolvedPeriod === 'week') {
      const weeks = 12;
      for (let i = weeks - 1; i >= 0; i--) {
        const end = new Date(now);
        end.setDate(end.getDate() - i * 7);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        const startStr = toDateStr(start);
        const endStr = toDateStr(end);
        const weekOrders = ordersList.filter((o: any) => {
          const od = o.created_at?.split('T')[0];
          return od && od >= startStr && od <= endStr;
        });
        const rev = weekOrders.reduce((s: number, o: any) => s + (o.amount_cents || 0), 0);
        series.push({
          label: `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()}-${end.getDate()}`,
          date: startStr,
          revenue: rev / 100,
          orders: weekOrders.length,
        });
        totalRevenue += rev;
        totalOrdersCount += weekOrders.length;
      }
    } else {
      const months = 12;
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthOrders = ordersList.filter((o: any) => o.created_at?.startsWith(monthStr));
        const rev = monthOrders.reduce((s: number, o: any) => s + (o.amount_cents || 0), 0);
        series.push({
          label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          date: `${monthStr}-01`,
          revenue: rev / 100,
          orders: monthOrders.length,
        });
        totalRevenue += rev;
        totalOrdersCount += monthOrders.length;
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        merchantId: workspace.merchantId,
        merchantName: workspace.merchantName,
        period: resolvedPeriod,
        summary: { totalRevenue: totalRevenue / 100, totalOrders: totalOrdersCount },
        series,
      },
    });
  } catch (error: any) {
    console.error('[ANALYTICS API] Error', error);
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    return NextResponse.json({ error: 'FETCH_FAILED', message: error.message }, { status: 500 });
  }
}
