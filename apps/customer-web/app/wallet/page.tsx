'use client';

import React, { useState, useEffect } from 'react';
import { getTickets } from '@/lib/data/tickets';
import { Ticket } from '@/lib/data/tickets';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TopBar from '../../components/ui/TopBar';
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
      <TopBar />

      {/* Segmented Control - no borders */}
      <div className="px-5 py-4">
        <div className="flex h-12 w-full items-center rounded-xl bg-white/[0.04] p-1 backdrop-blur-sm">
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
            <>
            {(() => {
                // Logic to separate Active vs Expired
                const now = new Date();
                let displayTickets = tickets;
                let expiredList: Ticket[] = [];

                if (activeTab === 'active') {
                   displayTickets = tickets.filter(t => !t.validEndAt || new Date(t.validEndAt) > now);
                   expiredList = tickets.filter(t => t.validEndAt && new Date(t.validEndAt) <= now);
                }

                // Helper to render card
                const renderCard = (ticket: Ticket, isExpired = false) => {
                  const isToday = ticket.startAt && new Date(ticket.startAt).toDateString() === new Date().toDateString();
                  const isUsedOrRefunded = ticket.status === 'used' || ticket.status === 'refunded' || isExpired;
                  
                  return (
                    <Link href={`/ticket/${ticket.id}`} key={ticket.id} className="block group mb-4 last:mb-0">
                      <div
                        className={`relative w-full flex flex-row h-40 rounded-2xl overflow-hidden backdrop-blur-md bg-white/[0.06] shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)] transition-transform duration-[180ms] active:scale-[0.99] ${isUsedOrRefunded ? 'opacity-60 grayscale-[0.8]' : ''}`}
                      >
                        {/* Ticket Left Side */}
                        <div className="relative flex-grow flex flex-col justify-end p-4 bg-[#1E2224]">
                          {ticket.posterUrl && (
                            <div
                              className={`absolute inset-0 bg-cover bg-center z-0 ${isUsedOrRefunded ? 'opacity-30' : 'opacity-50 mix-blend-overlay'}`}
                              style={{ backgroundImage: `url('${ticket.posterUrl}')` }}
                              aria-hidden
                            />
                          )}
                          <div className={`absolute inset-0 z-0 ${isUsedOrRefunded ? 'bg-[#121416]/90' : 'bg-gradient-to-t from-[#121416] via-[#121416]/80 to-transparent'}`} />
                          
                          <div className="relative z-10 w-full">
                            {isToday && !isUsedOrRefunded && (
                              <span className="inline-block px-2 py-0.5 mb-2 rounded bg-lux-gold text-lux-dark text-[10px] font-bold uppercase tracking-wider">Tonight</span>
                            )}
                            {isExpired && (
                              <span className="inline-block px-2 py-0.5 mb-2 rounded bg-zinc-700 text-white/70 text-[10px] font-bold uppercase tracking-wider">Expired</span>
                            )}

                            <h3 className="font-display text-lg font-bold text-white leading-tight mb-1 truncate">{ticket.eventName}</h3>
                            <div className="flex items-center gap-1.5 text-gray-400 text-xs font-medium mb-1">
                              <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                              <span>{ticket.date}</span>
                            </div>
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider truncate">{ticket.venue}</div>
                          </div>
                        </div>

                        {/* Perforation */}
                        <div className="relative w-[1px] bg-[#1E2224] flex flex-col items-center justify-center z-20">
                          <div className="dashed-line absolute top-1 bottom-1" />
                          <div className="absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full bg-background-dark" />
                          <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 rounded-full bg-background-dark" />
                        </div>

                        {/* Ticket Right Side */}
                        <div className={`relative w-20 min-w-[80px] flex flex-col items-center justify-center p-2 border-l border-white/5 ${isUsedOrRefunded ? 'bg-[#15181A]' : 'bg-[#191D1F]'}`}>
                           {/* Simplified QR placeholder */}
                           <div className={`w-12 h-12 rounded bg-white p-0.5 mb-1 ${isUsedOrRefunded ? 'opacity-30' : ''}`}>
                              <img src={ticket.qrCodeUrl} className="w-full h-full object-contain mix-blend-multiply"/>
                           </div>
                           <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider writing-vertical-lr text-center">
                              {isExpired ? 'EXPIRED' : isUsedOrRefunded ? ticket.status : 'SCAN'}
                           </span>
                        </div>
                      </div>
                    </Link>
                  );
                };

                return (
                  <>
                    {displayTickets.map(t => renderCard(t, false))}
                    
                    {expiredList.length > 0 && (
                      <div className="mt-8 pt-6 border-t border-white/5">
                        <h4 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-4 pl-2">Past & Expired</h4>
                        {expiredList.map(t => renderCard(t, true))}
                      </div>
                    )}
                  </>
                );
            })()}
            </>
        )
        }
      </div>

      {/* Bottom Tab Bar - Always visible */}
      <BottomTabBar />
    </div>
  );
}
