'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RedeemPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const [token, setToken] = useState<string>('');
  const [count, setCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [redeemed, setRedeemed] = useState<{ redeemedAt: string; redeemedBy?: string; already?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ eventName?: string; venueName?: string; status?: string } | null>(null);

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
      .then((d) => d && setInfo({ eventName: d.eventName, venueName: d.venueName, status: d.status }))
      .catch(() => {});
  }, [token]);

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
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (j.alreadyRedeemed) {
            setRedeemed({
              redeemedAt: j.ticket?.redeemed_at || new Date().toISOString(),
              redeemedBy: j.ticket?.redeemed_by,
              already: true,
            });
            return;
          }
          if (r.status === 403) {
            setError('Only staff can redeem. Please log in with a staff account.');
            setCount(0);
            return;
          }
          setError(j.error || 'Redemption failed');
          setCount(0);
          return;
        }
        setRedeemed({
          redeemedAt: j.ticket?.redeemed_at || new Date().toISOString(),
          redeemedBy: j.ticket?.redeemed_by,
          already: !!j.alreadyRedeemed,
        });
      })
      .catch(() => {
        setError('Network error');
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

  const done = !!redeemed;

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
      </header>

      <main className="flex-1 px-5 pb-24">
        {/* (a) Redeem Ticket */}
        <section className="mb-8">
          <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Staff only</p>
          <p className="text-white/70 text-sm mb-4">
            Only staff can redeem. You must be logged in with a staff or admin account. Permission is enforced by the server.
          </p>
          {!done ? (
            <>
              <button
                onClick={handleTap}
                onBlur={resetCount}
                disabled={submitting}
                className="w-full bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 text-white font-bold py-6 rounded-2xl text-center transition-all"
              >
                {submitting
                  ? 'Redeeming…'
                  : `Tap 3 times to Redeem  ${count}/3`}
              </button>
              {error && (
                <p className="mt-3 text-alert-red text-sm">{error}</p>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-6 text-center">
              <span className="material-symbols-outlined text-4xl text-amber-400 mb-2">check_circle</span>
              <p className="font-bold text-amber-200">
                {redeemed?.already ? 'Ticket already redeemed' : 'Redeemed successfully'}
              </p>
              {redeemed?.redeemedAt && (
                <p className="text-white/70 text-sm mt-2">
                  Redeemed: {new Date(redeemed.redeemedAt).toLocaleString()}
                  {redeemed.redeemedBy && ' (by staff)'}
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
