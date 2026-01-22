/**
 * Events List Page
 * 完全按照 uimerchant/merchant__event_list/code.html 设计
 * 使用真实数据，不允许假数据
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type FilterTab = 'Upcoming' | 'Live' | 'Past';

interface Event {
  id: string;
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  status: string;
  actual_status?: string; // 根据时间计算的状态
  poster_url?: string;
  venue_id?: string;
  venue_name?: string;
  sold_count?: number;
  total_count?: number;
  checkin_count?: number;
}

export default function EventsPage() {
  const router = useRouter();
  const [filterTab, setFilterTab] = useState<FilterTab>('Upcoming');
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();
  }, [filterTab]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      // 根据 filterTab 确定 scope（使用时间判断，而不是 status 字段）
      let scope: string;
      if (filterTab === 'Live') {
        scope = 'live';
      } else if (filterTab === 'Past') {
        scope = 'past';
      } else {
        scope = 'upcoming';
      }

      // 使用统一的 merchant events API
      const res = await fetch(`/api/merchant/events?scope=${scope}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to load events (${res.status})`);
      }

      const data = await res.json();
      
      // DEBUG: 开发环境打印数据
      if (process.env.NODE_ENV === 'development') {
        console.log('[EVENTS PAGE] Loaded events:', {
          scope,
          count: data.events?.length || 0,
          events: data.events,
        });
      }

      setEvents(data.events || []);
    } catch (err: any) {
      console.error('[EVENTS PAGE] Load events error:', err);
      setError(err.message || 'Failed to load events');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen w-full max-w-[430px] mx-auto flex-col overflow-hidden bg-background-light dark:bg-background-dark">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-20 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md px-4 pt-6 pb-2 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined">nightlife</span>
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">Merchant Portal</h2>
              <h1 className="text-xl font-bold leading-tight tracking-tight">Events</h1>
            </div>
          </div>
          <button className="flex size-10 items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
            <span className="material-symbols-outlined">tune</span>
          </button>
        </div>
        
        {/* Segmented Control */}
        <div className="mt-6 mb-2">
          <div className="flex h-11 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
            <label className={`flex cursor-pointer h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-medium transition-all ${filterTab === 'Upcoming' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary' : 'text-gray-500 dark:text-gray-400'}`}>
              <span className="truncate">Upcoming</span>
              <input 
                checked={filterTab === 'Upcoming'} 
                onChange={() => setFilterTab('Upcoming')}
                className="hidden" 
                name="filter-tabs" 
                type="radio" 
                value="Upcoming"
              />
            </label>
            <label className={`flex cursor-pointer h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-medium transition-all ${filterTab === 'Live' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary' : 'text-gray-500 dark:text-gray-400'}`}>
              <span className="truncate">Live</span>
              <input 
                checked={filterTab === 'Live'} 
                onChange={() => setFilterTab('Live')}
                className="hidden" 
                name="filter-tabs" 
                type="radio" 
                value="Live"
              />
            </label>
            <label className={`flex cursor-pointer h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-medium transition-all ${filterTab === 'Past' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary' : 'text-gray-500 dark:text-gray-400'}`}>
              <span className="truncate">Past</span>
              <input 
                checked={filterTab === 'Past'} 
                onChange={() => setFilterTab('Past')}
                className="hidden" 
                name="filter-tabs" 
                type="radio" 
                value="Past"
              />
            </label>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-alert-red text-center mb-4">{error}</p>
            <button
              onClick={loadEvents}
              className="px-4 py-2 bg-primary text-white rounded-lg"
            >
              Retry
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <span className="material-symbols-outlined text-gray-400 text-6xl mb-4">event_busy</span>
            <p className="text-gray-500 dark:text-gray-400 text-center mb-2">No events found</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm text-center">There are no {filterTab.toLowerCase()} events at this time.</p>
          </div>
        ) : (
          events.map((event) => {
            // 使用 actual_status 或根据时间判断
            const isLive = event.actual_status === 'live' || (new Date(event.start_at) <= new Date() && new Date(event.end_at) >= new Date());
            const startDate = new Date(event.start_at);
            const soldCount = event.sold_count || 0;
            const totalCount = event.total_count || 0;
            const soldRate = totalCount > 0 ? (soldCount / totalCount) * 100 : 0;

            return (
              <div
                key={event.id}
                className={`flex flex-col items-stretch justify-start rounded-xl bg-white dark:bg-gray-900 shadow-sm border overflow-hidden ${
                  isLive ? 'border-primary/20 relative group' : 'border-gray-100 dark:border-gray-800'
                }`}
              >
                {isLive && (
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-teal-400 rounded-xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
                )}
                <div className={`relative ${isLive ? '' : ''}`}>
                  <div className="relative h-32 w-full bg-center bg-cover bg-gray-300 dark:bg-gray-700">
                    {event.poster_url ? (
                      <img
                        src={event.poster_url}
                        alt={event.title}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    <div className="absolute bottom-3 left-4 flex items-center gap-2">
                      {isLive && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-bold uppercase tracking-widest">
                          <span className="size-1.5 rounded-full bg-red-600 animate-pulse"></span>
                          Live Now
                        </span>
                      )}
                      <span className={`inline-flex px-2 py-0.5 rounded text-white text-[10px] font-bold uppercase tracking-widest ${
                        event.status === 'published' ? 'bg-primary' :
                        event.status === 'draft' ? 'bg-gray-500' :
                        'bg-gray-400'
                      }`}>
                        {event.status === 'published' ? 'Published' :
                         event.status === 'draft' ? 'Draft' :
                         event.status}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">{event.title}</h3>
                      {event.venue && (
                        <Link
                          href={`/events/${event.id}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          View
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="material-symbols-outlined text-xs">calendar_today</span>
                      <span>
                        {startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} • {startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      {event.venue_name && (
                        <>
                          <span>•</span>
                          <span>{event.venue_name}</span>
                        </>
                      )}
                    </div>
                    {isLive && (
                      <div className="mt-2 space-y-3">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between text-xs font-medium uppercase tracking-tight text-gray-500">
                            <span>Check-in Attendance</span>
                            <span className="text-primary">{event.checkin_count || 0} / {totalCount}</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${totalCount > 0 ? ((event.checkins_count || 0) / totalCount) * 100 : 0}%` }}
                            ></div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800">
                            <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Tickets Sold</p>
                            <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{soldCount}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Link
                            href="/scan"
                            className="flex-1 h-10 rounded-lg bg-primary text-white text-sm font-semibold flex items-center justify-center gap-2"
                          >
                            <span className="material-symbols-outlined text-sm">qr_code_scanner</span>
                            Scan Tickets
                          </Link>
                          <Link
                            href={`/events/${event.id}`}
                            className="w-12 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center"
                          >
                            <span className="material-symbols-outlined text-base">analytics</span>
                          </Link>
                        </div>
                      </div>
                    )}
                    {!isLive && (
                      <>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            <span>Sales Progress</span>
                            <span className="text-gray-700 dark:text-gray-200">{soldCount}/{totalCount}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                            <div
                              className="h-full bg-primary/40 rounded-full"
                              style={{ width: `${soldRate}%` }}
                            ></div>
                          </div>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                          <Link
                            href={`/events/${event.id}`}
                            className="px-4 h-8 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center"
                          >
                            {event.status === 'draft' ? 'Edit' : 'Manage'}
                          </Link>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* Fixed Bottom Action Bar - 创建功能已禁用 */}
      {/* <div className="absolute bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-white dark:from-background-dark via-white/90 dark:via-background-dark/90 to-transparent pointer-events-none">
        <div className="flex justify-center pointer-events-auto">
          <button
            disabled
            className="flex items-center gap-2 bg-gray-400 text-white px-6 h-14 rounded-full font-bold opacity-50 cursor-not-allowed"
          >
            <span className="material-symbols-outlined">add</span>
            Create New Event (Disabled)
          </button>
        </div>
      </div> */}

      {/* Bottom Navigation Bar - 移动端固定宽度 */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-background-light dark:bg-background-dark border-t border-gray-100 dark:border-gray-800 px-6 py-3 flex items-center justify-between z-50">
        <Link href="/dashboard" className="flex flex-col items-center gap-1 text-gray-400">
          <span className="material-symbols-outlined font-bold">dashboard</span>
          <span className="text-[10px] font-bold">Dashboard</span>
        </Link>
        <Link href="/events" className="flex flex-col items-center gap-1 text-primary">
          <span className="material-symbols-outlined text-2xl filled">event</span>
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
