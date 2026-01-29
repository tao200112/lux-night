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
                 // Assuming Backend returns mostly NY/UTC normalized times. 
                 // We will format in Local or NY Time.
             });
          }
      })
      .catch(() => {});
  }, [token]);

  // Helper to format window
  const formatTicketWindow = (start?: string, end?: string) => {
      if (!start || !end) return 'Check details';
      // Use Local Time for now, or use timezone if provided. 
      // User requested "Jan 28 4:00 PM – Jan 29 2:00 AM (ET)".
      // Javascript Intl is good for this.
      const opts: Intl.DateTimeFormatOptions = {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          timeZone: 'America/New_York', // Forced per requirements
          timeZoneName: 'short'
      };
      
      const s = new Date(start).toLocaleString('en-US', opts);
      const e = new Date(end).toLocaleString('en-US', { ...opts, timeZoneName: undefined }); // Don't repeat TZ
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
            <>
              <button
                onClick={handleTap}
                onBlur={resetCount}
                disabled={submitting}
                className={`w-full font-bold py-6 rounded-2xl text-center transition-all shadow-lg ${
                   count > 0 ? 'bg-lux-gold text-black scale-[1.02]' : 'bg-primary text-white hover:bg-primary/90'
                } disabled:opacity-60 disabled:scale-100`}
              >
                {submitting
                  ? 'Processing...'
                  : count === 0 ? 'Tap 3 times to Redeem' 
                  : `Tap Again (${count}/3)`}
              </button>
              {error && (
                <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
                    <p className="text-alert-red text-sm font-bold">{error}</p>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-6 text-center">
              <span className="material-symbols-outlined text-4xl text-amber-400 mb-2">check_circle</span>
              <p className="font-bold text-amber-200">
                {redeemed.already ? 'Ticket Used / Limit Reached' : 'Success'}
              </p>
              {isMultiUse && (
                 <p className="text-xl font-bold bg-black/20 rounded-lg py-2 mt-2">
                    {redeemed.count} / {redeemed.limit}
                 </p>
              )}
              {redeemed.redeemedAt && (
                <p className="text-white/70 text-sm mt-2">
                  Time: {new Date(redeemed.redeemedAt).toLocaleTimeString()}
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
