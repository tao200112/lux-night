/**
 * Orders Page
 * 历史订单：该商家的全部售票记录
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Order {
  id: string;
  amountCents: number;
  amountFormatted: string;
  status: string;
  createdAt: string;
  inviteCode: string | null;
  tickets: number;
}

export default function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const limit = 20;

  useEffect(() => {
    loadOrders();
  }, [page]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/orders?page=${page}&limit=${limit}`);
      if (!res.ok) throw new Error('Failed to load orders');
      const json = await res.json();
      if (json.ok) {
        setOrders(json.data?.orders || []);
        setTotal(json.data?.total || 0);
      }
    } catch (err: any) {
      setError(err.message);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="relative w-full max-w-[430px] lg:max-w-2xl mx-auto min-h-screen bg-background-light dark:bg-background-dark pb-24">
      <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
            <span className="material-symbols-outlined">arrow_back</span>
            <span className="text-sm font-semibold">Back</span>
          </Link>
          <h1 className="text-base font-bold">Orders</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="p-4">
        {error ? (
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={() => loadOrders()}
              className="px-4 py-2 bg-primary text-white rounded-lg"
            >
              Retry
            </button>
          </div>
        ) : loading && orders.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-card-light dark:bg-card-dark rounded-xl p-8 border border-gray-100 dark:border-gray-800 text-center">
            <span className="material-symbols-outlined text-gray-400 text-4xl mb-2">receipt_long</span>
            <p className="text-gray-500 dark:text-gray-400">No orders yet</p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-gray-500">
              {total} total orders
            </div>
            <div className="space-y-2">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="bg-card-light dark:bg-card-dark rounded-xl p-4 border border-gray-100 dark:border-gray-800"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-mono text-xs text-gray-500">#{o.id.slice(0, 8)}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {new Date(o.createdAt).toLocaleString()} · {o.tickets} ticket{o.tickets !== 1 ? 's' : ''}
                      </p>
                      {o.inviteCode && (
                        <p className="text-xs text-purple-500 mt-1">Code: {o.inviteCode}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900 dark:text-white">{o.amountFormatted}</p>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        o.status === 'paid' || o.status === 'fulfilled' || o.status === 'completed'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}>
                        {o.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="px-4 py-2 text-sm text-gray-500">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
