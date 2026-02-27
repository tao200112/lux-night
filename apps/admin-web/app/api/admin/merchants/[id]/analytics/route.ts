/**
 * GET /api/admin/merchants/[id]/analytics
 * 商家销售分析：按日/周/月/总 分类，含大使订单数、可视化数据
 */

import { NextRequest, NextResponse } from 'next/server';
import { handlerWrapper, requireAdmin, withTimeout, type ApiResponse } from '@/lib/admin/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const TIMEOUT_MS = 15000;

type Period = 'day' | 'week' | 'month' | 'total';

export const GET = handlerWrapper(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  try {
    const authResult = await withTimeout(requireAdmin(request), TIMEOUT_MS, 'requireAdmin');
    if ('status' in authResult) return authResult.response;
    const { adminClient } = authResult;
    const { id: merchantId } = await params;

    const period = (request.nextUrl.searchParams.get('period') || 'week') as Period;
    const validPeriods: Period[] = ['day', 'week', 'month', 'total'];
    const resolvedPeriod = validPeriods.includes(period) ? period : 'week';

    // Fetch merchant
    const { data: merchant, error: merchantError } = await adminClient
      .from('merchants')
      .select('id, name')
      .eq('id', merchantId)
      .single();

    if (merchantError || !merchant) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Not Found', code: 'NOT_FOUND', message: 'Merchant not found' },
        { status: 404 }
      );
    }

    // Fetch orders (all time for aggregation; filter in memory)
    const { data: orders, error: ordersError } = await adminClient
      .from('orders')
      .select('id, amount_cents, status, created_at, invite_id, ambassador_id')
      .eq('merchant_id', merchantId)
      .in('status', ['paid', 'fulfilled', 'completed'])
      .order('created_at', { ascending: true });

    if (ordersError || !orders) {
      return NextResponse.json<ApiResponse>({ ok: true, data: buildEmptyAnalytics(resolvedPeriod, merchant.name, merchantId), step: 'success' });
    }

    const now = new Date();
    const series: Array<{ label: string; date: string; revenue: number; orders: number; ambassadorOrders: number }> = [];
    let totalRevenue = 0;
    let totalOrders = 0;
    let totalAmbassadorOrders = 0;

    const toDateStr = (d: Date) => d.toISOString().split('T')[0];

    if (resolvedPeriod === 'total') {
      totalRevenue = orders.reduce((s: number, o: any) => s + (o.amount_cents || 0), 0);
      totalOrders = orders.length;
      totalAmbassadorOrders = orders.filter((o: any) => o.ambassador_id).length;
      series.push({
        label: 'All Time',
        date: toDateStr(now),
        revenue: totalRevenue / 100,
        orders: totalOrders,
        ambassadorOrders: totalAmbassadorOrders,
      });
    } else if (resolvedPeriod === 'day') {
      const days = 14;
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = toDateStr(d);
        const dayOrders = orders.filter((o: any) => o.created_at.startsWith(dateStr));
        const rev = dayOrders.reduce((s: number, o: any) => s + (o.amount_cents || 0), 0);
        const ambCount = dayOrders.filter((o: any) => o.ambassador_id).length;
        series.push({
          label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          date: dateStr,
          revenue: rev / 100,
          orders: dayOrders.length,
          ambassadorOrders: ambCount,
        });
        totalRevenue += rev;
        totalOrders += dayOrders.length;
        totalAmbassadorOrders += ambCount;
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
        const weekOrders = orders.filter((o: any) => {
          const od = o.created_at.split('T')[0];
          return od >= startStr && od <= endStr;
        });
        const rev = weekOrders.reduce((s: number, o: any) => s + (o.amount_cents || 0), 0);
        const ambCount = weekOrders.filter((o: any) => o.ambassador_id).length;
        series.push({
          label: `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()}-${end.getDate()}`,
          date: startStr,
          revenue: rev / 100,
          orders: weekOrders.length,
          ambassadorOrders: ambCount,
        });
        totalRevenue += rev;
        totalOrders += weekOrders.length;
        totalAmbassadorOrders += ambCount;
      }
    } else {
      const months = 12;
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthOrders = orders.filter((o: any) => o.created_at.startsWith(monthStr));
        const rev = monthOrders.reduce((s: number, o: any) => s + (o.amount_cents || 0), 0);
        const ambCount = monthOrders.filter((o: any) => o.ambassador_id).length;
        series.push({
          label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          date: `${monthStr}-01`,
          revenue: rev / 100,
          orders: monthOrders.length,
          ambassadorOrders: ambCount,
        });
        totalRevenue += rev;
        totalOrders += monthOrders.length;
        totalAmbassadorOrders += ambCount;
      }
    }

    const data = {
      merchantId,
      merchantName: merchant.name,
      period: resolvedPeriod,
      summary: {
        totalRevenue: totalRevenue / 100,
        totalOrders,
        totalAmbassadorOrders,
      },
      series,
    };

    return NextResponse.json<ApiResponse>({ ok: true, data, step: 'success' });
  } catch (error: any) {
    console.error('[MERCHANT ANALYTICS] Error', error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: 'Internal Error', code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
});

function buildEmptyAnalytics(period: Period, merchantName: string, merchantId?: string) {
  return {
    merchantId: merchantId || '',
    merchantName,
    period,
    summary: { totalRevenue: 0, totalOrders: 0, totalAmbassadorOrders: 0 },
    series: [] as Array<{ label: string; date: string; revenue: number; orders: number; ambassadorOrders: number }>,
  };
}
