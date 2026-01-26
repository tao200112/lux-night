'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getOrderList, type OrderListItem } from '@/lib/data/orders';
import OrderCard from '@/components/OrderCard';
import EmptyState from '@/components/EmptyState';

export default function OrdersPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=' + encodeURIComponent('/orders'));
      return;
    }
    if (!user) return;
    let cancelled = false;
    getOrderList(user.id)
      .then((d) => {
        if (!cancelled) setOrders(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load orders');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, authLoading, router]);

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
        <p className="text-white/70 mb-4">Sign in to view your orders.</p>
        <Link href="/login" className="px-6 py-3 rounded-xl bg-primary text-white font-semibold">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col bg-background-dark text-white pb-8">
      <header className="sticky top-0 z-10 px-6 py-4 bg-background-dark/95 border-b border-white/5 flex items-center gap-4">
        <Link href="/profile" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/5">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </Link>
        <h1 className="text-xl font-bold tracking-tight">My Orders</h1>
      </header>

      <main className="flex-1 px-6 py-4">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="py-8 text-center">
            <p className="text-red-400/90 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-white/10 text-white font-medium"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <EmptyState
            icon="receipt_long"
            title="No orders yet"
            description="Your purchase history will appear here."
            actionLabel="Explore Events"
            actionHref="/"
          />
        )}

        {!loading && !error && orders.length > 0 && (
          <div className="space-y-3">
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
