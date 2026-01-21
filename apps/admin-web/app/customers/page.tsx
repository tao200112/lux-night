/**
 * Admin Customers Page
 * Customers 列表页面（完全按照 uiadmin/customer_directory/code.html 重写）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminBottomNav from '@/components/admin/AdminBottomNav';
import ErrorState from '@/components/admin/ErrorState';
import EmptyState from '@/components/admin/EmptyState';
import { SkeletonList } from '@/components/admin/Skeleton';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  stats: {
    ordersCount: number;
    lifetimeSpend: number;
    lifetimeSpendFormatted: string;
    lastActive: string;
  };
  isActive: boolean;
  isHighSpender: boolean;
  createdAt: string;
}

export default function AdminCustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'high_spenders' | 'recent' | 'banned'>('all');
  
  useEffect(() => {
    fetchCustomers();
  }, [searchQuery, activeFilter]);
  
  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (searchQuery) params.set('query', searchQuery);
      if (activeFilter !== 'all') params.set('filter', activeFilter);
      
      const response = await fetch(`/api/admin/customers?${params.toString()}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch customers');
      }
      
      setCustomers(result.data.customers || []);
    } catch (err: any) {
      console.error('[ADMIN CUSTOMERS] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'min' : 'mins'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hr' : 'hrs'} ago`;
    if (diffDays < 30) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} ${months === 1 ? 'mo' : 'mos'} ago`;
    }
    return `${Math.floor(diffDays / 365)} ${Math.floor(diffDays / 365) === 1 ? 'yr' : 'yrs'} ago`;
  };
  
  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };
  
  return (
    <div className="bg-background-light dark:bg-background-dark text-primary dark:text-gray-100 font-display transition-colors duration-200 pb-20 min-h-screen">
      {/* Header Section - 完全按照 UI 文档 */}
      <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm border-b border-border-light dark:border-border-dark">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-primary dark:text-white text-xl font-bold tracking-tight">Customers</h1>
          <button className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-primary dark:text-white">
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>
        
        {/* Search Bar - 完全按照 UI 文档 */}
        <div className="px-4 pb-3">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <span className="material-symbols-outlined text-gray-400 dark:text-gray-500 text-[20px]">search</span>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by email, ID or name..."
              className="block w-full p-2.5 pl-10 text-sm text-gray-900 bg-white dark:bg-surface-dark border border-gray-200 dark:border-border-dark rounded-lg focus:ring-1 focus:ring-accent focus:border-accent dark:text-white dark:placeholder-gray-400 dark:focus:ring-accent dark:focus:border-accent shadow-sm"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
              <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                <span className="material-symbols-outlined text-[20px]">tune</span>
              </button>
            </div>
          </div>
        </div>
        
        {/* Filter Chips - 完全按照 UI 文档 */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveFilter('all')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border shadow-sm transition-colors ${
              activeFilter === 'all'
                ? 'bg-primary text-white border-transparent'
                : 'bg-white dark:bg-surface-dark text-gray-700 dark:text-gray-200 border-gray-200 dark:border-border-dark hover:border-gray-300'
            }`}
          >
            <span>All Customers</span>
          </button>
          
          <button
            onClick={() => setActiveFilter('active')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border shadow-sm transition-colors ${
              activeFilter === 'active'
                ? 'bg-primary text-white border-transparent'
                : 'bg-white dark:bg-surface-dark text-gray-700 dark:text-gray-200 border-gray-200 dark:border-border-dark hover:border-gray-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            <span>Active</span>
          </button>
          
          <button
            onClick={() => setActiveFilter('high_spenders')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border shadow-sm transition-colors ${
              activeFilter === 'high_spenders'
                ? 'bg-primary text-white border-transparent'
                : 'bg-white dark:bg-surface-dark text-gray-700 dark:text-gray-200 border-gray-200 dark:border-border-dark hover:border-gray-300'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">monetization_on</span>
            <span>High Spenders</span>
          </button>
          
          <button
            onClick={() => setActiveFilter('recent')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border shadow-sm transition-colors ${
              activeFilter === 'recent'
                ? 'bg-primary text-white border-transparent'
                : 'bg-white dark:bg-surface-dark text-gray-700 dark:text-gray-200 border-gray-200 dark:border-border-dark hover:border-gray-300'
            }`}
          >
            <span>Recent Activity</span>
          </button>
          
          <button
            onClick={() => setActiveFilter('banned')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border shadow-sm transition-colors ${
              activeFilter === 'banned'
                ? 'bg-primary text-white border-transparent'
                : 'bg-white dark:bg-surface-dark text-gray-700 dark:text-gray-200 border-gray-200 dark:border-border-dark hover:border-gray-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            <span>Banned</span>
          </button>
        </div>
        
        {/* List Header Labels (Pseudo-Table) - 完全按照 UI 文档 */}
        <div className="grid grid-cols-12 px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-y border-gray-100 dark:border-border-dark text-xxs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <div className="col-span-12 mb-1">Customer</div>
          <div className="col-span-3">Orders</div>
          <div className="col-span-5">Lifetime Spend</div>
          <div className="col-span-4 text-right">Last Active</div>
        </div>
      </header>
      
      {/* Main List Content - 完全按照 UI 文档 */}
      <main className="flex flex-col w-full divide-y divide-gray-100 dark:divide-border-dark bg-surface-light dark:bg-background-dark">
        {/* Loading State */}
        {loading && <SkeletonList count={5} />}
        
        {/* Error State */}
        {error && !loading && (
          <ErrorState message={error} onRetry={fetchCustomers} />
        )}
        
        {/* Empty State */}
        {!loading && !error && customers.length === 0 && (
          <EmptyState
            icon="people"
            title="No Customers Found"
            description={searchQuery ? 'Try a different search term.' : 'No customers found with the current filters.'}
          />
        )}
        
        {/* Customers List */}
        {!loading && !error && customers.length > 0 && customers.map((customer) => (
          <div
            key={customer.id}
            className={`group relative flex flex-col p-4 transition-colors ${
              customer.isActive
                ? 'hover:bg-gray-50 dark:hover:bg-surface-dark/50 active:bg-gray-100 dark:active:bg-surface-dark'
                : 'bg-gray-50/50 dark:bg-background-dark hover:bg-gray-50 dark:hover:bg-surface-dark/50'
            } ${customer.isHighSpender ? 'border-l-4 border-l-accent dark:border-l-accent' : ''}`}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                {customer.avatar ? (
                  <div className="relative w-8 h-8">
                    <img
                      alt={`Portrait of ${customer.name}`}
                      className="w-full h-full rounded-lg object-cover border border-gray-100 dark:border-gray-600"
                      src={customer.avatar}
                    />
                    {customer.isActive && (
                      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white dark:border-surface-dark rounded-full"></div>
                    )}
                  </div>
                ) : (
                  <div className={`relative w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold border ${
                    customer.isHighSpender
                      ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                      : 'bg-primary/10 dark:bg-primary/30 text-primary dark:text-blue-300 border-primary/10 dark:border-primary/20'
                  }`}>
                    {getInitials(customer.name)}
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-primary dark:text-white leading-none">
                    {customer.name}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                    {customer.email || customer.id.slice(0, 8) + '...'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 items-start">
                {customer.isHighSpender && (
                  <span className="material-symbols-outlined text-amber-500 text-[18px]" title="VIP">star</span>
                )}
                {!customer.isActive && (
                  <div className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xxs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Inactive</div>
                )}
                {customer.isActive && (
                  <button className="text-gray-400 hover:text-primary dark:hover:text-white">
                    <span className="material-symbols-outlined text-[20px]">more_vert</span>
                  </button>
                )}
              </div>
            </div>
            
            {/* Stats Grid - 完全按照 UI 文档 */}
            <div className={`grid grid-cols-12 items-baseline ${
              !customer.isActive ? 'opacity-60' : ''
            }`}>
              <div className="col-span-3 flex items-center gap-1">
                <span className={`text-sm font-medium tabular-nums ${
                  customer.isActive
                    ? 'text-gray-900 dark:text-gray-200'
                    : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {customer.stats.ordersCount}
                </span>
              </div>
              <div className="col-span-5 flex items-center gap-1">
                <span className={`text-sm font-bold tabular-nums ${
                  customer.isHighSpender
                    ? 'text-green-600 dark:text-green-400'
                    : customer.isActive
                    ? 'text-gray-900 dark:text-gray-200'
                    : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {customer.stats.lifetimeSpendFormatted}
                </span>
              </div>
              <div className="col-span-4 text-right">
                <span className={`text-xs font-medium ${
                  customer.isActive
                    ? 'text-gray-500 dark:text-gray-400'
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {formatTimeAgo(customer.stats.lastActive)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </main>
      
      {/* Bottom Navigation - 使用统一组件 */}
      <AdminBottomNav pendingCount={0} />
    </div>
  );
}
