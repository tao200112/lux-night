'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getOrderDetail, toDisplayStatus, type OrderDetail } from '@/lib/data/orders';

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase() }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'America/New_York' } as any);
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [orderId, setOrderId] = useState<string>('');
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const p = await params;
      setOrderId(p.id);
    })();
  }, [params]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=' + encodeURIComponent(`/orders/${orderId}`));
      return;
    }
    if (!user || !orderId) return;
    let cancelled = false;
    getOrderDetail(orderId, user.id)
      .then((d) => {
        if (!cancelled) setOrder(d);
        if (!cancelled && !d) setError('Order not found');
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load order');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, authLoading, orderId, router]);

  if (authLoading || (!user && !error)) {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background-dark flex flex-col items-center justify-center px-6">
        <p className="text-white/70 mb-4">Sign in to view this order.</p>
        <Link href="/login" className="px-6 py-3 rounded-xl bg-primary text-white font-semibold">Sign in</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background-dark px-6 py-8">
        <div className="h-8 w-48 bg-white/10 rounded animate-pulse mb-6" />
        <div className="h-32 bg-white/5 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background-dark flex flex-col items-center justify-center px-6">
        <p className="text-white/70 mb-4">{error || 'Order not found'}</p>
        <Link href="/orders" className="px-6 py-3 rounded-xl bg-primary text-white font-semibold">Back to Orders</Link>
      </div>
    );
  }

  const status = toDisplayStatus(order.status);
  const statusCls = status === 'Paid' ? 'text-emerald-400' : status === 'Refunded' ? 'text-amber-500' : 'text-white/60';

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col bg-background-dark text-white pb-8">
      <header className="sticky top-0 z-10 px-6 py-4 bg-background-dark/95 border-b border-white/5 flex items-center gap-4">
        <Link href="/orders" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/5">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Order</h1>
      </header>

      <main className="flex-1 px-6 py-6">
        <div className="flex justify-between items-center mb-6">
          <span className="text-white/50 text-sm">{formatDate(order.createdAt)}</span>
          <span className={`font-semibold ${statusCls}`}>{status}</span>
        </div>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">Items</h2>
          <div className="space-y-3">
            {order.items.map((i) => (
              <div key={i.id} className="p-4 rounded-2xl bg-[#1E2224] border border-white/5">
                <p className="text-white font-medium">{i.eventName}</p>
                <p className="text-white/50 text-sm">{i.venueName} · {formatTime(i.startAt)}</p>
                <p className="text-white/40 text-sm mt-1">{i.ticketTypeName} × {i.quantity} — {formatAmount(i.unitPriceCents * i.quantity, order.currency)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">Tickets</h2>
          {order.tickets.length === 0 ? (
            <p className="text-white/50 text-sm">No tickets in this order.</p>
          ) : (
            <div className="space-y-2">
              {order.tickets.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <span className="text-white/80 text-sm">…{t.shortId} · {t.ticketTypeName}</span>
                  <span className={`text-xs font-medium ${
                    t.status === 'used' ? 'text-emerald-400' : t.status === 'refunded' ? 'text-amber-500' : 'text-white/50'
                  }`}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="flex justify-between items-center pt-4 border-t border-white/10">
          <span className="text-white font-semibold">Total</span>
          <span className="text-white font-bold">{formatAmount(order.amountCents, order.currency)}</span>
        </div>

        <div className="mt-8">
          <Link href="/wallet" className="block w-full py-3 text-center rounded-xl bg-primary text-white font-semibold">
            View in Wallet
          </Link>
        </div>
      </main>
    </div>
  );
}
