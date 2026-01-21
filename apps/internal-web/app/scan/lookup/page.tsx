/**
 * Manual Ticket Lookup Page
 * 完全按照 uimerchant/staff__manual_lookup/code.html 设计
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Ticket {
  id: string;
  short_code?: string;
  ticket_type_name: string;
  order_id?: string;
  customer_name?: string;
  status: string;
  checked_in_at?: string;
}

export default function ManualLookupPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setTickets([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/tickets/search?q=${encodeURIComponent(searchQuery)}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Search failed');
      }

      const data = await res.json();
      setTickets(data.tickets || []);
    } catch (err: any) {
      console.error('Error searching tickets:', err);
      setError(err.message || 'Failed to search tickets');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (query.trim()) {
      const timeoutId = setTimeout(() => {
        handleSearch(query);
      }, 300); // Debounce search
      return () => clearTimeout(timeoutId);
    } else {
      setTickets([]);
    }
  }, [query]);

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const created = new Date(date);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const handleCheckIn = (ticketId: string) => {
    router.push(`/scan/ticket/${ticketId}`);
  };

  return (
    <div className="w-full max-w-[430px] mx-auto bg-background-light dark:bg-background-dark text-[#0c1d1d] dark:text-white antialiased min-h-screen">
      {/* Top Navigation */}
      <div className="sticky top-0 z-20 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md px-4 py-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center size-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="material-symbols-outlined text-[#0c1d1d] dark:text-white">arrow_back_ios_new</span>
          </button>
          <div>
            <h1 className="text-lg font-bold leading-none">Manual Lookup</h1>
            <p className="text-[10px] uppercase tracking-widest text-primary font-bold mt-1">Staff Portal</p>
          </div>
        </div>
        <Link
          href="/scan"
          className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <span className="material-symbols-outlined">qr_code_scanner</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto pb-32">
        {/* Search Section */}
        <div className="px-4 py-4">
          <div className="relative flex flex-col gap-2">
            <label className="flex flex-col w-full group">
              <div className="flex w-full items-stretch rounded-xl h-14 bg-gray-100 dark:bg-gray-800 border-2 border-transparent focus-within:border-primary transition-all duration-200 shadow-sm">
                <div className="flex items-center justify-center pl-4 text-gray-500 group-focus-within:text-primary">
                  <span className="material-symbols-outlined">search</span>
                </div>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full min-w-0 flex-1 bg-transparent border-none focus:ring-0 text-base font-medium placeholder:text-gray-400 placeholder:font-normal px-4"
                  placeholder="Short Code, Ticket ID, or Order ID"
                  type="text"
                />
                {query && (
                  <div className="flex items-center pr-2">
                    <button
                      onClick={() => setQuery('')}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      <span className="material-symbols-outlined text-xl">cancel</span>
                    </button>
                  </div>
                )}
              </div>
            </label>
            <div className="flex gap-2 px-1 overflow-x-auto no-scrollbar py-1">
              <span className="text-[11px] font-semibold bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full text-gray-500 whitespace-nowrap">Order ID: #ORD...</span>
              <span className="text-[11px] font-semibold bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full text-gray-500 whitespace-nowrap">Ticket: #TIX...</span>
              <span className="text-[11px] font-semibold bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full text-gray-500 whitespace-nowrap">Code: 6-Digits</span>
            </div>
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : error ? (
          <div className="text-center py-8 px-4">
            <p className="text-alert-red text-sm">{error}</p>
          </div>
        ) : tickets.length > 0 ? (
          <div className="flex flex-col pb-8">
            {tickets.map((ticket) => {
              const isValid = ticket.status === 'active' || ticket.status === 'valid';
              const isUsed = ticket.checked_in_at;

              return (
                <div key={ticket.id} className="px-4 py-2">
                  <div className={`group flex items-center justify-between gap-4 rounded-xl bg-white dark:bg-gray-900 p-4 border border-gray-100 dark:border-gray-800 shadow-sm transition-shadow ${isUsed ? 'opacity-80' : 'hover:shadow-md'}`}>
                    <div className="flex flex-col gap-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            isUsed
                              ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                              : isValid
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}
                        >
                          {isUsed ? 'USED' : isValid ? 'VALID' : 'INVALID'}
                        </span>
                        {isUsed && ticket.checked_in_at && (
                          <span className="text-[10px] font-medium text-gray-400 uppercase">{formatTimeAgo(ticket.checked_in_at)}</span>
                        )}
                      </div>
                      <p className="text-base font-bold text-[#0c1d1d] dark:text-white">{ticket.customer_name || 'Guest'}</p>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {ticket.short_code ? `#${ticket.short_code}` : ticket.id.slice(0, 8)} • {ticket.ticket_type_name}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {!isUsed && isValid ? (
                        <button
                          onClick={() => handleCheckIn(ticket.id)}
                          className="flex items-center justify-center rounded-lg h-9 px-4 bg-primary text-white gap-2 text-xs font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-95 transition-all"
                        >
                          <span>Check-In</span>
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                        </button>
                      ) : (
                        <div className="h-9 px-4 flex items-center text-gray-400 text-xs font-bold">
                          <span>{isUsed ? 'Completed' : 'Invalid'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : query.trim() ? (
          <div className="text-center py-12 px-4">
            <span className="material-symbols-outlined text-4xl text-gray-400 mb-4">search_off</span>
            <p className="text-gray-500 dark:text-gray-400">No tickets found</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
