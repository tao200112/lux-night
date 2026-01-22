/**
 * Admin Orders Page
 * Orders 列表页面（完全按照 uiadmin/order_and_payment_records/code.html 重写）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminBottomNav from '@/components/admin/AdminBottomNav';
import ErrorState from '@/components/admin/ErrorState';
import EmptyState from '@/components/admin/EmptyState';
import { SkeletonList } from '@/components/admin/Skeleton';

interface Order {
  id: string;
  status: string;
  amount: number;
  amountFormatted: string;
  userId?: string;
  customerName?: string;
  customerEmail?: string | null;
  paymentIntentId?: string | null;
  createdAt: string;
  // Legacy fields (may not exist in new API response)
  currency?: string;
  user?: {
    id: string;
    name: string;
    avatar: string | null;
  } | null;
  event?: {
    id: string;
    title: string;
  } | null;
  merchantId?: string | null;
  eventCount?: number;
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('7');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedMerchant, setSelectedMerchant] = useState('');
  
  useEffect(() => {
    fetchOrders();
  }, [searchQuery, dateRange, selectedStatus, selectedMerchant]);
  
  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (searchQuery) params.set('query', searchQuery);
      if (dateRange) params.set('dateRange', dateRange);
      if (selectedStatus) params.set('status', selectedStatus);
      if (selectedMerchant) params.set('merchant', selectedMerchant);
      
      const response = await fetch(`/api/admin/orders?${params.toString()}`);
      const result = await response.json();
      
      if (!result.ok && !result.success) {
        throw new Error(result.message || 'Failed to fetch orders');
      }
      
      setOrders(result.data?.orders || []);
    } catch (err: any) {
      console.error('[ADMIN ORDERS] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
      'paid': {
        bg: 'bg-status-success-bg',
        text: 'text-status-success-text',
        darkBg: 'dark:bg-status-success-bg-dark',
        darkText: 'dark:text-status-success-text-dark',
      },
      'fulfilled': {
        bg: 'bg-status-success-bg',
        text: 'text-status-success-text',
        darkBg: 'dark:bg-status-success-bg-dark',
        darkText: 'dark:text-status-success-text-dark',
      },
      'pending_payment': {
        bg: 'bg-status-warning-bg',
        text: 'text-status-warning-text',
        darkBg: 'dark:bg-status-warning-bg-dark',
        darkText: 'dark:text-status-warning-text-dark',
      },
      'created': {
        bg: 'bg-status-warning-bg',
        text: 'text-status-warning-text',
        darkBg: 'dark:bg-status-warning-bg-dark',
        darkText: 'dark:text-status-warning-text-dark',
      },
      'refunded': {
        bg: 'bg-status-error-bg',
        text: 'text-status-error-text',
        darkBg: 'dark:bg-status-error-bg-dark',
        darkText: 'dark:text-status-error-text-dark',
      },
      'expired': {
        bg: 'bg-status-error-bg',
        text: 'text-status-error-text',
        darkBg: 'dark:bg-status-error-bg-dark',
        darkText: 'dark:text-status-error-text-dark',
      },
    };
    
    const config = statusConfig[status] || {
      bg: 'bg-gray-100',
      text: 'text-gray-600',
      darkBg: 'dark:bg-gray-800',
      darkText: 'dark:text-gray-400',
    };
    
    const statusLabels: Record<string, string> = {
      'paid': 'Paid',
      'fulfilled': 'Fulfilled',
      'pending_payment': 'Pending',
      'created': 'Created',
      'refunded': 'Refunded',
      'expired': 'Expired',
      'canceled': 'Canceled',
    };
    
    return (
      <span className={`inline-flex items-center rounded-sm ${config.bg} ${config.darkBg} px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${config.text} ${config.darkText}`}>
        {statusLabels[status] || status}
      </span>
    );
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };
  
  const formatOrderId = (id: string) => {
    return `ORD-${id.slice(0, 5).toUpperCase()}`;
  };
  
  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-hidden max-w-md mx-auto shadow-2xl bg-background-light dark:bg-background-dark">
      {/* Header - 完全按照 UI 文档 */}
      <header className="flex-none bg-primary text-white pt-safe-top pb-2 sticky top-0 z-20 shadow-md">
        <div className="pt-12 px-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            >
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </button>
            <h1 className="text-lg font-semibold tracking-tight">Orders & Payments</h1>
          </div>
          <button className="flex size-10 items-center justify-center rounded-full hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined text-[24px]">download</span>
          </button>
        </div>
        
        {/* Search Bar Embedded in Header area - 完全按照 UI 文档 */}
        <div className="px-4 pb-3 pt-1">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <span className="material-symbols-outlined text-gray-400 group-focus-within:text-primary transition-colors text-[20px]">search</span>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, Customer, or Event..."
              className="block w-full p-2.5 pl-10 text-sm text-gray-900 bg-white dark:bg-surface-dark dark:text-white rounded-sm border-none ring-1 ring-white/20 focus:ring-2 focus:ring-blue-400 placeholder-gray-500 dark:placeholder-gray-400 transition-all shadow-sm"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 cursor-pointer">
              <span className="material-symbols-outlined text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-[20px]">qr_code_scanner</span>
            </div>
          </div>
        </div>
      </header>
      
      {/* Filter Bar (Sticky) - 完全按照 UI 文档 */}
      <div className="flex-none bg-white dark:bg-background-dark border-b border-border-light dark:border-border-dark sticky top-[calc(48px+80px)] z-10">
        <div className="flex gap-2 p-3 overflow-x-auto no-scrollbar items-center">
          <button
            onClick={() => {
              const ranges = ['7', '30', '90', '365'];
              const currentIndex = ranges.indexOf(dateRange);
              setDateRange(ranges[(currentIndex + 1) % ranges.length]);
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-sm border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3 py-1.5 active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] text-gray-500 dark:text-gray-400">calendar_today</span>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Last {dateRange} Days</span>
            <span className="material-symbols-outlined text-[16px] text-gray-400">arrow_drop_down</span>
          </button>
          
          <button
            onClick={() => {
              const statuses = ['', 'paid', 'pending', 'refunded'];
              const currentIndex = statuses.indexOf(selectedStatus);
              setSelectedStatus(statuses[(currentIndex + 1) % statuses.length]);
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-sm border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3 py-1.5 active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
          >
            <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
              Status: {selectedStatus ? selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1) : 'All'}
            </span>
            <span className="material-symbols-outlined text-[16px] text-gray-400">arrow_drop_down</span>
          </button>
          
          <button
            onClick={() => setSelectedMerchant('')}
            className="flex shrink-0 items-center gap-1.5 rounded-sm border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3 py-1.5 active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
          >
            <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Merchant: All</span>
            <span className="material-symbols-outlined text-[16px] text-gray-400">arrow_drop_down</span>
          </button>
          
          <button className="flex shrink-0 items-center justify-center rounded-sm border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark w-8 h-8 active:bg-gray-50 dark:active:bg-gray-800 transition-colors ml-auto">
            <span className="material-symbols-outlined text-[18px] text-gray-500">filter_list</span>
          </button>
        </div>
      </div>
      
      {/* Main Content List - 完全按照 UI 文档 */}
      <main className="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark p-2 space-y-2 pb-24">
        {/* Loading State */}
        {loading && <SkeletonList count={5} />}
        
        {/* Error State */}
        {error && !loading && (
          <ErrorState message={error} onRetry={fetchOrders} />
        )}
        
        {/* Empty State */}
        {!loading && !error && orders.length === 0 && (
          <EmptyState
            icon="receipt_long"
            title="No Orders Found"
            description={searchQuery ? 'Try a different search term.' : 'No orders found with the current filters.'}
          />
        )}
        
        {/* Orders List */}
        {!loading && !error && orders.length > 0 && orders.map((order) => (
          <div
            key={order.id}
            className="group relative flex flex-col gap-2 rounded-sm border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-3 active:scale-[0.99] transition-transform"
          >
            {/* Header */}
            <div className="flex justify-between items-start">
              <div className="flex flex-col">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                  {order.customerName || order.user?.name || 'Unknown User'}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded-[2px]">
                    {formatOrderId(order.id)}
                  </span>
                  {order.customerEmail && (
                    <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[140px]">
                      {order.customerEmail}
                    </span>
                  )}
                  {!order.customerEmail && order.event?.title && (
                    <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[140px]">
                      {order.event.title}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {order.amountFormatted}
                </span>
                <div className="mt-1 flex gap-1">
                  {getStatusBadge(order.status)}
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="flex justify-between items-end border-t border-border-light dark:border-border-dark pt-2 mt-1">
              <div className="flex flex-col">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  {order.merchantId || 'Multiple Merchants'}
                </span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  {formatDate(order.createdAt)}
                </span>
              </div>
              <button className="text-gray-400 hover:text-primary dark:hover:text-blue-400">
                <span className="material-symbols-outlined text-[18px]">more_horiz</span>
              </button>
            </div>
          </div>
        ))}
      </main>
      
      {/* Bottom Navigation - 使用统一组件 */}
      <AdminBottomNav pendingCount={0} />
    </div>
  );
}
