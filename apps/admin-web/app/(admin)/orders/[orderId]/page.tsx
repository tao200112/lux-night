/**
 * Admin Order Detail Page
 * Order Detail 页面
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AdminTopBar from '@/components/admin/AdminTopBar';
import PageContainer from '@/components/admin/PageContainer';
import StatusBadge from '@/components/admin/StatusBadge';
import ErrorState from '@/components/admin/ErrorState';
import { Skeleton } from '@/components/admin/Skeleton';

interface OrderDetail {
  id: string;
  total: number;
  totalFormatted: string;
  status: string;
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    avatar: string | null;
  } | null;
  event: {
    id: string;
    title: string;
    startAt: string;
    endAt: string;
  } | null;
  venue: {
    id: string;
    name: string;
    address: string | null;
  } | null;
  merchant: {
    id: string;
    name: string;
  } | null;
  items: Array<{
    id: string;
    quantity: number;
    price: number;
    ticketType: {
      id: string;
      name: string;
      category: string;
    } | null;
  }>;
  tickets: Array<{
    id: string;
    qrSeed: string;
    status: string;
    ticketType: {
      id: string;
      name: string;
    } | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

export default function AdminOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.orderId as string;
  
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    fetchOrderDetail();
  }, [orderId]);
  
  const fetchOrderDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/admin/orders/${orderId}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch order detail');
      }
      
      setOrder(result.data);
    } catch (err: any) {
      console.error('[ADMIN ORDER DETAIL] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <PageContainer className="bg-background-light dark:bg-background-dark">
        <AdminTopBar title="Order Detail" showBack />
        <main className="px-4 py-6">
          <Skeleton className="h-32 w-full mb-4" />
          <Skeleton className="h-64 w-full" />
        </main>
      </PageContainer>
    );
  }
  
  if (error || !order) {
    return (
      <PageContainer className="bg-background-light dark:bg-background-dark">
        <AdminTopBar title="Order Detail" showBack />
        <main className="px-4 py-6">
          <ErrorState message={error || 'Order not found'} onRetry={fetchOrderDetail} />
        </main>
      </PageContainer>
    );
  }
  
  return (
    <PageContainer className="bg-background-light dark:bg-background-dark">
      <AdminTopBar
        title={`Order #${order.id.slice(0, 8).toUpperCase()}`}
        showBack
      />
      
      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-6 pb-32">
        {/* Status & Total */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Order Status</h3>
            <StatusBadge status={order.status as any} />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {order.totalFormatted}
          </div>
        </section>
        
        {/* Customer Info */}
        {order.customer && (
          <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Customer</h3>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold">
                {order.customer.avatar ? (
                  <img src={order.customer.avatar} alt={order.customer.name} className="h-full w-full rounded-full object-cover" />
                ) : (
                  order.customer.name.charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {order.customer.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {order.customer.email}
                </p>
              </div>
            </div>
          </section>
        )}
        
        {/* Event Info */}
        {order.event && (
          <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Event</h3>
            <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
              {order.event.title}
            </p>
            {order.venue && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                {order.venue.name}
              </p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {new Date(order.event.startAt).toLocaleString('en-US', { timeZone: 'America/New_York' })}
            </p>
          </section>
        )}
        
        {/* Order Items */}
        <section>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Items ({order.items.length})</h3>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {item.ticketType?.name || 'Unknown'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Quantity: {item.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    ${(item.price * item.quantity).toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
        
        {/* Tickets */}
        <section>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
            Tickets ({order.tickets.length})
          </h3>
          <div className="space-y-2">
            {order.tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      Ticket #{ticket.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {ticket.ticketType?.name || 'Unknown'}
                    </p>
                  </div>
                  <StatusBadge status={ticket.status as any} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </PageContainer>
  );
}
