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
        {(() => {
           const isExpired = ticket.validEndAt && new Date(ticket.validEndAt) <= new Date();
           // Also treat as used if redeemed
           const isInactive = ticket.status === 'used' || redemptionStatus === 'redeemed' || isExpired;
           
           return (
             <div className="relative w-full mb-8">
                 {/* 黑金票券卡容器 */}
                 <div className={`bg-[#0A0A0A] rounded-2xl p-4 flex flex-col items-center shadow-[0_0_20px_rgba(212,175,55,0.1)] border border-[#D4AF37]/25 relative z-10 overflow-hidden transition-all duration-500 ${isInactive ? 'opacity-80' : ''}`}>
                     {/* 内层 QR 面板: bg-neutral-50/95 */}
                     <div className="w-full bg-neutral-50/95 rounded-xl p-3 flex flex-col items-center mb-3">
                        <img alt="QR code" className="w-full aspect-square object-contain mix-blend-multiply" src={ticket.qrCodeUrl}/>
                     </div>
                     
                     {/* CODE 区域: 紧凑行 */}
                     <div className="flex items-center justify-between w-full px-2">
                        <div className="flex items-center gap-2">
                             <p className="text-[#8A7E5E] text-[10px] font-bold tracking-widest uppercase font-display">Code</p>
                             <p className="text-white font-bold text-lg tracking-wider font-mono">{ticket.id.slice(0, 8)}</p>
                        </div>
                        {/* VALID badge: small pill */}
                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border ${
                            redemptionStatus === 'redeemed' ? 'bg-zinc-800 border-zinc-700 text-zinc-400' 
                            : isExpired ? 'bg-zinc-900 border-zinc-700 text-red-400' 
                            : 'bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37]'
                        }`}>
                           {redemptionStatus === 'redeemed' ? 'USED' : isExpired ? 'EXPIRED' : 'VALID'}
                        </div>
                     </div>
                     
                     {redemptionStatus === 'redeemed' && (
                         <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-[1px]">
                             <div className="bg-black/90 p-3 rounded-lg border-2 border-[#D4AF37] text-[#D4AF37] font-bold text-xl uppercase tracking-widest -rotate-12 shadow-2xl">
                                 REDEEMED
                             </div>
                         </div>
                     )}
                     
                     {isExpired && redemptionStatus !== 'redeemed' && (
                         <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-[1px]">
                             <div className="bg-zinc-800/90 p-3 rounded-lg border-2 border-zinc-500 text-zinc-300 font-bold text-xl uppercase tracking-widest -rotate-12 shadow-2xl">
                                 EXPIRED
                             </div>
                         </div>
                     )}
                 </div>
             </div>
           );
        })()}

        {/* Ticket Stats - Minimalist */}
        <div className="grid grid-cols-2 gap-3 w-full mb-6 mt-0">
            <div className="bg-[#0A0A0A] p-3 rounded-lg border border-white/5 flex flex-col justify-center">
                <p className="text-[#8A7E5E] text-[10px] font-bold uppercase tracking-wider mb-1">Ticket Type</p>
                <p className="text-white text-[15px] font-medium truncate">{ticket.tierName}</p>
            </div>
            <div className="bg-[#0A0A0A] p-3 rounded-lg border border-white/5 flex flex-col justify-center">
                <p className="text-[#8A7E5E] text-[10px] font-bold uppercase tracking-wider mb-1">核销时间</p>
                <p className="text-white text-[15px] font-medium">
                {(() => {
                    // 优先级 1: 已核销时间 (ticket.redeemedAt - 假设字段，需确认，此处用 status 判断辅助)
                    // 注意：API 返回的 ticket 对象定义在 @/lib/data/tickets.ts，这里我们只能用现有字段
                    // 假设 ticket.status === 'used' 代表已核销。如果后端传了 redeemedAt 最好，没有则显示 "已核销"
                    // 检查是否有 redeemedAt 字段 (类型定义可能不完整，暂时尝试用 any 访问或 fallback)
                    const t = ticket as any;
                    
                    if (t.redeemedAt || t.checkedInAt) {
                        const date = new Date(t.redeemedAt || t.checkedInAt);
                        return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    }
                    if (ticket.status === 'used' || redemptionStatus === 'redeemed') {
                        return '已核销'; // Fallback if no specific time
                    }

                    // 优先级 2: 截止时间
                    // ticket.entryBefore / ticket.validBefore / ticket.redeemBefore
                    // 现有代码用的是 ticket.time 作为 fallback
                    const deadline = t.entryBefore || t.validBefore || t.redeemBefore || ticket.time;
                    if (deadline) {
                        // 如果是纯时间字符串 "23:00"，直接显示
                        // 如果是日期对象，格式化
                        return `需在 ${deadline} 前核销`;
                    }

                    // 优先级 3
                    return '—';
                })()}
                </p>
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
