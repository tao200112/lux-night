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

  // Prefetch public ticket for display; pre-set redeemed if already used (block double redeem UI)
  useEffect(() => {
    if (!token) return;
    fetch(`/api/tickets/public?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
          if (d && d.ticket) {
             const t = d.ticket;
             setInfo({ 
                 eventName: t.eventName, 
                 venueName: t.venueName, 
                 status: t.status,
                 validStartAt: t.validStartAt,
                 validEndAt: t.validEndAt,
                 testConfig: d.meta?.testConfig
             });
             // Already redeemed: pre-set state so Redeem button is hidden
             if (t.status === 'used' || t.db_status === 'used') {
               setRedeemed({
                 redeemedAt: t.redeemedAt || new Date().toISOString(),
                 redeemedBy: t.redeemedBy,
                 already: true,
                 count: t.redeemedCount,
                 limit: t.redeemLimit
               });
             }
          }
      })
      .catch(() => {});
  }, [token]);

  const [isOnline, setIsOnline] = useState(true);
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Connectivity Monitoring
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
    // 1. Basic Guards
    if (redeemed || submitting || !isOnline) return;

    // 2. Reset Timer Logic (2.0s window)
    if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = setTimeout(() => {
        if (!submitting && !redeemed) {
            setCount(0);
        }
    }, 2000);

    // 3. Count Logic
    if (count < 2) {
      setCount((c) => c + 1);
      return;
    }

    // 4. Submit & Lock
    if (abortControllerRef.current) {
        abortControllerRef.current.abort(); // Cancel prev if any (though button disabled)
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setSubmitting(true);
    setError(null);

    // Timeout Promise
    const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timed out')), 10000)
    );

    // Request
    const request = fetch('/api/tickets/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, redeem_method: 'tap' }),
      signal: controller.signal
    });

    Promise.race([request, timeout])
      .then(async (res: any) => {
        if (controller.signal.aborted) return;

        // Strict Success Check: Must be HTTP OK
        if (!res.ok) {
           let j = {};
           try { j = await res.json(); } catch(e) {}
           
           // Auth Error
           if (res.status === 401 || res.status === 403) {
             throw new Error('权限不足：仅限工作人员登录后核销');
           }

           const code = (j as any).code;
           const debugInfo = (j as any).debugInfo;
           const ticketData = (j as any).ticket;

           // Already Redeemed (409): show "Ticket already redeemed" state, no error
           if ((code === 'ALREADY_REDEEMED' || code === 'LIMIT_REACHED' || code === 'CONCURRENT_REDEEM') && ticketData) {
               setRedeemed({
                   redeemedAt: ticketData.redeemed_at || ticketData.redeemedAt,
                   redeemedBy: ticketData.redeemed_by || ticketData.redeemedBy,
                   already: true,
                   count: ticketData.redeemed_count ?? ticketData.redeemedCount,
                   limit: ticketData.redeem_limit ?? ticketData.redeemLimit
               });
               return;
           }

           // Other Errors
           let msg = 'Redemption Failed';
           switch (code) {
               case 'TOO_EARLY':
                  msg = `Too Early to Redeem\nWindow: ${formatTicketWindow(debugInfo?.startsAt, debugInfo?.endsAt)}`;
                  break;
               case 'EXPIRED':
                  msg = `Ticket Expired\nWindow: ${formatTicketWindow(debugInfo?.startsAt, debugInfo?.endsAt)}`;
                  break;
               case 'LIMIT_REACHED':
                  msg = `Limit Reached (${(j as any).redeemedCount}/${(j as any).redeemLimit})`;
                  break;
               case 'STATUS_INVALID':
                  msg = `Invalid Status (${(j as any).status})`;
                  break;
               default:
                  msg = (j as any).message || (j as any).error || `Server Error (${res.status})`;
           }
           throw new Error(msg);
        }

        // Response is OK
        const j = await res.json();
        
        // Final Double Check of 'success' flag if API provides it
        // The API returns ticket object on success.
        if (!j.ticket && !j.success) {
            throw new Error('Invalid server response');
        }

        setRedeemed({
          redeemedAt: j.ticket?.redeemed_at || new Date().toISOString(),
          redeemedBy: j.ticket?.redeemed_by,
          already: !!j.alreadyRedeemed,
          count: j.ticket?.redeemed_count,
          limit: j.ticket?.redeem_limit
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        // Verify we NEVER set Redeemed=true here
        console.error('Redeem error:', err);
        setError(err.message || 'Network error. Please try again.');
        setCount(0); // Reset UI
      })
      .finally(() => {
         if (!controller.signal.aborted) {
             setSubmitting(false);
             abortControllerRef.current = null;
         }
      });
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
        {/* Network Status Banner */}
        {!isOnline && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
                <span className="material-symbols-outlined text-red-400">wifi_off</span>
                <p className="text-red-300 text-sm font-bold">You are offline. Network required.</p>
            </div>
        )}

        {/* (a) Redeem Ticket */}
        <section className="mb-8">
          <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Staff Operation</p>
          
          {!redeemed ? (
            <div className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
                !isOnline ? 'bg-[#151515] border-white/5 opacity-50 grayscale' :
                count === 0 ? 'bg-[#151515] border-[#D4AF37]/30 shadow-none' :
                count === 1 ? 'bg-[#1A1A1A] border-[#D4AF37]/60 shadow-[0_0_15px_rgba(212,175,55,0.15)]' :
                'bg-[#221E10] border-[#FFD700]/80 shadow-[0_0_25px_rgba(255,215,0,0.3)]'
            }`}>
              <button
                onClick={handleTap}
                onBlur={resetCount}
                disabled={submitting || !isOnline}
                className="relative z-10 w-full py-8 flex flex-col items-center justify-center gap-3 active:scale-[0.98] transition-transform disabled:active:scale-100 disabled:cursor-not-allowed"
              >
                  {/* Status Text & Button Appearance */}
                  <span className={`text-xl font-bold tracking-wide transition-colors duration-200 ${
                      !isOnline ? 'text-zinc-500' :
                      count === 2 ? 'text-[#FFD700]' : 
                      count === 1 ? 'text-[#D4AF37]' : 
                      'text-[#8A7E5E]'
                  }`}>
                      {!isOnline ? 'NETWORK REQ.' :
                       submitting ? 'PROCESSING...' : 
                       count === 0 ? 'TAP TO REDEEM' :
                       count === 1 ? 'CONFIRM (1/3)' :
                       'CONFIRM AGAIN (2/3)'}
                  </span>

                  {/* Progress Dots */}
                  <div className="flex items-center gap-3 mt-1">
                      <div className={`w-3 h-3 rounded-full border border-[#D4AF37] transition-all duration-300 ${
                          !isOnline ? 'border-zinc-700 bg-transparent' :
                          count >= 1 ? 'bg-[#D4AF37] shadow-[0_0_8px_#D4AF37]' : 'bg-transparent opacity-30'
                      }`} />
                      <div className={`w-3 h-3 rounded-full border border-[#D4AF37] transition-all duration-300 ${
                          !isOnline ? 'border-zinc-700 bg-transparent' :
                          count >= 2 ? 'bg-[#D4AF37] shadow-[0_0_8px_#D4AF37]' : 'bg-transparent opacity-30'
                      }`} />
                      <div className={`w-3 h-3 rounded-full border border-[#D4AF37] transition-all duration-300 ${
                          !isOnline ? 'border-zinc-700 bg-transparent' :
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
                   {new Date(redeemed.redeemedAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}
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
