/**
 * Admin Merchant Detail Page
 * Merchant Detail 页面
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AdminTopBar from '@/components/admin/AdminTopBar';
import StatusBadge from '@/components/admin/StatusBadge';
import AdminButton from '@/components/admin/AdminButton';
import EmptyState from '@/components/admin/EmptyState';
import ErrorState from '@/components/admin/ErrorState';
import { Skeleton } from '@/components/admin/Skeleton';
import ListItemCard from '@/components/admin/ListItemCard';

interface MerchantDetail {
  id: string;
  name: string;
  status: string;
  region: {
    id: string;
    name: string;
    state: string;
    country: string;
    status: string;
  } | null;
  venues: Array<{ id: string; name: string; address: string | null; isActive: boolean }>;
  events: Array<{ id: string; title: string; status: string; startAt: string; endAt: string }>;
  members: Array<{
    id: string;
    role: string;
    isActive: boolean;
    user: { id: string; name: string; email: string; avatar: string | null } | null;
    joinedAt: string;
  }>;
  recentOrders: Array<{ id: string; total: number; status: string; createdAt: string }>;
  stats: {
    totalOrders: number;
    totalRevenue: number;
    totalRevenueFormatted: string;
    venuesCount: number;
    eventsCount: number;
    membersCount: number;
  };
  inviteStats?: {
    totalOrders: number;
    totalRevenue: number;
    topInvites: Array<{ code: string; ambassadorName: string; revenue: number; orders: number }>;
    topAmbassadors: Array<{ name: string; revenue: number; orders: number }>;
  };
  createdAt: string;
  updatedAt: string;
}

export default function AdminMerchantDetailPage() {
  const router = useRouter();
  const params = useParams();
  const merchantId = params.merchantId as string;
  
  const [merchant, setMerchant] = useState<MerchantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [statusReason, setStatusReason] = useState('');
  useEffect(() => {
    fetchMerchantDetail();
  }, [merchantId]);
  
  const fetchMerchantDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/admin/merchants/${merchantId}`);
      const result = await response.json();
      
      // Fixed: Support both legacy 'success' and new 'ok' properties
      if (!result.success && !result.ok) {
        throw new Error(result.message || result.error || 'Failed to fetch merchant detail');
      }
      
      setMerchant(result.data);
    } catch (err: any) {
      console.error('[ADMIN MERCHANT DETAIL] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleStatusChange = async () => {
    if (!newStatus || !statusReason.trim()) {
      alert('Please select a status and provide a reason');
      return;
    }
    
    try {
      setUpdating(true);
      
      const response = await fetch(`/api/admin/merchants/${merchantId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, reason: statusReason }),
      });
      
      const result = await response.json();
      
      if (!result.success && !result.ok) {
        throw new Error(result.message || 'Failed to update merchant status');
      }
      
      // 刷新数据
      await fetchMerchantDetail();
      setShowStatusModal(false);
      setNewStatus('');
      setStatusReason('');
    } catch (err: any) {
      console.error('[ADMIN MERCHANT STATUS] Error:', err);
      alert(err.message);
    } finally {
      setUpdating(false);
    }
  };
  
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark">
        <AdminTopBar title="Merchant Detail" showBack />
        <main className="px-4 py-6">
          <Skeleton className="h-32 w-full mb-4" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }
  
  if (error || !merchant) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark">
        <AdminTopBar title="Merchant Detail" showBack />
        <main className="px-4 py-6">
          <ErrorState message={error || 'Merchant not found'} onRetry={fetchMerchantDetail} />
        </main>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      <AdminTopBar title={merchant.name} showBack />
      
      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-6 pb-32">
        {/* Status Section */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Status</h3>
            <StatusBadge status={merchant.status as any} />
          </div>
          <AdminButton
            variant="outline"
            fullWidth
            onClick={() => {
              setNewStatus(merchant.status === 'active' ? 'suspended' : 'active');
              setShowStatusModal(true);
            }}
          >
            Change Status
          </AdminButton>
        </section>
        
        {/* Stats Section */}
        <section className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Total Revenue (30d)
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {merchant.stats.totalRevenueFormatted}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Orders (30d)
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {merchant.stats.totalOrders.toLocaleString()}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Venues
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {merchant.stats.venuesCount}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Members
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {merchant.stats.membersCount}
            </p>
          </div>
        </section>

        {/* Invite Stats Section */}
        {merchant.inviteStats && (
            <section className="space-y-3">
                 <div className="flex items-center justify-between p-1">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Invite Performance (Ambassadors)</h3>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-3">
                    <div className="bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-100 dark:border-purple-900/30 p-4 shadow-sm">
                        <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">
                          Invite Revenue
                        </p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">
                          ${merchant.inviteStats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div className="bg-pink-50 dark:bg-pink-900/10 rounded-lg border border-pink-100 dark:border-pink-900/30 p-4 shadow-sm">
                         <p className="text-xs font-medium text-pink-600 dark:text-pink-400 uppercase tracking-wide mb-1">
                          Invite Orders
                        </p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">
                          {merchant.inviteStats.totalOrders}
                        </p>
                    </div>
                 </div>

                 {/* Top Invites List */}
                 {merchant.inviteStats.topInvites.length > 0 && (
                     <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                           <h4 className="text-xs font-bold text-slate-500 uppercase">Top Invites</h4>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                           {merchant.inviteStats.topInvites.map((inv, idx) => (
                               <div key={idx} className="flex items-center justify-between px-4 py-3">
                                   <div>
                                       <div className="text-sm font-mono font-bold text-slate-800 dark:text-slate-200">{inv.code}</div>
                                       <div className="text-xs text-slate-500">{inv.ambassadorName}</div>
                                   </div>
                                    <div className="text-right">
                                       <div className="text-sm font-medium text-slate-900 dark:text-white">${inv.revenue.toFixed(2)}</div>
                                       <div className="text-xs text-slate-500">{inv.orders} orders</div>
                                   </div>
                               </div>
                           ))}
                        </div>
                     </div>
                 )}
            </section>
        )}
        
        {/* Region Info */}
        {merchant.region && (
          <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Region</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {merchant.region.name}
              {merchant.region.state && `, ${merchant.region.state}`}
              {merchant.region.country && `, ${merchant.region.country}`}
            </p>
            <StatusBadge status={merchant.region.status as any} size="sm" className="mt-2" />
          </section>
        )}
        
        {/* Events */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Events ({(merchant.events || []).length})
            </h3>
              <button
                onClick={() => router.push(`/events/new?merchant_id=${merchantId}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Create Event
              </button>
          </div>
          {merchant.events && merchant.events.length > 0 ? (
            <div className="space-y-2">
              {merchant.events.map((event) => (
                <ListItemCard
                  key={event.id}
                  href={`/events/${event.id}/week`}
                  title={event.title}
                  subtitle={new Date(event.startAt || 0).toLocaleDateString()}
                  status={event.status as any}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="event"
              title="No Events"
              description="This merchant has no events yet."
            />
          )}
        </section>
        
        {/* Recent Orders */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Orders</h3>
            <button className="text-xs font-semibold text-accent hover:text-blue-700 transition-colors">
              View All
            </button>
          </div>
          {merchant.recentOrders.length > 0 ? (
            <div className="space-y-2">
              {merchant.recentOrders.slice(0, 5).map((order) => (
                <div
                  key={order.id}
                  className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        Order #{order.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        ${order.total.toFixed(2)}
                      </p>
                      <StatusBadge status={order.status as any} size="sm" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="receipt_long"
              title="No Orders"
              description="No recent orders found."
            />
          )}
        </section>
        
        {/* Venues */}
        <section>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Venues ({merchant.venues.length})</h3>
          {merchant.venues.length > 0 ? (
            <div className="space-y-2">
              {merchant.venues.map((venue) => (
                <div
                  key={venue.id}
                  className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{venue.name}</p>
                      {venue.address && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{venue.address}</p>
                      )}
                    </div>
                    <StatusBadge status={venue.isActive ? 'active' : 'closed'} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="storefront"
              title="No Venues"
              description="This merchant has no venues yet."
            />
          )}
        </section>
        
        {/* Members */}
        <section>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Members ({merchant.members.length})</h3>
          {merchant.members.length > 0 ? (
            <div className="space-y-2">
              {merchant.members.map((member) => (
                <div
                  key={member.id}
                  className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
                        {member.user?.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {member.user?.name || 'Unknown'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {member.user?.email || 'No email'}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={member.role as any} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="people"
              title="No Members"
              description="This merchant has no members yet."
            />
          )}
        </section>
      </main>
      
      {/* Status Change Modal */}
      {showStatusModal && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              if (!updating) {
                setShowStatusModal(false);
                setNewStatus('');
                setStatusReason('');
              }
            }}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-[480px] mx-auto bg-white dark:bg-slate-800 rounded-t-xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              Change Merchant Status
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                New Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Reason (Required)
              </label>
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Enter reason for status change..."
                className="w-full h-32 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex gap-3">
              <AdminButton
                variant="outline"
                fullWidth
                onClick={() => {
                  setShowStatusModal(false);
                  setNewStatus('');
                  setStatusReason('');
                }}
                disabled={updating}
              >
                Cancel
              </AdminButton>
              <AdminButton
                variant="primary"
                fullWidth
                onClick={handleStatusChange}
                loading={updating}
                disabled={!newStatus || !statusReason.trim()}
              >
                Update Status
              </AdminButton>
            </div>
          </div>
        </>
      )}
      
    </div>
  );
}
