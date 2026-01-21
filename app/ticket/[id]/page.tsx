'use client';

import React, { useState, useEffect } from 'react';
import { getTicket, Ticket } from '@/lib/data/tickets';
import { useAuth } from '../../../contexts/AuthContext';
import Button from '../../../components/ui/Button';
import BackButton from '../../../components/ui/BackButton';
import { useRouter } from 'next/navigation';

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const resolvedParams = typeof params === 'object' && 'then' in params ? { id: '' } : params;
  const ticketId = resolvedParams.id;
  
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redemptionStatus, setRedemptionStatus] = useState<'idle' | 'confirming' | 'redeemed'>('idle');

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

  const handleRedeemClick = async () => {
    if (redemptionStatus === 'idle') {
      setRedemptionStatus('confirming');
      // Reset after 3 seconds if not confirmed
      setTimeout(() => {
        setRedemptionStatus(prev => prev === 'confirming' ? 'idle' : prev);
      }, 3000);
    } else if (redemptionStatus === 'confirming') {
      try {
        const response = await fetch(`/api/tickets/${ticketId}/redeem`, {
          method: 'POST',
        });

        const data = await response.json();

        if (!response.ok) {
          if (data.alreadyRedeemed) {
            setRedemptionStatus('redeemed');
            if (ticket) {
              setTicket({ ...ticket, status: 'used' });
            }
          }
          throw new Error(data.error || 'Failed to redeem ticket');
        }

        setRedemptionStatus('redeemed');
        if (ticket) {
          setTicket({ ...ticket, status: 'used', redeemedAt: data.ticket.redeemed_at });
        }
      } catch (err: any) {
        console.error('Redemption error:', err);
        setRedemptionStatus('idle');
        alert(err.message || 'Failed to redeem ticket');
      }
    }
  };

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

        {/* QR Card */}
        <div className="relative w-full mb-12">
            <div className={`bg-white rounded-3xl pt-10 pb-12 px-6 flex flex-col items-center shadow-2xl relative z-10 overflow-hidden transition-all duration-500 ${ticket.status === 'used' || redemptionStatus === 'redeemed' ? 'opacity-50 grayscale' : ''}`}>
                <div className="w-full flex justify-center mb-8">
                    <img alt="QR code" className="w-64 h-64 object-contain mix-blend-multiply" src={ticket.qrCodeUrl}/>
                </div>
                <div className="flex flex-col items-center gap-1 w-full border-t border-gray-100 pt-6">
                    <p className="text-gray-400 text-[10px] font-bold tracking-[0.25em] uppercase font-body">Ticket ID</p>
                    <p className="text-black font-bold text-3xl tracking-[0.15em] font-mono">{ticket.id.slice(0, 8)}</p>
                </div>
                
                {redemptionStatus === 'redeemed' && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center">
                        <div className="bg-black/80 backdrop-blur-sm p-4 rounded-xl border border-primary/50 text-primary font-bold text-2xl uppercase tracking-widest -rotate-12 border-4">
                            REDEEMED
                        </div>
                    </div>
                )}
            </div>
            
            <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap">
                <div className={`border-2 px-8 py-3 rounded-full text-lg font-bold tracking-[0.2em] shadow-[0_8px_20px_rgba(0,0,0,0.6)] flex items-center gap-2 transition-colors duration-300 ${redemptionStatus === 'redeemed' ? 'bg-gray-800 border-gray-600 text-gray-400' : 'bg-background-dark border-accent-gold text-accent-gold'}`}>
                    <span className="material-symbols-outlined filled" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                    {redemptionStatus === 'redeemed' ? 'USED' : 'ACTIVE'}
                </div>
            </div>
        </div>

        {/* Ticket Stats */}
        <div className="grid grid-cols-2 gap-3 w-full mb-6 mt-2">
            <div className="glass-panel p-4 rounded-2xl flex flex-col items-start gap-2">
                <div className="p-2 rounded-lg bg-white/5 text-accent-gold"><span className="material-symbols-outlined" style={{ fontSize: '20px' }}>diamond</span></div>
                <div>
                    <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider mb-0.5">Access Tier</p>
                    <p className="text-white text-base font-bold">{ticket.tierName}</p>
                </div>
            </div>
            <div className="glass-panel p-4 rounded-2xl flex flex-col items-start gap-2">
                <div className="p-2 rounded-lg bg-white/5 text-white/80"><span className="material-symbols-outlined" style={{ fontSize: '20px' }}>schedule</span></div>
                <div>
                    <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider mb-0.5">Entry Before</p>
                    <p className="text-white text-base font-bold">{ticket.time}</p>
                </div>
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
        
        {/* Staff / Self-Redemption Controls (if staff) */}
        {(user?.role === 'staff' || user?.role === 'merchant' || user?.role === 'admin') && (
            <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
                <h3 className="text-white font-bold text-xs uppercase tracking-widest mb-4 opacity-50">Staff Controls</h3>
                <Button 
                    onClick={handleRedeemClick} 
                    disabled={redemptionStatus === 'redeemed'}
                    className={`w-full transition-all duration-200 ${redemptionStatus === 'confirming' ? 'bg-alert-red text-white' : ''}`}
                    icon={redemptionStatus === 'redeemed' ? 'lock' : 'qr_code_scanner'}
                >
                    {redemptionStatus === 'idle' && 'Scan / Redeem'}
                    {redemptionStatus === 'confirming' && 'Tap again to Confirm'}
                    {redemptionStatus === 'redeemed' && 'Ticket Redeemed'}
                </Button>
            </div>
        )}
        
        <button className="w-full bg-white/5 hover:bg-white/10 active:bg-white/15 text-white h-14 rounded-2xl flex items-center justify-center gap-2 transition-all border border-white/5 mb-2">
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>wallet</span>
            <span className="font-body font-bold text-sm">Add to Apple Wallet</span>
        </button>
      </main>
      
      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 w-full p-5 bg-gradient-to-t from-[#131417] via-[#131417] to-transparent z-40">
        <div className="max-w-md mx-auto w-full">
          <button className="group relative w-full bg-primary hover:bg-[#244f43] text-white h-14 rounded-xl flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(43,92,78,0.4)] transition-all overflow-hidden">
            <div className="absolute inset-0 w-full h-full shimmer"></div>
            <span className="material-symbols-outlined relative z-10" style={{ fontSize: '24px' }}>fullscreen</span>
            <span className="font-bold text-base tracking-wide relative z-10">Show Ticket</span>
          </button>
        </div>
      </div>
    </div>
  );
}
