'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface PublicTicket {
  eventName: string;
  venueName: string;
  startTime: string | null;
  entryBefore: string | null;
  accessTier: string;
  status: string;
  ticketId: string;
  redeemedAt: string | null;
  redeemedBy: string | null;
}

export default function PublicTicketPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const [token, setToken] = useState<string>('');
  const [data, setData] = useState<PublicTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await params;
      setToken(p.token);
    })();
  }, [params]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setInvalid(false);
      try {
        const res = await fetch(`/api/tickets/public?token=${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (!res.ok) {
          setInvalid(true);
          setData(null);
          return;
        }
        const j = await res.json();
        setData(j);
      } catch {
        if (!cancelled) setInvalid(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="bg-background-dark text-white min-h-screen flex items-center justify-center max-w-md mx-auto">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (invalid || !data) {
    return (
      <div className="bg-background-dark text-white min-h-screen flex flex-col items-center justify-center max-w-md mx-auto p-6">
        <span className="material-symbols-outlined text-5xl text-alert-red mb-4">confirmation_number</span>
        <h1 className="text-xl font-bold text-white mb-2">Invalid ticket</h1>
        <p className="text-white/60 text-sm">This link may be expired or incorrect.</p>
      </div>
    );
  }

  const isUsed = data.status === 'used';
  const isRefunded = data.status === 'refunded';
  const start = data.startTime ? new Date(data.startTime) : null;
  const entry = data.entryBefore ? new Date(data.entryBefore) : null;

  return (
    <div className="bg-background-dark text-white min-h-screen flex flex-col font-display max-w-md mx-auto">
      <main className="flex-1 pt-12 pb-24 px-5">
        <div
          className={`rounded-2xl border-2 p-6 mb-6 ${
            isUsed
              ? 'bg-white/5 border-amber-500/50'
              : isRefunded
              ? 'bg-white/5 border-alert-red/50'
              : 'bg-[#1E2224] border-white/10'
          }`}
        >
          <div className="flex justify-between items-start mb-4">
            <h1 className="text-xl font-bold text-white">{data.eventName}</h1>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                isUsed
                  ? 'bg-amber-500/20 text-amber-400'
                  : isRefunded
                  ? 'bg-alert-red/20 text-alert-red'
                  : 'bg-primary/20 text-primary'
              }`}
            >
              {isUsed ? 'USED' : isRefunded ? 'REFUNDED' : 'ACTIVE'}
            </span>
          </div>
          <p className="text-white/70 text-sm mb-4">{data.venueName}</p>
          <div className="space-y-2 text-sm">
            {start && (
              <p>
                <span className="text-white/50">Start:</span>{' '}
                {start.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            )}
            {entry && (
              <p>
                <span className="text-white/50">Entry before:</span>{' '}
                {entry.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            )}
            <p>
              <span className="text-white/50">Tier:</span> {data.accessTier}
            </p>
            <p>
              <span className="text-white/50">Ticket ID:</span> …{data.ticketId}
            </p>
          </div>
          {isUsed && data.redeemedAt && (
            <p className="mt-4 text-amber-400/90 text-xs">
              Redeemed: {new Date(data.redeemedAt).toLocaleString()}
            </p>
          )}
        </div>
        {!isUsed && !isRefunded && (
          <Link
            href={`/redeem/${token}`}
            className="block w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl text-center"
          >
            Redeem (Staff)
          </Link>
        )}
      </main>
    </div>
  );
}
