/**
 * Admin Dashboard Page
 * Dashboard 页面（完全按照 uiadmin/admin_dashboard_overview_1/code.html 重写）
 */

import AdminTopBar from '@/components/admin/AdminTopBar';
import AdminBottomNav from '@/components/admin/AdminBottomNav';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getDashboardData } from '@/lib/data/admin/dashboard';

export default async function AdminDashboardPage() {
  let dashboardData;
  let error: string | null = null;
  
  try {
    dashboardData = await getDashboardData();
  } catch (err: any) {
    error = err.message;
    console.error('[ADMIN DASHBOARD] Error:', err);
  }
  
  // 格式化金额显示
  const formatCurrency = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };
  
  return (
    <div className="relative flex min-h-screen w-full flex-col mx-auto max-w-[480px] bg-background-light dark:bg-background-dark border-x border-slate-200 dark:border-slate-800 shadow-2xl">
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
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20">
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
            
            {/* Charts Section - 完全按照 UI 文档 */}
            <section className="px-4 py-4 space-y-4">
              {/* Line Chart Card - Revenue Trends */}
              <div className="bg-white dark:bg-slate-800 p-5 rounded-lg shadow-card border border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Revenue Trends</h3>
                  <select className="bg-slate-50 dark:bg-slate-700 border-none text-xs text-slate-600 dark:text-slate-300 rounded py-1 pl-2 pr-6 focus:ring-0 cursor-pointer">
                    <option>Last 7 Days</option>
                    <option>Last 30 Days</option>
                  </select>
                </div>
                {/* Chart SVG - 简化版，实际应基于数据生成 */}
                <div className="relative h-48 w-full">
                  <div className="absolute inset-0 flex flex-col justify-between text-[10px] text-slate-400 pointer-events-none">
                    <div className="w-full border-b border-dashed border-slate-200 dark:border-slate-700 pb-1">$2M</div>
                    <div className="w-full border-b border-dashed border-slate-200 dark:border-slate-700 pb-1">$1.5M</div>
                    <div className="w-full border-b border-dashed border-slate-200 dark:border-slate-700 pb-1">$1M</div>
                    <div className="w-full border-b border-dashed border-slate-200 dark:border-slate-700 pb-1">$500k</div>
                    <div className="w-full border-b border-slate-200 dark:border-slate-700 pb-1">0</div>
                  </div>
                  <svg className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      className="drop-shadow-md"
                      d="M0,140 C30,130 60,110 90,115 C120,120 150,80 180,70 C210,60 240,90 270,50 C300,10 330,30 360,20"
                      fill="none"
                      stroke="#2563EB"
                      strokeLinecap="round"
                      strokeWidth="2.5"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d="M0,140 C30,130 60,110 90,115 C120,120 150,80 180,70 C210,60 240,90 270,50 C300,10 330,30 360,20 V192 H0 Z"
                      fill="url(#gradient)"
                      stroke="none"
                    />
                  </svg>
                </div>
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
            
            {/* Top Merchants Table - 完全按照 UI 文档 */}
            <section className="px-4 pb-6">
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
                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Merchant</th>
                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Revenue</th>
                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {dashboardData.topMerchants && dashboardData.topMerchants.length > 0 ? (
                        dashboardData.topMerchants.slice(0, 3).map((merchant: any, index: number) => {
                          const initials = (merchant.name || 'Unknown').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                          // 使用固定的颜色类名（Tailwind 需要编译时知道）
                          const colorClasses = [
                            { bg: 'bg-purple-100 dark:bg-purple-900', text: 'text-purple-600 dark:text-purple-300' },
                            { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-600 dark:text-blue-300' },
                            { bg: 'bg-orange-100 dark:bg-orange-900', text: 'text-orange-600 dark:text-orange-300' },
                          ];
                          const color = colorClasses[index % colorClasses.length];
                          
                          return (
                            <tr key={merchant.id || index} className="group hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-3">
                                  <div className={`h-8 w-8 rounded ${color.bg} ${color.text} flex items-center justify-center text-xs font-bold`}>
                                    {initials}
                                  </div>
                                  <span className="text-sm font-medium text-slate-900 dark:text-white">{merchant.name || 'Unknown'}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3 text-right">
                                <span className="text-sm text-slate-600 dark:text-slate-300 font-medium">
                                  {formatCurrency((merchant.revenue || merchant.count || 0) * 100)}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                  Active
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                            No merchants found
                          </td>
                        </tr>
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
      
      {/* Bottom Navigation - 使用统一组件 */}
      <AdminBottomNav pendingCount={dashboardData?.pendingApprovals || 0} />
    </div>
  );
}
