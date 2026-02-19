/**
 * Admin Invite Manager Page
 * Invite Code Management 页面（完全按照 uiadmin/invite_code_management/code.html 重写）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageContainer from '@/components/admin/PageContainer';
import ErrorState from '@/components/admin/ErrorState';
import EmptyState from '@/components/admin/EmptyState';
import { SkeletonList } from '@/components/admin/Skeleton';

interface Invite {
  id: string;
  token: string;
  formattedToken: string;
  intendedRole: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  disabled: boolean;
  isActive: boolean;
  isUsed: boolean;
  isRevoked: boolean;
  status: 'active' | 'used' | 'revoked' | 'expired';
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
    avatar: string | null;
  } | null;
  region: {
    id: string;
    name: string;
    state: string | null;
    country: string | null;
  } | null;
  merchant: {
    id: string;
    name: string;
  } | null;
  note: string | null;
}

interface Region {
  id: string;
  name: string;
  state: string | null;
  country: string | null;
}

export default function AdminInviteManagerPage() {
  const router = useRouter();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [formType, setFormType] = useState('VIP Access');
  const [formRegion, setFormRegion] = useState('');
  const [formExpires, setFormExpires] = useState('');
  
  // Success modal
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<{
    token: string;
    formattedToken: string;
    inviteLink: string;
    regionName: string | null;
  } | null>(null);
  
  useEffect(() => {
    fetchInvites();
    fetchRegions();
  }, []);
  
  const fetchInvites = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/admin/invites?status=active');
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch invites');
      }
      
      setInvites(result.data.invites || []);
    } catch (err: any) {
      console.error('[ADMIN INVITES] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchRegions = async () => {
    try {
      // 从 invites API 获取 regions
      const response = await fetch('/api/admin/invites');
      const result = await response.json();
      
      if (result.success && result.data.regions) {
        setRegions(result.data.regions || []);
      }
    } catch (err) {
      console.error('[ADMIN INVITES] Error fetching regions:', err);
    }
  };
  
  const handleCreateInvite = async () => {
    if (!formRegion) {
      alert('Please select a region');
      return;
    }
    
    try {
      setCreating(true);
      
      const expiresDays = formExpires ? Math.ceil((new Date(formExpires).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
      
      const response = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formType,
          region: formRegion,
          expiresAt: formExpires || null,
          expiresDays: expiresDays || null,
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to create invite');
      }
      
      // 显示成功弹窗
      setCreatedInvite({
        token: result.data.token || '',
        formattedToken: result.data.formattedToken || result.data.token || '',
        inviteLink: result.data.inviteLink || '',
        regionName: result.data.regionName || null,
      });
      setShowSuccessModal(true);
      
      // 刷新列表
      await fetchInvites();
      setFormType('VIP Access');
      setFormRegion('');
      setFormExpires('');
    } catch (err: any) {
      console.error('[ADMIN INVITES CREATE] Error:', err);
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };
  
  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(token);
    // 可以添加 toast 提示
  };
  
  const handleRevoke = async (token: string) => {
    if (!confirm('Are you sure you want to revoke this invite code?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/admin/invites/${token}/revoke`, {
        method: 'POST',
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to revoke invite');
      }
      
      // 刷新列表
      await fetchInvites();
    } catch (err: any) {
      console.error('[ADMIN INVITES REVOKE] Error:', err);
      alert(err.message);
    }
  };
  
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };
  
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return formatDate(dateString);
  };
  
  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };
  
  const activeCount = invites.filter((invite) => invite.isActive).length;
  
  return (
    <PageContainer className="overflow-hidden bg-background-light dark:bg-background-dark">
      {/* Header - 完全按照 UI 文档 */}
      <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-surface-light/95 dark:bg-background-dark/95 backdrop-blur-sm px-4">
        <h1 className="text-xl font-bold tracking-tight text-primary dark:text-white">Invite Manager</h1>
        <button className="group flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-primary dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white transition-colors">
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>filter_list</span>
        </button>
      </header>
      
      {/* Main Content Area: Scrollable - 完全按照 UI 文档 */}
      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4 no-scrollbar">
        {/* Generation Form Section - 完全按照 UI 文档 */}
        <section className="mb-8">
          <div className="rounded-lg border border-gray-200 bg-surface-light p-5 shadow-sm dark:border-gray-700 dark:bg-surface-dark">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Create New Invite
              </h2>
              <span className="material-symbols-outlined text-gray-400 dark:text-gray-500" style={{ fontSize: 20 }}>
                add_circle
              </span>
            </div>
            
            <div className="flex flex-col gap-4">
              {/* Top Row Inputs - 完全按照 UI 文档 */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Type</label>
                  <div className="relative">
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                      className="w-full appearance-none rounded border border-gray-300 bg-gray-50 dark:bg-gray-800 dark:border-gray-600 px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    >
                      <option>VIP Access</option>
                      <option>General</option>
                      <option>Staff</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>expand_more</span>
                    </div>
                  </div>
                </div>
                
                <div className="w-1/3">
                  <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Region</label>
                  <div className="relative">
                    <select
                      value={formRegion}
                      onChange={(e) => setFormRegion(e.target.value)}
                      className="w-full appearance-none rounded border border-gray-300 bg-gray-50 dark:bg-gray-800 dark:border-gray-600 px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    >
                      <option value="">Select</option>
                      {regions.map((region) => (
                        <option key={region.id} value={region.id}>
                          {region.name}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>expand_more</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Date Input - 完全按照 UI 文档 */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Expiration</label>
                <div className="relative">
                  <input
                    type="date"
                    value={formExpires}
                    onChange={(e) => setFormExpires(e.target.value)}
                    className="w-full rounded border border-gray-300 bg-gray-50 dark:bg-gray-800 dark:border-gray-600 px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all placeholder-gray-400"
                  />
                </div>
              </div>
              
              {/* Generate Action - 完全按照 UI 文档 */}
              <button
                onClick={handleCreateInvite}
                disabled={creating || !formRegion}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-primary py-3 text-sm font-bold text-white shadow hover:bg-opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>bolt</span>
                Generate Code
              </button>
            </div>
          </div>
        </section>
        
        {/* List Section - 完全按照 UI 文档 */}
        <section>
          <div className="mb-4 flex items-end justify-between px-1">
            <h3 className="text-lg font-bold text-primary dark:text-white">Recent Codes</h3>
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary dark:bg-primary/30 dark:text-blue-200">
              {activeCount} Active
            </span>
          </div>
          
          {/* Loading State */}
          {loading && <SkeletonList count={3} />}
          
          {/* Error State */}
          {error && !loading && (
            <ErrorState message={error} onRetry={fetchInvites} />
          )}
          
          {/* Empty State */}
          {!loading && !error && invites.length === 0 && (
            <EmptyState
              icon="confirmation_number"
              title="No Invites Found"
              description="No active invite codes found. Create one above."
            />
          )}
          
          {/* Invites List - 完全按照 UI 文档 */}
          {!loading && !error && invites.length > 0 && (
            <div className="flex flex-col gap-3">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className={`group relative overflow-hidden rounded-lg border shadow-sm transition-all ${
                    invite.isActive
                      ? 'border-gray-200 bg-surface-light dark:bg-surface-dark dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                      : invite.isUsed
                      ? 'border-gray-200 bg-surface-light dark:bg-surface-dark dark:border-gray-700 opacity-80'
                      : 'border-gray-200 bg-red-50/30 dark:bg-red-900/10 dark:border-gray-700'
                  }`}
                >
                  {/* Status Indicator Bar */}
                  <div className={`absolute left-0 top-0 h-full w-1 ${
                    invite.isActive
                      ? 'bg-emerald-500'
                      : invite.isUsed
                      ? 'bg-gray-400 dark:bg-gray-600'
                      : 'bg-red-500'
                  }`}></div>
                  
                  <div className="p-4 pl-5">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-lg font-bold tracking-tight ${
                            invite.isActive
                              ? 'text-gray-900 dark:text-white'
                              : invite.isUsed
                              ? 'text-gray-500 line-through decoration-gray-400 dark:text-gray-400'
                              : 'text-red-900/60 dark:text-red-200/60'
                          }`}>
                            {invite.formattedToken || invite.token}
                          </span>
                          {invite.isActive && (
                            <button
                              onClick={() => handleCopy(invite.token)}
                              className="text-gray-400 hover:text-primary dark:hover:text-blue-300 transition-colors"
                              title="Copy"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>content_copy</span>
                            </button>
                          )}
                        </div>
                        
                        {/* Status Badge - 完全按照 UI 文档 */}
                        <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          invite.isActive
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : invite.isUsed
                            ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                        }`}>
                          {invite.status === 'active' ? 'Active' : invite.status === 'used' ? 'Redeemed' : invite.status === 'revoked' ? 'Revoked' : 'Expired'}
                        </span>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        {invite.isActive && (
                          <button
                            onClick={() => handleRevoke(invite.token)}
                            className="flex h-8 w-8 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                            title="Revoke"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>block</span>
                          </button>
                        )}
                        {invite.isUsed && (
                          <div className="text-xs text-gray-400">
                            used {formatTimeAgo(invite.createdAt)}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Metadata - 完全按照 UI 文档 */}
                    <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-700/50">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-gray-400">Region</span>
                        <span className={`text-xs font-medium ${
                          invite.isActive
                            ? 'text-gray-700 dark:text-gray-300'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {invite.region?.name || 'N/A'}
                        </span>
                      </div>
                      
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-gray-400">Expires</span>
                        <span className={`text-xs font-medium ${
                          invite.isActive
                            ? 'text-gray-700 dark:text-gray-300'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {formatDate(invite.expiresAt)}
                        </span>
                      </div>
                      
                      <div className="flex flex-col text-right">
                        <span className="text-[10px] uppercase text-gray-400">Created By</span>
                        <div className="flex items-center gap-1.5 justify-end">
                          {invite.createdBy?.avatar ? (
                            <div className="h-4 w-4 rounded-full bg-gradient-to-tr from-blue-400 to-indigo-500 overflow-hidden">
                              <img src={invite.createdBy.avatar} alt={invite.createdBy.name} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="h-4 w-4 rounded-full bg-gradient-to-tr from-blue-400 to-indigo-500 flex items-center justify-center text-[8px] font-bold text-white">
                              {invite.createdBy ? getInitials(invite.createdBy.name) : '??'}
                            </div>
                          )}
                          <span className={`text-xs font-medium ${
                            invite.isActive
                              ? 'text-gray-700 dark:text-gray-300'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {invite.createdBy?.name || 'Unknown'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      
      {/* Success Modal */}
      {showSuccessModal && createdInvite && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowSuccessModal(false);
              setCreatedInvite(null);
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl max-w-md w-full">
              <div className="p-6">
                <div className="flex items-center justify-center mb-4">
                  <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-4xl">
                      check_circle
                    </span>
                  </div>
                </div>
                
                <h2 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-2">
                  Invite Created Successfully!
                </h2>
                
                <div className="space-y-4 mt-6">
                  {/* Code */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Invite Code
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xl font-mono text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-700 p-3 rounded-lg text-center">
                        {createdInvite.formattedToken}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(createdInvite.token);
                          alert('Copied to clipboard!');
                        }}
                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
                        title="Copy code"
                      >
                        <span className="material-symbols-outlined">content_copy</span>
                      </button>
                    </div>
                  </div>

                  {/* Link */}
                  {createdInvite.inviteLink && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Invite Link
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={createdInvite.inviteLink}
                          className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2 text-sm"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(createdInvite.inviteLink);
                            alert('Copied to clipboard!');
                          }}
                          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
                          title="Copy link"
                        >
                          <span className="material-symbols-outlined">content_copy</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Region */}
                  {createdInvite.regionName && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Region
                      </label>
                      <span className="text-sm text-slate-900 dark:text-white">
                        {createdInvite.regionName}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => {
                      setShowSuccessModal(false);
                      setCreatedInvite(null);
                    }}
                    className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      setShowSuccessModal(false);
                      setCreatedInvite(null);
                      router.push('/settings/invites');
                    }}
                    className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
                  >
                    View in Invites
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </PageContainer>
  );
}
