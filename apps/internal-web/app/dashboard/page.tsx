/**
 * Merchant Dashboard Page
 * 完全按照 uimerchant/merchant_dashboard/code.html 设计
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface DashboardStats {
  sales: number;
  orders: number;
  checkins: number;
  refunds: number;
  revenueWeek: number;
  tonightEvents: Array<{
    id: string;
    title: string;
    startAt: string;
    venue: string;
    sold: number;
    total: number;
    checkedIn: number;
    image?: string;
    badge?: 'Staff' | 'VIP Only';
  }>;
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [workspace, setWorkspace] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dashboard');
      
      if (!res.ok) {
        throw new Error('Failed to load dashboard');
      }

      const data = await res.json();
      
      // Transform data to match uimerchant design
      const statsData: DashboardStats = {
        sales: data.stats?.revenue?.thisWeek * 100 || 0,
        orders: data.stats?.totalTickets || 0,
        checkins: data.stats?.checkedInToday || 0,
        refunds: 0, // TODO: Get from API
        revenueWeek: data.stats?.revenue?.thisWeek || 0,
        tonightEvents: [], // TODO: Get tonight events from API
      };
      
      setStats(statsData);
      setWorkspace(data.workspace);
    } catch (err: any) {
      console.error('Dashboard error:', err);
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background-light dark:bg-background-dark p-8">
        <p className="text-alert-red text-center mb-4">{error}</p>
        <button
          onClick={loadDashboard}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  const merchantName = workspace?.merchantName || 'Club Neon';

  return (
    <div className="relative w-full max-w-[430px] mx-auto min-h-screen bg-background-light dark:bg-background-dark font-display text-[#0c1d1d] dark:text-gray-100 antialiased">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary px-3 py-1.5 rounded-full flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight">{merchantName}</span>
              <span className="material-symbols-outlined text-sm">expand_more</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.push('/events')}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
            >
              <span className="material-symbols-outlined">calendar_today</span>
            </button>
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary overflow-hidden border border-primary/20">
              <span className="material-symbols-outlined">person</span>
            </div>
          </div>
        </div>
      </header>

      <main className="pb-24">
        {/* KPI Grid */}
        <section className="p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 rounded-xl p-4 bg-card-light dark:bg-card-dark border border-gray-100 dark:border-gray-800 shadow-sm">
              <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">Sales (GMV)</p>
              <div className="flex items-end gap-2">
                <p className="text-xl font-bold leading-tight">
                  ${((stats?.sales || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[#3CB371] text-xs font-bold pb-0.5">+12%</p>
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-xl p-4 bg-card-light dark:bg-card-dark border border-gray-100 dark:border-gray-800 shadow-sm">
              <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">Orders</p>
              <div className="flex items-end gap-2">
                <p className="text-xl font-bold leading-tight">{stats?.orders || 0}</p>
                <p className="text-[#3CB371] text-xs font-bold pb-0.5">+5%</p>
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-xl p-4 bg-card-light dark:bg-card-dark border border-gray-100 dark:border-gray-800 shadow-sm">
              <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">Check-ins</p>
              <div className="flex items-end gap-2">
                <p className="text-xl font-bold leading-tight">{stats?.checkins || 0}</p>
                <p className="text-[#3CB371] text-xs font-bold pb-0.5">+8%</p>
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-xl p-4 bg-card-light dark:bg-card-dark border border-gray-100 dark:border-gray-800 shadow-sm">
              <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">Refunds</p>
              <div className="flex items-end gap-2">
                <p className="text-xl font-bold leading-tight">{stats?.refunds || 0}</p>
                <p className="text-[#DC143C] text-xs font-bold pb-0.5">-1%</p>
              </div>
            </div>
          </div>
        </section>

        {/* Revenue Chart Section */}
        <section className="px-4 py-2">
          <div className="bg-card-light dark:bg-card-dark rounded-xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">7-Day Revenue Trend</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Total ${(stats?.revenueWeek || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
              </div>
              <span className="material-symbols-outlined text-primary text-xl">insights</span>
            </div>
            <div className="h-[140px] w-full relative">
              <svg className="w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 478 150" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 109C18 109 18 21 36 21C54 21 54 41 72 41C90 41 90 93 108 93C127 93 127 33 145 33C163 33 163 101 181 101C199 101 199 61 217 61C236 61 236 45 254 45C272 45 272 121 290 121C308 121 308 149 326 149C344 149 344 1 363 1C381 1 381 81 399 81C417 81 417 129 435 129C453 129 453 25 472 25V149H0V109Z" fill="url(#chartGradient)"></path>
                <path d="M0 109C18 109 18 21 36 21C54 21 54 41 72 41C90 41 90 93 108 93C127 93 127 33 145 33C163 33 163 101 181 101C199 101 199 61 217 61C236 61 236 45 254 45C272 45 272 121 290 121C308 121 308 149 326 149C344 149 344 1 363 1C381 1 381 81 399 81C417 81 417 129 435 129C453 129 453 25 472 25" stroke="#006666" strokeLinecap="round" strokeWidth="3"></path>
                <defs>
                  <linearGradient gradientUnits="userSpaceOnUse" id="chartGradient" x1="236" x2="236" y1="1" y2="149">
                    <stop stopColor="#006666" stopOpacity="0.2"></stop>
                    <stop offset="1" stopColor="#006666" stopOpacity="0"></stop>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="flex justify-between mt-2 px-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Mon</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase">Tue</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase">Wed</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase">Thu</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase text-primary">Fri</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase">Sat</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase">Sun</span>
            </div>
          </div>
        </section>

        {/* Tonight's Events List */}
        <section className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold leading-tight tracking-tight">Tonight's Events</h3>
            <button 
              onClick={() => router.push('/events')}
              className="text-primary text-sm font-semibold"
            >
              View All
            </button>
          </div>
          <div className="space-y-3">
            {stats?.tonightEvents && stats.tonightEvents.length > 0 ? (
              stats.tonightEvents.map((event) => (
                <div key={event.id} className="bg-card-light dark:bg-card-dark rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm flex">
                  <div className="w-24 h-auto relative shrink-0 bg-gray-200 dark:bg-gray-700">
                    {event.image ? (
                      <img alt={event.title} className="w-full h-full object-cover" src={event.image} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-gray-400">event</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-sm truncate">{event.title}</h4>
                      {event.badge && (
                        <span className={`${event.badge === 'Staff' ? 'bg-primary/20 text-primary' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'} text-[10px] px-1.5 py-0.5 rounded font-bold uppercase`}>
                          {event.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      {new Date(event.startAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} • {event.venue}
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold">{event.sold}/{event.total}</span>
                        <span className="text-[10px] text-gray-400 uppercase font-medium">Sold</span>
                      </div>
                      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full" 
                          style={{ width: `${(event.sold / event.total) * 100}%` }}
                        ></div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-bold">{event.checkedIn}</span>
                        <span className="text-[10px] text-gray-400 uppercase font-medium">In</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-card-light dark:bg-card-dark rounded-xl p-8 border border-gray-100 dark:border-gray-800 text-center">
                <p className="text-gray-500 dark:text-gray-400 text-sm">No events tonight</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Bottom Navigation Bar - 移动端固定宽度 */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-background-light dark:bg-background-dark border-t border-gray-100 dark:border-gray-800 px-6 py-3 flex items-center justify-between z-50">
        <Link href="/dashboard" className="flex flex-col items-center gap-1 text-primary">
          <span className="material-symbols-outlined font-bold">dashboard</span>
          <span className="text-[10px] font-bold">Dashboard</span>
        </Link>
        <Link href="/events" className="flex flex-col items-center gap-1 text-gray-400">
          <span className="material-symbols-outlined">event</span>
          <span className="text-[10px] font-bold">Events</span>
        </Link>
        <div className="relative -top-6">
          <Link 
            href="/scan"
            className="w-14 h-14 bg-primary text-white rounded-full shadow-lg flex items-center justify-center border-4 border-background-light dark:border-background-dark"
          >
            <span className="material-symbols-outlined text-3xl">qr_code_scanner</span>
          </Link>
        </div>
        <Link href="/staff" className="flex flex-col items-center gap-1 text-gray-400">
          <span className="material-symbols-outlined">group</span>
          <span className="text-[10px] font-bold">Staff</span>
        </Link>
        <Link href="/settings" className="flex flex-col items-center gap-1 text-gray-400">
          <span className="material-symbols-outlined">settings</span>
          <span className="text-[10px] font-bold">Settings</span>
        </Link>
      </nav>
    </div>
  );
}
