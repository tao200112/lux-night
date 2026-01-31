'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RedeemPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const [token, setToken] = useState<string>('');
  const [count, setCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [redeemed, setRedeemed] = useState<{ 
     redeemedAt: string; 
     redeemedBy?: string; 
     already?: boolean;
     count?: number;
     limit?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ 
    eventName?: string; 
    venueName?: string; 
    status?: string;
    validStartAt?: string;
    validEndAt?: string;
    timezone?: string;
    testConfig?: { isTestMode: boolean; earlyMinutes: number; lateMinutes: number };
  } | null>(null);

  useEffect(() => {
    (async () => {
      const p = await params;
      setToken(p.token);
    })();
  }, [params]);

  // Prefetch public ticket for display
  useEffect(() => {
    if (!token) return;
    fetch(`/api/tickets/public?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
          if (d && d.ticket) {
             setInfo({ 
                 eventName: d.ticket.eventName, 
                 venueName: d.ticket.venueName, 
                 status: d.ticket.status,
                 validStartAt: d.ticket.validStartAt,
                 validEndAt: d.ticket.validEndAt,
                 testConfig: d.meta?.testConfig
             });
          }
      })
      .catch(() => {});
  }, [token]);

  // Helper to format window
  const formatTicketWindow = (start?: string, end?: string) => {
      if (!start || !end) return 'Check details';
      const opts: Intl.DateTimeFormatOptions = {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          timeZone: 'America/New_York', // Forced per requirements
          timeZoneName: 'short'
      };
      
      const s = new Date(start).toLocaleString('en-US', opts);
      const e = new Date(end).toLocaleString('en-US', { ...opts, timeZoneName: undefined }); 
      return `${s} – ${e}`;
  };

  const handleTap = () => {
    if (redeemed || submitting) return;
    if (count < 2) {
      setCount((c) => c + 1);
      return;
    }
    // 3rd tap: submit
    setSubmitting(true);
    setError(null);
    fetch('/api/tickets/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, redeem_method: 'tap' }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          // Status Handling
          if (r.status === 401 || r.status === 403) {
             setError('权限不足：仅限工作人员登录后核销');
             setCount(0);
             return;
          }
          
          let msg = '核销失败';
          const code = j.code;
          
          switch (code) {
             case 'TOO_EARLY':
                msg = `未到核销时间\n有效期: ${formatTicketWindow(j.debugInfo?.startsAt || j.validFrom, j.debugInfo?.endsAt)}`;
                break;
             case 'EXPIRED':
                msg = `票据已过期\n有效期: ${formatTicketWindow(j.debugInfo?.startsAt, j.debugInfo?.endsAt || j.expiredAt)}`;
                break;
             case 'LIMIT_REACHED':
                msg = `核销次数已用完 (${j.redeemedCount}/${j.redeemLimit})`;
                break;
             case 'STATUS_INVALID':
                msg = `票据状态无效 (${j.status})`;
                break;
             default:
                msg = j.message || j.error || `Error: ${r.status}`;
          }

          // Special case: Limit Reached might return 409 with ticket data
          if (code === 'LIMIT_REACHED' && j.ticket) {
             setRedeemed({
                redeemedAt: j.ticket.redeemed_at,
                redeemedBy: j.ticket.redeemed_by,
                already: true,
                count: j.ticket.redeemed_count,
                limit: j.ticket.redeem_limit
             });
             setError(msg); 
             return;
          }
          
          setError(msg);
          setCount(0);
          return;
        }

        // Success
        setRedeemed({
          redeemedAt: j.ticket?.redeemed_at || new Date().toISOString(),
          redeemedBy: j.ticket?.redeemed_by,
          already: !!j.alreadyRedeemed,
          count: j.ticket?.redeemed_count,
          limit: j.ticket?.redeem_limit
        });
      })
      .catch(() => {
        setError('网络错误，请重试');
        setCount(0);
      })
      .finally(() => setSubmitting(false));
  };

  const resetCount = () => {
    if (!submitting && !redeemed) setCount(0);
  };

  if (!token) {
    return (
      <div className="bg-background-dark text-white min-h-screen flex items-center justify-center max-w-md mx-auto">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  
  // Logic to show "Redeemed Count" if multi-use
  // Using info from Public API if available, or just default
  // Actually public API returns limit/count. But we didn't store it in 'info'.
  // We can update 'info' state or just use 'redeemed' state if done.
  const isMultiUse = (redeemed?.limit || 1) > 1;

  return (
    <div className="bg-background-dark text-white min-h-screen flex flex-col font-display max-w-md mx-auto">
      <header className="pt-6 px-5 pb-2">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/80 hover:text-white"
        >
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
          Back
        </button>
        {info?.testConfig?.isTestMode && (
          <div className="mx-4 mt-2 px-3 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-xs text-blue-200 text-center">
            🧪 测试模式：允许提前 {info.testConfig.earlyMinutes} 分钟核销
          </div>
        )}
        <h1 className="text-lg font-bold mt-2">Redeem Ticket</h1>
        {info?.eventName && (
          <p className="text-white/60 text-sm mt-0.5">{info.eventName} · {info.venueName}</p>
        )}
        {info?.validStartAt && (
           <p className="text-lux-gold/80 text-xs mt-2 font-mono">
              {formatTicketWindow(info.validStartAt, info.validEndAt)}
           </p>
        )}
        {info?.status === 'expired' && (
           <span className="inline-block px-2 py-0.5 mt-2 rounded bg-zinc-700 text-white/70 text-xs font-bold uppercase">Expired</span>
        )}
      </header>

      <main className="flex-1 px-5 pb-24">
        {/* (a) Redeem Ticket */}
        <section className="mb-8">
          <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Staff Operation</p>
          
          {!redeemed ? (
            <div className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
                count === 0 ? 'bg-[#151515] border-[#D4AF37]/30 shadow-none' :
                count === 1 ? 'bg-[#1A1A1A] border-[#D4AF37]/60 shadow-[0_0_15px_rgba(212,175,55,0.15)]' :
                'bg-[#221E10] border-[#FFD700]/80 shadow-[0_0_25px_rgba(255,215,0,0.3)]'
            }`}>
              <button
                onClick={handleTap}
                onBlur={resetCount}
                disabled={submitting}
                className="relative z-10 w-full py-8 flex flex-col items-center justify-center gap-3 active:scale-[0.98] transition-transform"
              >
                  {/* Status Text & Button Appearance */}
                  <span className={`text-xl font-bold tracking-wide transition-colors duration-200 ${
                      count === 2 ? 'text-[#FFD700]' : 
                      count === 1 ? 'text-[#D4AF37]' : 
                      'text-[#8A7E5E]'
                  }`}>
                      {submitting ? 'PROCESSING...' : 
                       count === 0 ? 'TAP TO REDEEM' :
                       count === 1 ? 'CONFIRM (1/3)' :
                       'CONFIRM AGAIN (2/3)'}
                  </span>

                  {/* Progress Dots */}
                  <div className="flex items-center gap-3 mt-1">
                      <div className={`w-3 h-3 rounded-full border border-[#D4AF37] transition-all duration-300 ${
                          count >= 1 ? 'bg-[#D4AF37] shadow-[0_0_8px_#D4AF37]' : 'bg-transparent opacity-30'
                      }`} />
                      <div className={`w-3 h-3 rounded-full border border-[#D4AF37] transition-all duration-300 ${
                          count >= 2 ? 'bg-[#D4AF37] shadow-[0_0_8px_#D4AF37]' : 'bg-transparent opacity-30'
                      }`} />
                      <div className={`w-3 h-3 rounded-full border border-[#D4AF37] transition-all duration-300 ${
                          submitting ? 'bg-[#D4AF37] shadow-[0_0_8px_#D4AF37] animate-pulse' : 'bg-transparent opacity-30'
                      }`} />
                  </div>
              </button>

              {/* Background Glow Effect */}
              <div className={`absolute inset-0 bg-gradient-to-t from-[#D4AF37]/5 to-transparent pointer-events-none transition-opacity duration-300 ${
                  count > 0 ? 'opacity-100' : 'opacity-0'
              }`} />

              {error && (
                <div className="flex flex-col items-center justify-center p-3 bg-red-500/10 border-t border-red-500/20 text-center w-full relative z-20">
                    <p className="text-red-400 text-sm font-bold">{error}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-[#D4AF37] bg-[#0A0A0A] p-8 text-center shadow-[0_0_30px_rgba(212,175,55,0.2)]">
               {/* Success Icon */}
               <div className="w-16 h-16 rounded-full bg-[#D4AF37]/10 flex items-center justify-center mx-auto mb-4 border border-[#D4AF37]/30">
                  <span className="material-symbols-outlined text-4xl text-[#D4AF37]">verified</span>
               </div>
               
               <p className="font-bold text-white text-xl tracking-wide mb-1">
                  {redeemed.already ? 'TICKET USED' : 'SUCCESS'}
               </p>
               <p className="text-[#8A7E5E] text-sm font-medium uppercase tracking-widest mb-6">Redemption Complete</p>

               {/* Full Dots */}
               <div className="flex items-center justify-center gap-3 mb-6">
                  {[1, 2, 3].map(i => (
                      <div key={i} className="w-3 h-3 rounded-full bg-[#D4AF37] shadow-[0_0_5px_#D4AF37]" />
                  ))}
               </div>

               {isMultiUse && (
                  <p className="text-lg font-bold text-white bg-white/5 rounded-lg py-2 px-4 inline-block mb-2">
                     Use {redeemed.count} of {redeemed.limit}
                  </p>
               )}
               {redeemed.redeemedAt && (
                 <p className="text-zinc-500 text-xs mt-2 font-mono">
                   {new Date(redeemed.redeemedAt).toLocaleTimeString()}
                 </p>
               )}
            </div>
          )}
        </section>

        {/* (b) Redemption Guide */}
        <section className="rounded-2xl bg-white/5 border border-white/10 p-6">
          <h3 className="text-white font-bold text-xs uppercase tracking-widest mb-4 opacity-80">
            Redemption Guide
          </h3>
          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary mt-0.5" style={{ fontSize: '18px' }}>
                brightness_7
              </span>
              <p className="text-white/90 text-sm leading-relaxed">
                Set screen brightness to <strong className="text-white">100%</strong>.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary mt-0.5" style={{ fontSize: '18px' }}>
                badge
              </span>
              <p className="text-white/90 text-sm leading-relaxed">
                Present government ID matching the ticket holder.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary mt-0.5" style={{ fontSize: '18px' }}>
                door_front
              </span>
              <p className="text-white/90 text-sm leading-relaxed">
                Use the designated entrance for your ticket tier.
              </p>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
