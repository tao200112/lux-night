/**
 * Admin Customer Detail Page
 * Customer Detail 页面
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AdminTopBar from '@/components/admin/AdminTopBar';
import StatusBadge from '@/components/admin/StatusBadge';
import ErrorState from '@/components/admin/ErrorState';
import { Skeleton } from '@/components/admin/Skeleton';
import ListItemCard from '@/components/admin/ListItemCard';

interface CustomerDetail {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  phone: string | null;
  region: string | null;
  stats: {
    totalOrders: number;
    totalSpent: number;
    totalSpentFormatted: string;
    ticketsCount: number;
  };
  orders: Array<{
    id: string;
    total: number;
    status: string;
    event: {
      id: string;
      title: string;
      startAt: string;
    } | null;
    createdAt: string;
  }>;
  tickets: Array<{
    id: string;
    status: string;
    event: {
      id: string;
      title: string;
      startAt: string;
    } | null;
    ticketType: {
      id: string;
      name: string;
      category: string;
    } | null;
    createdAt: string;
  }>;
  createdAt: string;
}

export default function AdminCustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const customerId = params.customerId as string;
  
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    fetchCustomerDetail();
  }, [customerId]);
  
  const fetchCustomerDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/admin/customers/${customerId}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch customer detail');
      }
      
      setCustomer(result.data);
    } catch (err: any) {
      console.error('[ADMIN CUSTOMER DETAIL] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark">
        <AdminTopBar title="Customer Detail" showBack />
        <main className="px-4 py-6">
          <Skeleton className="h-32 w-full mb-4" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }
  
  if (error || !customer) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark">
        <AdminTopBar title="Customer Detail" showBack />
        <main className="px-4 py-6">
          <ErrorState message={error || 'Customer not found'} onRetry={fetchCustomerDetail} />
        </main>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      <AdminTopBar title={customer.name} showBack />
      
      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-6 pb-32">
        {/* Customer Info */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-white text-xl font-bold">
              {customer.avatar ? (
                <img src={customer.avatar} alt={customer.name} className="h-full w-full rounded-full object-cover" />
              ) : (
                customer.name.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{customer.name}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{customer.email || 'No email'}</p>
              {customer.phone && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{customer.phone}</p>
              )}
            </div>
          </div>
        </section>
        
        {/* Stats Section */}
        <section className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Total Spent
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {customer.stats.totalSpentFormatted}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Total Orders
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {customer.stats.totalOrders}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Tickets
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {customer.stats.ticketsCount}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Member Since
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {new Date(customer.createdAt).getFullYear()}
            </p>
          </div>
        </section>
        
        {/* Order History */}
        <section>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
            Order History ({customer.orders.length})
          </h3>
          {customer.orders.length > 0 ? (
            <div className="space-y-2">
              {customer.orders.map((order) => (
                <ListItemCard
                  key={order.id}
                  href={`/orders/${order.id}`}
                  title={`Order #${order.id.slice(0, 8).toUpperCase()}`}
                  subtitle={order.event?.title || 'No event'}
                  status={order.status as any}
                  metadata={[
                    { label: 'Total', value: `$${order.total.toFixed(2)}` },
                    { label: 'Date', value: new Date(order.createdAt).toLocaleDateString() },
                  ]}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="receipt_long"
              title="No Orders"
              description="This customer has no orders yet."
            />
          )}
        </section>
        
        {/* Ticket History */}
        <section>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
            Tickets ({customer.tickets.length})
          </h3>
          {customer.tickets.length > 0 ? (
            <div className="space-y-2">
              {customer.tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {ticket.event?.title || 'Unknown Event'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {ticket.ticketType?.name || 'Unknown Type'}
                      </p>
                    </div>
                    <StatusBadge status={ticket.status as any} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="confirmation_number"
              title="No Tickets"
              description="This customer has no tickets yet."
            />
          )}
        </section>
      </main>
    </div>
  );
}
