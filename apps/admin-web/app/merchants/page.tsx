/**
 * Admin Merchants Page
 * Merchants 列表页面（完全按照 uiadmin/merchant_management_list/code.html 重写）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminBottomNav from '@/components/admin/AdminBottomNav';
import ErrorState from '@/components/admin/ErrorState';
import EmptyState from '@/components/admin/EmptyState';
import { SkeletonList } from '@/components/admin/Skeleton';

interface Merchant {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'closed';
  region: {
    id: string;
    name: string;
    state: string | null;
    country: string | null;
  } | null;
  stats: {
    totalRevenue: number;
    revenueFormatted: string;
    activeEvents: number;
  };
  createdAt: string;
}

interface Region {
  id: string;
  name: string;
  state: string | null;
  country: string | null;
}

export default function AdminMerchantsPage() {
  const router = useRouter();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [showCreateInviteModal, setShowCreateInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    merchantId: '',
    regionId: '',
    role: 'owner' as 'owner' | 'manager',
    expiresDays: 30,
  });
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState<Merchant | null>(null);
  const [editForm, setEditForm] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  
  useEffect(() => {
    fetchMerchants();
  }, [searchQuery, selectedRegion, selectedStatus]);
  
  const fetchMerchants = async () => {
    // Create AbortController for 10s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (searchQuery) params.set('query', searchQuery);
      if (selectedRegion) params.set('region', selectedRegion);
      if (selectedStatus) params.set('status', selectedStatus);
      
      const response = await fetch(`/api/admin/merchants?${params.toString()}`, {
        signal: controller.signal,
        cache: 'no-store', // Prevent Next.js caching issues
      });

      clearTimeout(timeoutId);
      
      // Handle 401 Unauthorized
      if (response.status === 401) {
        setError('Unauthorized. Please log in again.');
        return;
      }

      // Handle other HTTP errors
      if (!response.ok) {
        const result = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
        throw new Error(result.message || result.error || `Server error (${response.status})`);
      }

      const result = await response.json();
      
      if (!result.ok && !result.success) {
        throw new Error(result.message || 'Failed to fetch merchants');
      }
      
      setMerchants(result.data?.merchants || []);
      setRegions(result.data?.regions || []);
    } catch (err: any) {
      console.error('[ADMIN MERCHANTS] Error:', err);
      
      // Handle abort/timeout
      if (err.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError(err.message || 'Failed to load merchants');
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false); // CRITICAL: Always stop loading
    }
  };
  
  const getRegionDisplay = (region: Merchant['region']): string => {
    if (!region) return 'Unknown';
    const parts = [region.name];
    if (region.state) parts.push(`(${region.state})`);
    return parts.join(' ');
  };
  
  const getStatusBadge = (status: string) => {
    const isActive = status === 'active';
    return (
      <div className={`inline-flex items-center px-2 py-0.5 rounded-full border ${
        isActive
          ? 'bg-success-bg dark:bg-green-900/30 border-success-text/10 dark:border-green-500/20'
          : 'bg-danger-bg dark:bg-red-900/30 border-danger-text/10 dark:border-red-500/20'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
          isActive
            ? 'bg-success-text dark:bg-green-400'
            : 'bg-danger-text dark:bg-red-400'
        }`}></span>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${
          isActive
            ? 'text-success-text dark:text-green-400'
            : 'text-danger-text dark:text-red-400'
        }`}>
          {status === 'active' ? 'Active' : status === 'suspended' ? 'Suspended' : 'Closed'}
        </span>
      </div>
    );
  };
  
  const handleRegionFilter = () => {
    // 简化：切换筛选
    if (selectedRegion) {
      setSelectedRegion('');
    } else {
      // 可以选择第一个 region 作为示例
      if (regions.length > 0) {
        setSelectedRegion(regions[0].id);
      }
    }
  };
  
  const handleStatusFilter = () => {
    const statuses = ['', 'active', 'suspended', 'closed'];
    const currentIndex = statuses.indexOf(selectedStatus);
    setSelectedStatus(statuses[(currentIndex + 1) % statuses.length]);
  };
  
  const formatCurrency = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };
  
  const handleCreateMerchantInvite = () => {
    setShowCreateInviteModal(true);
  };
  
  const handleEditMerchant = (merchant: Merchant) => {
    setEditingMerchant(merchant);
    setEditForm({ name: merchant.name });
  };
  
  const handleSaveEdit = async () => {
    if (!editingMerchant) return;
    
    const trimmedName = editForm.name.trim();
    if (!trimmedName) {
      alert('Merchant name cannot be empty');
      return;
    }
    
    try {
      setSaving(true);
      
      const response = await fetch(`/api/admin/merchants/${editingMerchant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });
      
      const result = await response.json().catch(() => null);
      
      if (!response.ok || !result?.ok) {
        const errorMsg = result?.message || result?.error || `HTTP ${response.status}`;
        throw new Error(errorMsg);
      }
      
      // 乐观更新本地列表
      setMerchants(prev => prev.map(m => 
        m.id === editingMerchant.id 
          ? { ...m, name: trimmedName }
          : m
      ));
      
      setEditingMerchant(null);
      setEditForm({ name: '' });
    } catch (err: any) {
      console.error('[ADMIN MERCHANTS] Edit error:', err);
      alert(err.message || 'Failed to update merchant name');
    } finally {
      setSaving(false);
    }
  };
  
  const handleSubmitInvite = async () => {
    if (!inviteForm.merchantId && !inviteForm.regionId) {
      alert('Please select either a merchant or a region');
      return;
    }
    
    try {
      setCreatingInvite(true);
      
      const response = await fetch('/api/admin/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: inviteForm.merchantId || null,
          regionId: inviteForm.regionId || null,
          role: inviteForm.role,
          expiresDays: inviteForm.expiresDays,
        }),
      });
      
      // Parse JSON with error handling
      const result = await response.json().catch(() => null);
      
      // Check HTTP status first
      if (!response.ok) {
        const errorMsg = result?.message || result?.error || `HTTP ${response.status}`;
        console.error('[ADMIN MERCHANTS] HTTP Error:', { status: response.status, result });
        throw new Error(errorMsg);
      }
      
      // Check response shape (support both 'ok' and 'success')
      if (result?.ok !== true && result?.success !== true) {
        const errorMsg = result?.message || result?.error || 'Invalid response format';
        console.error('[ADMIN MERCHANTS] Bad response shape:', result);
        throw new Error(errorMsg);
      }
      
      const inviteCode = result.data?.code || result.data?.token;
      alert(`Merchant invite code created: ${inviteCode}`);
      setShowCreateInviteModal(false);
      setInviteForm({ merchantId: '', regionId: '', role: 'owner', expiresDays: 30 });
      fetchMerchants(); // Refresh list
    } catch (err: any) {
      console.error('[ADMIN MERCHANTS] Create invite error:', err);
      alert(err.message);
    } finally {
      setCreatingInvite(false);
    }
  };
  
  return (
    <div className="relative flex min-h-screen w-full flex-col mx-auto max-w-[480px] lg:max-w-none bg-background-light dark:bg-background-dark border-x border-slate-200 dark:border-slate-800 lg:border-x-0 shadow-2xl lg:shadow-none">
      {/* Global Header - 完全按照 UI 文档 */}
      <header className="sticky top-0 z-40 w-full bg-surface-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-border-light dark:border-border-dark transition-colors duration-200">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="text-primary dark:text-white text-lg font-bold tracking-tight">Merchants</h1>
          <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      // TODO: 实现导出功能
                      alert('Export functionality coming soon');
                    }}
                    className="flex items-center justify-center text-primary dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg w-9 h-9 transition-colors"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 24 }}>download</span>
                  </button>
                  <button 
                    onClick={handleCreateMerchantInvite}
                    className="flex items-center justify-center text-primary-action hover:bg-primary-action/10 rounded-lg w-9 h-9 transition-colors"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 26 }}>add</span>
                  </button>
          </div>
        </div>
      </header>
      
      {/* Search & Filter Section - 完全按照 UI 文档 */}
      <section className="sticky top-14 z-30 bg-background-light dark:bg-background-dark pt-3 pb-1 transition-colors duration-200 shadow-sm">
        <div className="px-4 mb-3">
          <div className="relative flex items-center w-full h-10 rounded-lg bg-[#f3f4f6] dark:bg-surface-dark border border-transparent focus-within:border-primary-action/50 focus-within:bg-white dark:focus-within:bg-surface-dark transition-all overflow-hidden">
            <div className="flex items-center justify-center pl-3 pr-2 text-gray-500 dark:text-gray-400">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>search</span>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID or name..."
              className="w-full bg-transparent border-none text-sm text-primary dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-0 h-full p-0"
            />
          </div>
        </div>
        
        {/* Filter Chips - 完全按照 UI 文档 */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar items-center">
          <button
            onClick={handleRegionFilter}
            className={`flex shrink-0 items-center gap-1.5 h-8 px-3 rounded-lg border shadow-sm active:bg-gray-50 dark:active:bg-white/5 transition-colors ${
              selectedRegion
                ? 'bg-primary-action/10 border-primary-action/20'
                : 'bg-white dark:bg-surface-dark border-border-light dark:border-border-dark'
            }`}
          >
            <span className={`text-xs font-medium ${
              selectedRegion
                ? 'text-primary-action dark:text-blue-400'
                : 'text-primary dark:text-gray-200'
            }`}>
              Region: {selectedRegion ? regions.find(r => r.id === selectedRegion)?.name || 'All' : 'All'}
            </span>
            <span className={`material-symbols-outlined ${
              selectedRegion ? 'text-primary-action dark:text-blue-400' : 'text-gray-500'
            }`} style={{ fontSize: 16 }}>
              {selectedRegion ? 'close' : 'arrow_drop_down'}
            </span>
          </button>
          
          <button
            onClick={handleStatusFilter}
            className={`flex shrink-0 items-center gap-1.5 h-8 px-3 rounded-lg border shadow-sm transition-colors ${
              selectedStatus
                ? 'bg-primary-action/10 border-primary-action/20'
                : 'bg-white dark:bg-surface-dark border-border-light dark:border-border-dark active:bg-gray-50 dark:active:bg-white/5'
            }`}
          >
            <span className={`text-xs font-medium ${
              selectedStatus
                ? 'text-primary-action dark:text-blue-400'
                : 'text-primary dark:text-gray-200'
            }`}>
              Status: {selectedStatus ? selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1) : 'All'}
            </span>
            <span className={`material-symbols-outlined ${
              selectedStatus ? 'text-primary-action dark:text-blue-400' : 'text-gray-500'
            }`} style={{ fontSize: 16 }}>
              {selectedStatus ? 'close' : 'arrow_drop_down'}
            </span>
          </button>
          
          <button className="flex shrink-0 items-center gap-1.5 h-8 px-3 rounded-lg bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark shadow-sm active:bg-gray-50 dark:active:bg-white/5 transition-colors">
            <span className="text-xs font-medium text-primary dark:text-gray-200">Sort: Rev High-Low</span>
            <span className="material-symbols-outlined text-gray-500" style={{ fontSize: 16 }}>arrow_drop_down</span>
          </button>
          
          <button className="flex shrink-0 items-center justify-center w-8 h-8 rounded-lg bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark shadow-sm active:bg-gray-50 dark:active:bg-white/5 transition-colors">
            <span className="material-symbols-outlined text-gray-500" style={{ fontSize: 18 }}>tune</span>
          </button>
        </div>
      </section>
      
      {/* Merchant List - 完全按照 UI 文档 */}
      <main className="px-4 space-y-3 pt-2 pb-24">
        {/* Loading State */}
        {loading && <SkeletonList count={5} />}
        
        {/* Error State */}
        {error && !loading && (
          <ErrorState message={error} onRetry={fetchMerchants} />
        )}
        
        {/* Empty State */}
        {!loading && !error && merchants.length === 0 && (
          <EmptyState
            icon="storefront"
            title="No Merchants Found"
            description={searchQuery ? 'Try a different search term.' : 'No merchants found with the current filters.'}
          />
        )}
        
        {/* Merchants List */}
        {!loading && !error && merchants.length > 0 && merchants.map((merchant) => (
          <article
            key={merchant.id}
            className="group relative bg-surface-light dark:bg-surface-dark rounded-lg p-3 border border-border-light dark:border-border-dark shadow-sm hover:border-primary-action/30 transition-all duration-200"
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-2">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center shrink-0 text-primary dark:text-gray-300">
                  <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>
                    storefront
                  </span>
                </div>
                <div>
                  <Link href={`/merchants/${merchant.id}`}>
                    <h3 className="text-base font-semibold text-primary dark:text-white leading-tight hover:underline">
                      {merchant.name}
                    </h3>
                  </Link>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {getRegionDisplay(merchant.region)}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {getStatusBadge(merchant.status)}
              </div>
            </div>
            
            {/* Metrics Grid - 完全按照 UI 文档 */}
            <div className="grid grid-cols-2 gap-px bg-gray-100 dark:bg-border-dark rounded-lg overflow-hidden border border-gray-100 dark:border-border-dark mt-3">
              <div className="bg-white dark:bg-surface-dark/50 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-medium mb-0.5">
                  Total Revenue
                </p>
                <p className="text-sm font-semibold text-primary dark:text-white tabular-nums">
                  {merchant.stats.revenueFormatted}
                </p>
              </div>
              <div className="bg-white dark:bg-surface-dark/50 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-medium mb-0.5">
                  Active Events
                </p>
                <p className={`text-sm font-semibold tabular-nums ${
                  merchant.stats.activeEvents > 0
                    ? 'text-primary dark:text-white'
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {merchant.stats.activeEvents}
                </p>
              </div>
            </div>
            
            {/* Edit Button */}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleEditMerchant(merchant);
              }}
              className="absolute top-2 right-2 p-1 text-gray-400 hover:text-primary dark:hover:text-white rounded transition-colors"
              title="Edit merchant name"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>edit</span>
            </button>
          </article>
        ))}
        
        {/* Loading Indicator (if needed) */}
        {loading && merchants.length > 0 && (
          <div className="flex items-center justify-center py-6 text-gray-400 dark:text-gray-500">
            <span className="material-symbols-outlined animate-spin mr-2" style={{ fontSize: 20 }}>progress_activity</span>
            <span className="text-sm">Loading more merchants...</span>
          </div>
        )}
      </main>
      
      {/* Bottom Navigation - 使用统一组件 */}
      <AdminBottomNav pendingCount={0} />
      
      {/* Create Merchant Invite Modal */}
      {showCreateInviteModal && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateInviteModal(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark rounded-t-2xl shadow-2xl max-w-[480px] mx-auto p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-primary dark:text-white">Create Merchant Invite</h2>
              <button
                onClick={() => setShowCreateInviteModal(false)}
                className="text-gray-400 hover:text-primary dark:hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Merchant (Optional - leave empty to create new merchant)
                </label>
                <select
                  value={inviteForm.merchantId}
                  onChange={(e) => setInviteForm({ ...inviteForm, merchantId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="">Select Merchant (Optional)</option>
                  {merchants.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Region {!inviteForm.merchantId && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={inviteForm.regionId}
                  onChange={(e) => setInviteForm({ ...inviteForm, regionId: e.target.value })}
                  required={!inviteForm.merchantId}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="">Select Region</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role
                </label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as 'owner' | 'manager' })}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="owner">Owner</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Expires (Days)
                </label>
                <input
                  type="number"
                  value={inviteForm.expiresDays}
                  onChange={(e) => setInviteForm({ ...inviteForm, expiresDays: parseInt(e.target.value) || 30 })}
                  min="1"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowCreateInviteModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitInvite}
                  disabled={creatingInvite || (!inviteForm.merchantId && !inviteForm.regionId)}
                  className="flex-1 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {creatingInvite ? 'Creating...' : 'Create Invite'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      
      {/* Edit Merchant Modal */}
      {editingMerchant && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setEditingMerchant(null);
              setEditForm({ name: '' });
            }}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark rounded-t-2xl shadow-2xl max-w-[480px] mx-auto p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-primary dark:text-white">Edit Merchant</h2>
              <button
                onClick={() => {
                  setEditingMerchant(null);
                  setEditForm({ name: '' });
                }}
                className="text-gray-400 hover:text-primary dark:hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Merchant Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ name: e.target.value })}
                  placeholder="Enter merchant name"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-primary dark:text-white"
                  autoFocus
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setEditingMerchant(null);
                    setEditForm({ name: '' });
                  }}
                  disabled={saving}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving || !editForm.name.trim()}
                  className="flex-1 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
