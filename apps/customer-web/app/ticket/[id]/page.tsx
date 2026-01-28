'use client';

import React, { useState, useEffect } from 'react';
import { getTicket, Ticket } from '@/lib/data/tickets';
import { useAuth } from '../../../contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [ticketId, setTicketId] = useState<string>('');
  
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redemptionStatus, setRedemptionStatus] = useState<'idle' | 'confirming' | 'redeemed'>('idle');

  // Resolve params (Next.js 15 always provides Promise)
  useEffect(() => {
    async function resolveParams() {
      const resolved = await params;
      setTicketId(resolved.id);
    }
    resolveParams();
  }, [params]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/login?redirect=' + encodeURIComponent(`/ticket/${ticketId}`));
      return;
    }

    async function fetchTicket() {
      try {
        setLoading(true);
        setError(null);

        if (!ticketId || !user) return;

        // Fetch ticket using data layer
        const ticketData = await getTicket(ticketId, user.id);

        if (!ticketData) {
          throw new Error('Ticket not found');
        }

        setTicket(ticketData);
        if (ticketData.status === 'used') {
          setRedemptionStatus('redeemed');
        }
      } catch (err: any) {
        console.error('Error fetching ticket:', err);
        setError(err.message || 'Failed to load ticket');
      } finally {
        setLoading(false);
      }
    }

    if (ticketId && user) {
      fetchTicket();
    }
  }, [ticketId, user, authLoading, router]);

  if (loading) {
    return (
      <div className="bg-background-dark text-white min-h-screen flex items-center justify-center max-w-md mx-auto">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="bg-background-dark text-white min-h-screen flex items-center justify-center max-w-md mx-auto p-6">
        <div className="text-center">
          <span className="material-symbols-outlined text-4xl text-alert-red mb-4">error</span>
          <h3 className="text-lg font-bold text-white mb-2">Error loading ticket</h3>
          <p className="text-sm text-gray-500 mb-6">{error || 'Ticket not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background-dark text-white min-h-screen flex flex-col font-display max-w-md mx-auto relative overflow-hidden">
      {/* Top Bar */}
      <div className="fixed top-0 w-full z-50 bg-background-dark/95 backdrop-blur-md border-b border-white/5 max-w-md">
        <div className="flex items-center justify-between px-4 py-4 w-full">
          <button onClick={() => router.back()} className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/5 transition-colors text-white">
            <span className="material-symbols-outlined">arrow_back_ios_new</span>
          </button>
          <h2 className="text-base font-bold tracking-wide uppercase text-white/90">Ticket Details</h2>
          <button className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/5 transition-colors text-white">
            <span className="material-symbols-outlined">ios_share</span>
          </button>
        </div>
      </div>

      <main className="flex-grow pt-24 pb-36 px-5 flex flex-col items-center w-full">
        {/* Event Header */}
        <div className="text-center mb-6 w-full">
            <h1 className="text-3xl font-bold leading-tight mb-1 text-white">{ticket.eventName}</h1>
            <p className="text-white/60 font-body text-sm font-medium">{ticket.venue}</p>
        </div>

        {/* QR Card - Optimized & Compact */}
        <div className="relative w-full mb-8">
            <div className={`bg-white rounded-2xl pt-8 pb-8 px-6 flex flex-col items-center shadow-lg relative z-10 overflow-hidden transition-all duration-500 ${ticket.status === 'used' || redemptionStatus === 'redeemed' ? 'opacity-50 grayscale' : ''}`}>
                <div className="w-full flex justify-center mb-6">
                    <img alt="QR code" className="w-48 h-48 object-contain mix-blend-multiply" src={ticket.qrCodeUrl}/>
                </div>
                <div className="flex flex-col items-center gap-1 w-full border-t border-gray-100 pt-4">
                    <p className="text-gray-400 text-[9px] font-bold tracking-[0.2em] uppercase font-body">Code</p>
                    <p className="text-black font-bold text-xl tracking-[0.1em] font-mono">{ticket.id.slice(0, 8)}</p>
                </div>
                
                {redemptionStatus === 'redeemed' && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center">
                        <div className="bg-black/90 p-3 rounded-lg border-2 border-primary text-primary font-bold text-xl uppercase tracking-widest -rotate-12">
                            REDEEMED
                        </div>
                    </div>
                )}
            </div>
            
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap">
                <div className={`border px-6 py-2 rounded-full text-sm font-bold tracking-widest shadow-lg flex items-center gap-2 transition-colors duration-300 ${redemptionStatus === 'redeemed' ? 'bg-zinc-800 border-zinc-700 text-zinc-400' : 'bg-[#1A1A1A] border-white/10 text-[rgb(212,175,55)]'}`}>
                    <span className="material-symbols-outlined text-[16px] filled">verified</span>
                    {redemptionStatus === 'redeemed' ? 'USED' : 'VALID'}
                </div>
            </div>
        </div>

        {/* Ticket Stats - Minimalist */}
        <div className="grid grid-cols-2 gap-3 w-full mb-6 mt-4">
            <div className="bg-[#1A1A1A] p-3 rounded-lg border border-white/5 flex flex-col justify-center">
                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-1">Ticket Type</p>
                <p className="text-white text-[15px] font-medium truncate">{ticket.tierName}</p>
            </div>
            <div className="bg-[#1A1A1A] p-3 rounded-lg border border-white/5 flex flex-col justify-center">
                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-1">Entry Before</p>
                <p className="text-white text-[15px] font-medium">{ticket.time || 'Anytime'}</p>
            </div>
        </div>

        {/* Redemption Guide */}
        <div className="w-full glass-panel rounded-2xl p-6 mb-6">
            <h3 className="text-white font-bold text-xs uppercase tracking-widest mb-4 opacity-50">Redemption Guide</h3>
            <ul className="space-y-4">
                <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-accent-gold mt-0.5" style={{ fontSize: '18px' }}>brightness_7</span>
                    <p className="text-white/90 font-body text-sm leading-relaxed">Set screen brightness to <span className="text-white font-bold">100%</span>.</p>
                </li>
                <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-accent-gold mt-0.5" style={{ fontSize: '18px' }}>badge</span>
                    <p className="text-white/90 font-body text-sm leading-relaxed">Present government ID matching ticket.</p>
                </li>
                <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-accent-gold mt-0.5" style={{ fontSize: '18px' }}>door_front</span>
                    <p className="text-white/90 font-body text-sm leading-relaxed">Use the North Entrance VIP lane.</p>
                </li>
            </ul>
        </div>
        
        {/* 核销已迁移到 Show Ticket -> /redeem/[token]，使用三连击与权限校验 */}
        <button className="w-full bg-white/5 hover:bg-white/10 active:bg-white/15 text-white h-14 rounded-2xl flex items-center justify-center gap-2 transition-all border border-white/5 mb-2">
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>wallet</span>
            <span className="font-body font-bold text-sm">Add to Apple Wallet</span>
        </button>
      </main>
      
      {/* Fixed Bottom Button: Show Ticket -> 核销页 /redeem/[token] */}
      <div className="fixed bottom-0 left-0 w-full p-5 bg-gradient-to-t from-[#131417] via-[#131417] to-transparent z-40">
        <div className="max-w-md mx-auto w-full">
          <button
            onClick={() => ticket?.publicToken && router.push(`/redeem/${ticket.publicToken}`)}
            className="group relative w-full bg-primary hover:bg-[#244f43] text-white h-14 rounded-xl flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(43,92,78,0.4)] transition-all overflow-hidden"
          >
            <div className="absolute inset-0 w-full h-full shimmer"></div>
            <span className="material-symbols-outlined relative z-10" style={{ fontSize: '24px' }}>fullscreen</span>
            <span className="font-bold text-base tracking-wide relative z-10">Show Ticket</span>
          </button>
        </div>
      </div>
    </div>
  );
}
