/**
 * Merchant Analytics Page
 * 商家销售分析：全部销售数据、大使订单数，按日/周/月/总分类，可视化
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AdminTopBar from '@/components/admin/AdminTopBar';
import PageContainer from '@/components/admin/PageContainer';
import { Skeleton } from '@/components/admin/Skeleton';
import ErrorState from '@/components/admin/ErrorState';

type Period = 'day' | 'week' | 'month' | 'total';

interface SeriesItem {
  label: string;
  date: string;
  revenue: number;
  orders: number;
  ambassadorOrders: number;
}

interface AnalyticsData {
  merchantId: string;
  merchantName: string;
  period: Period;
  summary: {
    totalRevenue: number;
    totalOrders: number;
    totalAmbassadorOrders: number;
  };
  series: SeriesItem[];
}

export default function MerchantAnalyticsPage() {
  const router = useRouter();
  const params = useParams();
  const merchantId = params.merchantId as string;

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('week');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');

  useEffect(() => {
    fetchAnalytics();
  }, [merchantId, period]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/merchants/${merchantId}/analytics?period=${period}`);
      const result = await res.json();
      if (!result.ok) throw new Error(result.message || 'Failed to fetch analytics');
      setData(result.data);
    } catch (err: any) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <PageContainer className="bg-background-light dark:bg-background-dark">
        <AdminTopBar title="Sales Analytics" showBack />
        <main className="px-4 py-6">
          <Skeleton className="h-24 w-full mb-4" />
          <Skeleton className="h-48 w-full mb-4" />
          <Skeleton className="h-64 w-full" />
        </main>
      </PageContainer>
    );
  }

  if (error && !data) {
    return (
      <PageContainer className="bg-background-light dark:bg-background-dark">
        <AdminTopBar title="Sales Analytics" showBack />
        <main className="px-4 py-6">
          <ErrorState message={error} onRetry={fetchAnalytics} />
        </main>
      </PageContainer>
    );
  }

  const analytics = data!;
  const maxRevenue = Math.max(...(analytics.series.map((s) => s.revenue) || [1]), 1);

  return (
    <PageContainer className="bg-background-light dark:bg-background-dark">
      <AdminTopBar title={`${analytics.merchantName} · Analytics`} showBack />

      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-6 pb-32">
        {/* Period Selector */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {(['day', 'week', 'month', 'total'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                period === p
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {p === 'day' ? 'Daily' : p === 'week' ? 'Weekly' : p === 'month' ? 'Monthly' : 'Total'}
            </button>
          ))}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Total Revenue</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
              ${analytics.summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Total Orders</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
              {analytics.summary.totalOrders.toLocaleString()}
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800 p-4">
            <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase">Ambassador Orders</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
              {analytics.summary.totalAmbassadorOrders.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Chart Type Toggle */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Revenue & Orders</h3>
          <div className="flex gap-1">
            <button
              onClick={() => setChartType('bar')}
              className={`px-2 py-1 rounded text-xs font-medium ${chartType === 'bar' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
            >
              Bar
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`px-2 py-1 rounded text-xs font-medium ${chartType === 'line' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
            >
              Line
            </button>
          </div>
        </div>

        {/* Chart */}
        {analytics.series.length > 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-5">
            {chartType === 'bar' ? (
              <div className="h-56 flex items-end gap-1">
                {analytics.series.map((s, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div
                      className="w-full rounded-t bg-primary/80 hover:bg-primary transition-colors min-h-[4px]"
                      style={{ height: `${Math.max((s.revenue / maxRevenue) * 100, 2)}%` }}
                      title={`${s.label}: $${s.revenue.toFixed(2)} · ${s.orders} orders · ${s.ambassadorOrders} ambassador`}
                    />
                    <span className="text-[10px] text-slate-400 truncate max-w-full text-center">{s.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-56 flex items-end gap-1">
                {analytics.series.map((s, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div
                      className="w-1 rounded-full bg-primary/80 hover:bg-primary transition-colors"
                      style={{ height: `${Math.max((s.revenue / maxRevenue) * 100, 4)}px` }}
                      title={`${s.label}: $${s.revenue.toFixed(2)}`}
                    />
                    <span className="text-[10px] text-slate-400 truncate max-w-full text-center">{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
            No data for this period
          </div>
        )}

        {/* Table */}
        {analytics.series.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <h4 className="text-xs font-bold text-slate-500 uppercase">Detail</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-700/50">
                    <th className="px-4 py-2 font-semibold text-slate-500 dark:text-slate-400">Period</th>
                    <th className="px-4 py-2 font-semibold text-slate-500 dark:text-slate-400 text-right">Revenue</th>
                    <th className="px-4 py-2 font-semibold text-slate-500 dark:text-slate-400 text-right">Orders</th>
                    <th className="px-4 py-2 font-semibold text-slate-500 dark:text-slate-400 text-right">Ambassador</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {analytics.series.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-2 font-medium text-slate-900 dark:text-white">{s.label}</td>
                      <td className="px-4 py-2 text-right text-slate-700 dark:text-slate-300">${s.revenue.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400">{s.orders}</td>
                      <td className="px-4 py-2 text-right text-purple-600 dark:text-purple-400">{s.ambassadorOrders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </PageContainer>
  );
}
