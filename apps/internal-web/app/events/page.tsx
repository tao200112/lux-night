/**
 * Events List Page
 * 完全按照 uimerchant/merchant__event_list/code.html 设计
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type FilterTab = 'Upcoming' | 'Live' | 'Past';

export default function EventsPage() {
  const router = useRouter();
  const [filterTab, setFilterTab] = useState<FilterTab>('Upcoming');

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
        {/* LIVE EVENT (Highlighted) - Only show if Live tab */}
        {filterTab === 'Live' && (
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-teal-400 rounded-xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
            <div className="relative flex flex-col items-stretch justify-start rounded-xl border border-primary/20 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
              <div className="p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-bold uppercase tracking-widest">
                      <span className="size-1.5 rounded-full bg-red-600 animate-pulse"></span>
                      Live Now
                    </span>
                    <h3 className="text-lg font-bold mt-1 text-gray-900 dark:text-white">Midnight Mirage: Techno Solo</h3>
                  </div>
                  <button className="p-2 text-gray-400">
                    <span className="material-symbols-outlined">more_vert</span>
                  </button>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="material-symbols-outlined text-sm">schedule</span>
                  <span>Starts 10:00 PM • Main Stage</span>
                </div>
                <div className="mt-2 space-y-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs font-medium uppercase tracking-tight text-gray-500">
                      <span>Check-in Attendance</span>
                      <span className="text-primary">842 / 1,200</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: '70%' }}></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800">
                      <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Tickets Sold</p>
                      <p className="text-lg font-bold text-gray-800 dark:text-gray-100">1,150</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800">
                      <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Revenue</p>
                      <p className="text-lg font-bold text-gray-800 dark:text-gray-100">$28.4k</p>
                    </div>
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
                  <button className="w-12 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center">
                    <span className="material-symbols-outlined text-base">analytics</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* UPCOMING EVENT 1 */}
        <div className="flex flex-col items-stretch justify-start rounded-xl bg-white dark:bg-gray-900 shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="relative h-32 w-full bg-center bg-cover bg-gray-300 dark:bg-gray-700">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
            <div className="absolute bottom-3 left-4">
              <span className="inline-flex px-2 py-0.5 rounded bg-primary text-white text-[10px] font-bold uppercase tracking-widest">Published</span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex justify-between items-start">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Velvet Lounge: Jazz & Gin</h3>
              <p className="text-xs font-medium text-primary">$45.00</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="material-symbols-outlined text-xs">calendar_today</span>
              <span>Sat, Nov 04 • 08:00 PM</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                <span>Sales Progress</span>
                <span className="text-gray-700 dark:text-gray-200">210/300</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                <div className="h-full bg-primary/40 rounded-full" style={{ width: '70%' }}></div>
              </div>
            </div>
            <div className="flex justify-between items-center pt-1">
              <div className="flex -space-x-2">
                <div className="size-6 rounded-full border-2 border-white dark:border-gray-900 bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-[8px] font-bold">JD</div>
                <div className="size-6 rounded-full border-2 border-white dark:border-gray-900 bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-[8px] font-bold">MK</div>
                <div className="size-6 rounded-full border-2 border-white dark:border-gray-900 bg-primary/20 text-primary flex items-center justify-center text-[8px] font-bold">+5</div>
              </div>
              <button className="px-4 h-8 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Manage</button>
            </div>
          </div>
        </div>

        {/* DRAFT EVENT */}
        <div className="flex flex-col items-stretch justify-start rounded-xl bg-gray-50/50 dark:bg-gray-900/50 border border-dashed border-gray-200 dark:border-gray-800 p-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="inline-flex px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[10px] font-bold uppercase tracking-widest">Draft</span>
              <h3 className="text-base font-bold text-gray-600 dark:text-gray-400 italic">Neon Nights: Underground</h3>
            </div>
            <span className="material-symbols-outlined text-gray-400">edit_note</span>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-gray-400">Last edited 2 hours ago</p>
            <button className="text-xs font-bold text-primary flex items-center gap-1">
              Resume Editing
              <span className="material-symbols-outlined text-xs">arrow_forward</span>
            </button>
          </div>
        </div>
      </main>

      {/* Fixed Bottom Action Bar */}
      <div className="absolute bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-white dark:from-background-dark via-white/90 dark:via-background-dark/90 to-transparent pointer-events-none">
        <div className="flex justify-center pointer-events-auto">
          <Link 
            href="/events/new"
            className="flex items-center gap-2 bg-primary text-white px-6 h-14 rounded-full shadow-lg shadow-primary/25 font-bold transition-transform active:scale-95"
          >
            <span className="material-symbols-outlined">add</span>
            Create New Event
          </Link>
        </div>
      </div>

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
