'use client';

import React, { useState, useEffect } from 'react';
import { getTickets } from '@/lib/data/tickets';
import { Ticket } from '@/lib/data/tickets';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BottomTabBar from '../../components/ui/BottomTabBar';

export default function WalletPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'active' | 'used' | 'refunded'>('active');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/login?redirect=' + encodeURIComponent('/wallet'));
      return;
    }

    fetchTickets();
  }, [activeTab, user, authLoading, router]);

  const fetchTickets = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const statusFilter = activeTab === 'active' ? 'active' : activeTab === 'used' ? 'used' : 'refunded';
      const ticketsData = await getTickets(user.id, statusFilter);
      setTickets(ticketsData);
    } catch (err: any) {
      console.error('Error fetching tickets:', err);
      setError(err.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="relative flex h-auto min-h-screen w-full max-w-md mx-auto flex-col overflow-x-hidden shadow-2xl border-x border-white/5 bg-background-dark text-white">
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative flex h-auto min-h-screen w-full max-w-md mx-auto flex-col overflow-x-hidden shadow-2xl border-x border-white/5 bg-background-dark text-white">
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <span className="material-symbols-outlined text-4xl text-alert-red mb-4">error</span>
          <h3 className="text-lg font-bold text-white mb-2">Error loading tickets</h3>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-background-dark rounded-lg font-bold"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-auto min-h-screen w-full max-w-md mx-auto flex-col overflow-x-hidden shadow-2xl border-x border-white/5 bg-background-dark text-white">
      {/* Header */}
      <header className="flex items-center justify-center p-6 pb-2 relative">
        <h1 className="font-display text-xl font-bold tracking-tight text-white">My Wallet</h1>
        {tickets.length > 0 && <div className="absolute right-6 top-7 w-2 h-2 rounded-full bg-lux-gold shadow-[0_0_10px_rgba(232,185,75,0.5)]"></div>}
      </header>

      {/* Segmented Control */}
      <div className="px-6 py-4">
        <div className="flex h-12 w-full items-center rounded-xl bg-[#1E2224] p-1 border border-white/5">
          {/* Active Tab */}
          <button 
            onClick={() => setActiveTab('active')}
            className={`relative flex-1 h-full rounded-lg transition-all duration-200 ${activeTab === 'active' ? 'bg-primary shadow-sm' : 'hover:bg-white/5'}`}
          >
            <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold font-display tracking-wide ${activeTab === 'active' ? 'text-lux-gold' : 'text-gray-400'}`}>Active</span>
          </button>
          {/* Used Tab */}
          <button 
            onClick={() => setActiveTab('used')}
            className={`flex-1 h-full rounded-lg transition-all duration-200 ${activeTab === 'used' ? 'bg-primary shadow-sm' : 'hover:bg-white/5'}`}
          >
            <span className={`flex items-center justify-center text-sm font-medium font-display ${activeTab === 'used' ? 'text-lux-gold' : 'text-gray-400'}`}>Used</span>
          </button>
          {/* Refunded Tab */}
          <button 
            onClick={() => setActiveTab('refunded')}
            className={`flex-1 h-full rounded-lg transition-all duration-200 ${activeTab === 'refunded' ? 'bg-primary shadow-sm' : 'hover:bg-white/5'}`}
          >
            <span className={`flex items-center justify-center text-sm font-medium font-display ${activeTab === 'refunded' ? 'text-lux-gold' : 'text-gray-400'}`}>Refunded</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-6 px-6 py-2 overflow-y-auto no-scrollbar pb-24">
        {tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-3xl border border-white/5 bg-white/[0.02] mt-10">
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6 ring-1 ring-white/10">
                    <span className="material-symbols-outlined text-4xl text-gray-500">confirmation_number</span>
                </div>
                <h3 className="font-display text-lg font-bold text-white mb-2">No {activeTab} tickets</h3>
                <p className="text-gray-400 text-sm max-w-[240px] leading-relaxed mb-8">Your next unforgettable night is waiting for you.</p>
                <Link href="/" className="flex items-center gap-2 bg-lux-gold text-lux-dark hover:bg-[#D4A63B] transition-colors rounded-xl px-6 py-3 font-bold text-sm tracking-wide shadow-[0_0_20px_-5px_rgba(232,185,75,0.3)]">
                  <span>Explore Events</span>
                  <span className="material-symbols-outlined text-lg font-bold">arrow_forward</span>
                </Link>
            </div>
        ) : (
            tickets.map((ticket) => {
              const isToday = ticket.startAt && new Date(ticket.startAt).toDateString() === new Date().toDateString();
              const isUsedOrRefunded = ticket.status === 'used' || ticket.status === 'refunded';
              return (
                <Link href={`/ticket/${ticket.id}`} key={ticket.id} className="block group">
                  <div
                    className={`relative w-full flex flex-row h-48 rounded-2xl overflow-hidden shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] transition-transform hover:scale-[1.02] active:scale-[0.98] ${isUsedOrRefunded ? 'opacity-85' : ''}`}
                  >
                    {/* Ticket Left Side：商家海报作背景 */}
                    <div className="relative flex-grow flex flex-col justify-end p-5 bg-[#1E2224]">
                      {ticket.posterUrl && (
                        <div
                          className={`absolute inset-0 bg-cover bg-center z-0 ${isUsedOrRefunded ? 'opacity-40 grayscale' : 'opacity-60 mix-blend-overlay'}`}
                          style={{ backgroundImage: `url('${ticket.posterUrl}')` }}
                          aria-hidden
                        />
                      )}
                      <div
                        className={`absolute inset-0 z-0 ${isUsedOrRefunded ? 'bg-gradient-to-t from-[#121416] via-[#121416]/90 to-[#121416]/60' : 'bg-gradient-to-t from-[#121416] via-[#121416]/80 to-transparent'}`}
                      />
                      <div className="relative z-10 w-full">
                        {isToday && !isUsedOrRefunded && (
                          <div className="flex justify-between items-start mb-auto absolute top-0 left-0 right-0 -mt-1">
                            <span className="px-3 py-1 rounded-full bg-lux-gold text-lux-dark text-xs font-bold tracking-wider uppercase shadow-lg shadow-lux-gold/20">Tonight</span>
                          </div>
                        )}
                        <h3 className="font-display text-2xl font-bold text-white leading-tight mb-1 tracking-tight">{ticket.eventName}</h3>
                        <div className="flex items-center gap-2 text-gray-300 text-sm font-medium">
                          <span className={`material-symbols-outlined text-[18px] ${isUsedOrRefunded ? 'text-gray-500' : 'text-lux-gold'}`}>calendar_today</span>
                          <span>{ticket.date} • {ticket.time}</span>
                        </div>
                        <div className="mt-2 text-xs text-gray-500 uppercase tracking-widest font-semibold">{ticket.venue}</div>
                      </div>
                    </div>
                    {/* Perforation */}
                    <div className="relative w-[1px] bg-[#1E2224] flex flex-col items-center justify-center z-20">
                      <div className="dashed-line absolute top-2 bottom-2" />
                      <div className="absolute -top-3 -left-3 w-6 h-6 rounded-full bg-background-dark" />
                      <div className="absolute -bottom-3 -left-3 w-6 h-6 rounded-full bg-background-dark" />
                    </div>
                    {/* Ticket Right Side (QR Stub) */}
                    <div className={`relative w-24 min-w-[96px] flex flex-col items-center justify-center p-2 border-l border-white/5 ${isUsedOrRefunded ? 'bg-[#15181A]' : 'bg-[#191D1F]'}`}>
                      <div className={`w-16 h-16 rounded-lg p-1 mb-2 shadow-inner ${isUsedOrRefunded ? 'bg-white/10 flex items-center justify-center border border-white/10' : 'bg-white'}`}>
                        {isUsedOrRefunded ? (
                          <span className="material-symbols-outlined text-white/50 text-3xl">qr_code_2</span>
                        ) : (
                          <img alt="QR Code" className="w-full h-full object-contain opacity-90" src={ticket.qrCodeUrl} />
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold text-center">
                        {isUsedOrRefunded ? <>View<br />Info</> : <>Scan<br />Entry</>}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })
        )}
      </div>

      {/* Bottom Tab Bar - Always visible */}
      <BottomTabBar />
    </div>
  );
}
