/**
 * Request Center List Page
 * 完全按照 uimerchant/request_center_list/code.html 设计
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Request {
  id: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  payload: any;
  created_at: string;
}

export default function RequestsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<Request[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, [activeTab]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/requests?status=${activeTab}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to load requests');
      }

      const data = await res.json();
      setRequests(data.requests || []);
    } catch (err: any) {
      console.error('Error loading requests:', err);
      setError(err.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const created = new Date(date);
    const diffMs = now.getTime() - created.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays}d ago`;
  };

  const getRequestIcon = (type: string) => {
    switch (type) {
      case 'PRICE_CHANGE':
        return 'sell';
      case 'NEW_EVENT':
        return 'event';
      case 'VENUE_EDIT':
        return 'edit_square';
      default:
        return 'description';
    }
  };

  const getRequestTitle = (type: string, payload: any) => {
    switch (type) {
      case 'PRICE_CHANGE':
        return 'Price Change';
      case 'NEW_EVENT':
        return 'New Event';
      case 'VENUE_EDIT':
        return 'Venue Edit';
      default:
        return type;
    }
  };

  const getRequestSubtitle = (type: string, payload: any) => {
    if (type === 'PRICE_CHANGE' && payload?.ticket_type_name) {
      return payload.ticket_type_name;
    }
    if (type === 'NEW_EVENT' && payload?.title) {
      return payload.title;
    }
    if (type === 'VENUE_EDIT' && payload?.field) {
      return `Updated ${payload.field}`;
    }
    return type;
  };

  return (
    <div className="w-full max-w-[430px] mx-auto bg-background-light dark:bg-background-dark font-display text-[#111827] dark:text-gray-100 antialiased min-h-screen overflow-x-hidden">
      {/* TopAppBar */}
      <header className="sticky top-0 z-50 flex items-center bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md px-4 py-4 justify-between border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => router.back()}
          className="text-[#0c1d1d] dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
        >
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </button>
        <h2 className="text-[#0c1d1d] dark:text-white text-lg font-bold leading-tight tracking-tight flex-1 text-center">Request Center</h2>
        <div className="flex size-10 items-center justify-end">
          <button className="flex cursor-pointer items-center justify-center rounded-full size-10 bg-transparent text-[#0c1d1d] dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <span className="material-symbols-outlined">search</span>
          </button>
        </div>
      </header>

      {/* Segmented Control */}
      <div className="px-4 py-4">
        <div className="flex h-11 items-center justify-center rounded-xl bg-gray-200/50 dark:bg-gray-800/50 p-1">
          <label className={`flex cursor-pointer h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-semibold transition-all ${activeTab === 'pending' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
            <span className="truncate">Pending</span>
            <input
              checked={activeTab === 'pending'}
              onChange={() => setActiveTab('pending')}
              className="hidden"
              name="filter-tab"
              type="radio"
              value="Pending"
            />
          </label>
          <label className={`flex cursor-pointer h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-semibold transition-all ${activeTab === 'approved' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
            <span className="truncate">Approved</span>
            <input
              checked={activeTab === 'approved'}
              onChange={() => setActiveTab('approved')}
              className="hidden"
              name="filter-tab"
              type="radio"
              value="Approved"
            />
          </label>
          <label className={`flex cursor-pointer h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-semibold transition-all ${activeTab === 'rejected' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
            <span className="truncate">Rejected</span>
            <input
              checked={activeTab === 'rejected'}
              onChange={() => setActiveTab('rejected')}
              className="hidden"
              name="filter-tab"
              type="radio"
              value="Rejected"
            />
          </label>
        </div>
      </div>

      {/* List Section */}
      <div className="flex flex-col gap-3 px-4 pb-32">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-alert-red">
            <p>{error}</p>
            <button onClick={loadRequests} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg">
              Retry
            </button>
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-4xl text-gray-400 mb-4">inbox</span>
            <p className="text-gray-500 dark:text-gray-400">No {activeTab} requests</p>
          </div>
        ) : (
          requests.map((req) => (
            <div
              key={req.id}
              className="flex flex-col gap-3 bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm active:scale-[0.98] transition-transform cursor-pointer group"
              onClick={() => router.push(`/requests/${req.id}`)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-primary flex items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20 shrink-0 size-12">
                    <span className="material-symbols-outlined">{getRequestIcon(req.type)}</span>
                  </div>
                  <div className="flex flex-col justify-center">
                    <p className="text-[#0c1d1d] dark:text-gray-100 text-base font-bold leading-none">
                      {getRequestTitle(req.type, req.payload)}
                    </p>
                    <p className="text-gray-500 dark:text-gray-400 text-xs font-medium mt-1 uppercase tracking-wider">
                      {getRequestSubtitle(req.type, req.payload)}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded-full border ${
                      req.status === 'pending'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/50'
                        : req.status === 'approved'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800/50'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800/50'
                    }`}
                  >
                    {req.status.toUpperCase()}
                  </span>
                  <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-lg">chevron_right</span>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-50 dark:border-gray-800">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                  <span className="material-symbols-outlined text-sm">schedule</span>
                  <span>{formatTimeAgo(req.created_at)}</span>
                </div>
                {req.type === 'PRICE_CHANGE' && req.payload?.new_price_cents && (
                  <p className="text-[13px] text-gray-600 dark:text-gray-300">
                    New price: <span className="font-bold">${(req.payload.new_price_cents / 100).toFixed(2)}</span>
                  </p>
                )}
                {req.type === 'NEW_EVENT' && req.payload?.staff_count && (
                  <p className="text-[13px] text-gray-600 dark:text-gray-300">
                    Staff: <span className="font-bold">{req.payload.staff_count} members</span>
                  </p>
                )}
                {req.type === 'VENUE_EDIT' && req.payload?.new_value && (
                  <p className="text-[13px] text-gray-600 dark:text-gray-300">
                    New: <span className="font-bold">{req.payload.new_value}</span>
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 max-w-[430px] w-full px-4">
        <Link
          href="/requests/new-event"
          className="flex items-center justify-center gap-2 w-full h-14 bg-primary text-white rounded-xl shadow-lg shadow-primary/20 font-bold active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined">add</span>
          New Request
        </Link>
      </div>
    </div>
  );
}
