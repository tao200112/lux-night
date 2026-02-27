/**
 * Admin Dashboard Page
 * Dashboard 页面（完全按照 uiadmin/admin_dashboard_overview_1/code.html 重写）
 */

import Link from 'next/link';
import PageContainer from '@/components/admin/PageContainer';
import { createClient } from '@/lib/supabase/server';
import { getDashboardData } from '@/lib/data/admin/dashboard';

// Force dynamic rendering because this page uses cookies
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  let dashboardData;
  let error: string | null = null;
  
  try {
    dashboardData = await getDashboardData();
  } catch (err: any) {
    error = err.message;
    console.error('[ADMIN DASHBOARD] Error:', err);
  }
  
  // 格式化金额显示（后端 revenue 为美分 cents，需先除以 100 转为美元）
  const formatCurrencyFromCents = (cents: number | undefined): string => {
    const dollars = ((cents ?? 0) / 100);
    if (dollars >= 1000000) return `$${(dollars / 1000000).toFixed(2)}M`;
    if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}K`;
    return `$${dollars.toFixed(2)}`;
  };
  
  return (
    <PageContainer>
      {/* Header - 完全按照 UI 文档 */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#1f2937]/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between transition-colors duration-300">
        <div className="flex items-center gap-3">
          <button className="p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <span className="material-symbols-outlined">menu</span>
          </button>
          <h1 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="relative p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <span className="material-symbols-outlined text-[22px]">notifications</span>
            {dashboardData && dashboardData.pendingApprovals > 0 && (
              <span className="absolute top-2 right-2 h-2 w-2 bg-danger rounded-full border-2 border-white dark:border-slate-800"></span>
            )}
          </button>
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold ring-2 ring-slate-100 dark:ring-slate-700 cursor-pointer overflow-hidden">
            <span className="material-symbols-outlined text-[16px]">person</span>
          </div>
        </div>
      </header>
      
      {/* Main Content - 完全按照 UI 文档 */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        {error ? (
          <div className="px-4 py-8 text-center text-danger">
            <p>Error: {error}</p>
          </div>
        ) : dashboardData ? (
          <>
            {/* Alert Section - 完全按照 UI 文档 */}
            <section className="px-4 py-4 flex flex-col gap-3">
              {dashboardData.alerts && dashboardData.alerts.length > 0 && dashboardData.alerts.map((alert: any, index: number) => (
                <div
                  key={index}
                  className={`flex items-start gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border-l-4 shadow-card ${
                    alert.severity === 'warning'
                      ? 'border-warning'
                      : alert.severity === 'error'
                      ? 'border-danger'
                      : 'border-accent'
                  }`}
                >
                  <span className={`material-symbols-outlined shrink-0 mt-0.5 ${
                    alert.severity === 'warning'
                      ? 'text-warning'
                      : alert.severity === 'error'
                      ? 'text-danger'
                      : 'text-accent'
                  }`}>
                    {alert.severity === 'warning' ? 'warning' : 'assignment_turned_in'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{alert.title}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{alert.message}</p>
                  </div>
                  {alert.type === 'pending_approvals' && (
                    <Link href="/approvals">
                      <button className="text-xs font-medium text-primary dark:text-blue-400 bg-slate-50 dark:bg-slate-700 px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors">
                        Process
                      </button>
                    </Link>
                  )}
                </div>
              ))}
            </section>
            
            {/* KPI Grid - 完全按照 UI 文档 */}
            <section className="px-4 pb-2">
              <div className="grid grid-cols-2 gap-3">
                {/* Total Revenue */}
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-card border border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total Revenue</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      {dashboardData.kpis?.totalRevenue?.formatted || '$0'}
                    </span>
                  </div>
                  {dashboardData.kpis?.totalRevenue?.trend !== undefined && (
                    <div className={`mt-1 flex items-center text-xs font-medium w-fit px-1.5 py-0.5 rounded ${
                      dashboardData.kpis.totalRevenue.trend === null
                        ? 'text-slate-400 bg-slate-100 dark:bg-slate-700'
                        : dashboardData.kpis.totalRevenue.trend >= 0
                        ? 'text-success bg-success/10'
                        : 'text-danger bg-danger/10'
                    }`}>
                      {dashboardData.kpis.totalRevenue.trend === null ? (
                        <span>—</span>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[14px] mr-0.5">
                            {dashboardData.kpis.totalRevenue.trend >= 0 ? 'trending_up' : 'trending_down'}
                          </span>
                          <span>{Math.abs(dashboardData.kpis.totalRevenue.trend)}%</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Net Revenue */}
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-card border border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Net Revenue</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      {dashboardData.kpis?.netRevenue?.formatted || '$0'}
                    </span>
                  </div>
                  {dashboardData.kpis?.netRevenue?.trend !== undefined && (
                    <div className={`mt-1 flex items-center text-xs font-medium w-fit px-1.5 py-0.5 rounded ${
                      dashboardData.kpis.netRevenue.trend === null
                        ? 'text-slate-400 bg-slate-100 dark:bg-slate-700'
                        : dashboardData.kpis.netRevenue.trend >= 0
                        ? 'text-success bg-success/10'
                        : 'text-danger bg-danger/10'
                    }`}>
                      {dashboardData.kpis.netRevenue.trend === null ? (
                        <span>—</span>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[14px] mr-0.5">
                            {dashboardData.kpis.netRevenue.trend >= 0 ? 'trending_up' : 'trending_down'}
                          </span>
                          <span>{Math.abs(dashboardData.kpis.netRevenue.trend)}%</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Orders Today */}
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-card border border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Orders Today</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      {dashboardData.kpis?.ordersToday?.formatted || '0'}
                    </span>
                  </div>
                  {dashboardData.kpis?.ordersToday?.trend !== undefined && (
                    <div className={`mt-1 flex items-center text-xs font-medium w-fit px-1.5 py-0.5 rounded ${
                      dashboardData.kpis.ordersToday.trend === null
                        ? 'text-slate-400 bg-slate-100 dark:bg-slate-700'
                        : dashboardData.kpis.ordersToday.trend >= 0
                        ? 'text-success bg-success/10'
                        : 'text-danger bg-danger/10'
                    }`}>
                      {dashboardData.kpis.ordersToday.trend === null ? (
                        <span>—</span>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[14px] mr-0.5">
                            {dashboardData.kpis.ordersToday.trend >= 0 ? 'trending_up' : 'trending_down'}
                          </span>
                          <span>{Math.abs(dashboardData.kpis.ordersToday.trend)}%</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Tickets Redeemed */}
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-card border border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Tickets Redeemed</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      {dashboardData.kpis?.ticketsRedeemed?.formatted || '0'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center text-xs font-medium text-slate-400 bg-slate-100 dark:bg-slate-700 w-fit px-1.5 py-0.5 rounded">
                    <span>—</span>
                  </div>
                </div>
              </div>
            </section>
            
            {/* Charts Section - 完全按照 UI 文档，使用真实数据 */}
            <section className="px-4 py-4 space-y-4">
              {/* Line Chart Card - Revenue Trends */}
              <div className="bg-white dark:bg-slate-800 p-5 rounded-lg shadow-card border border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Revenue Trends</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Last 7 Days</span>
                </div>
                {/* Chart from real data */}
                {dashboardData.revenueTrend && dashboardData.revenueTrend.length > 0 ? (
                  <div className="relative h-48 w-full flex items-end gap-1">
                    {(() => {
                      const maxVal = Math.max(...dashboardData.revenueTrend.map((d: any) => d.revenue), 1);
                      return dashboardData.revenueTrend.map((d: any, i: number) => {
                        const h = (d.revenue / maxVal) * 100;
                        const dateLabel = d.date ? new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                            <div
                              className="w-full min-h-[4px] bg-primary/80 hover:bg-primary rounded-t transition-all"
                              style={{ height: `${Math.max(h, 2)}%` }}
                              title={`${dateLabel}: $${((d.revenue || 0) / 100).toFixed(2)}`}
                            />
                            <span className="text-[10px] text-slate-400 truncate max-w-full">{dateLabel}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data</div>
                )}
              </div>
              
              {/* Bar Chart Card - Orders by Region */}
              <div className="bg-white dark:bg-slate-800 p-5 rounded-lg shadow-card border border-slate-100 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Orders by Region</h3>
                <div className="flex flex-col gap-4">
                  {dashboardData.ordersByRegion && dashboardData.ordersByRegion.length > 0 ? (
                    dashboardData.ordersByRegion.slice(0, 3).map((region: any, index: number) => (
                      <div key={region.name || index} className="group">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{region.name || 'Unknown'}</span>
                          <span className="text-slate-500">{region.percentage || 0}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${region.percentage || 0}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">No data</div>
                  )}
                </div>
              </div>
            </section>
            
            {/* Top Merchants Table */}
            <section className="px-4 pb-4">
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Top Merchants</h3>
                  <Link href="/merchants" className="text-xs font-semibold text-accent hover:text-blue-700 transition-colors">
                    View All
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 dark:bg-slate-700/50">
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Merchant</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {dashboardData.topMerchants && dashboardData.topMerchants.length > 0 ? (
                        dashboardData.topMerchants.slice(0, 3).map((merchant: any, index: number) => {
                          const initials = (merchant.name || 'Unknown').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                          return (
                            <tr key={merchant.id || index} className="group hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex items-center justify-center text-xs font-bold">
                                    {initials}
                                  </div>
                                  <span className="text-sm font-medium text-slate-900 dark:text-white">{merchant.name || 'Unknown'}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="text-sm text-slate-600 dark:text-slate-300 font-medium">
                                  {merchant.revenueFormatted ?? formatCurrencyFromCents(merchant.revenue)}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr><td colSpan={2} className="px-5 py-8 text-center text-xs text-slate-500">No data</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Top Invites Table */}
            <section className="px-4 pb-4">
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 border-l-4 border-l-purple-500">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Top Ambassador Invites</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-700/50">
                                <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Code</th>
                                <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Ambassador</th>
                                <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase text-right">Rev</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {dashboardData.topInvites && dashboardData.topInvites.length > 0 ? (
                                dashboardData.topInvites.slice(0, 5).map((inv: any, idx: number) => (
                                    <tr key={idx}>
                                        <td className="px-4 py-2 text-sm font-mono font-bold text-slate-700 dark:text-slate-300">{inv.code}</td>
                                        <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{inv.ambassadorName}</td>
                                        <td className="px-4 py-2 text-sm font-medium text-right text-slate-900 dark:text-white">{formatCurrencyFromCents(inv.revenue)}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={3} className="px-4 py-4 text-center text-xs text-slate-400">No active invites</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
              </div>
            </section>

            {/* Top Ambassadors Table */}
            <section className="px-4 pb-6">
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 border-l-4 border-l-pink-500">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Top Ambassadors</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-700/50">
                                <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Name</th>
                                <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Merchant</th>
                                <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase text-right">Rev</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                           {dashboardData.topAmbassadors && dashboardData.topAmbassadors.length > 0 ? (
                                dashboardData.topAmbassadors.slice(0, 5).map((amb: any, idx: number) => (
                                    <tr key={idx}>
                                        <td className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300">{amb.name}</td>
                                        <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{amb.merchantName}</td>
                                        <td className="px-4 py-2 text-sm font-medium text-right text-slate-900 dark:text-white">{formatCurrencyFromCents(amb.revenue)}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={3} className="px-4 py-4 text-center text-xs text-slate-400">No active ambassadors</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
              </div>
            </section>

          </>
        ) : (
          <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading...</p>
          </div>
        )}
      </main>
    </PageContainer>
  );
}
