'use client';

import React from 'react';
import Link from 'next/link';
import type { OrderListItem } from '@/lib/data/orders';
import { toDisplayStatus } from '@/lib/data/orders';

interface OrderCardProps {
  order: OrderListItem;
}

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (currency || 'usd').toUpperCase(),
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function OrderCard({ order }: OrderCardProps) {
  const status = toDisplayStatus(order.status);
  const statusCls =
    status === 'Paid'
      ? 'text-emerald-400'
      : status === 'Refunded'
        ? 'text-amber-500'
        : 'text-white/60';

  return (
    <Link
      href={`/orders/${order.id}`}
      className="block p-4 rounded-2xl bg-[#1E2224] border border-white/5 hover:border-white/10 transition-colors"
    >
      <div className="flex justify-between items-start gap-2 mb-1">
        <h3 className="text-white font-semibold truncate">{order.eventName}</h3>
        <span className={`text-xs font-medium shrink-0 ${statusCls}`}>{status}</span>
      </div>
      <p className="text-white/50 text-sm mb-1">{order.venueName}</p>
      <p className="text-white/40 text-xs mb-2">{formatDate(order.createdAt)} · {formatTime(order.startAt)}</p>
      <div className="flex justify-between items-center text-xs">
        <span className="text-white/50">{order.ticketCount} ticket{order.ticketCount !== 1 ? 's' : ''}</span>
        <span className="text-white font-medium">{formatAmount(order.amountCents, order.currency)}</span>
      </div>
    </Link>
  );
}
