/**
 * Admin Settings - Invites Management Page
 * 管理员设置 - 邀请码管理页面
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminTopBar from '@/components/admin/AdminTopBar';
import AdminBottomNav from '@/components/admin/AdminBottomNav';

interface Invite {
  id: string;
  token: string;
  formattedToken: string;
  intendedRole: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  status: 'active' | 'used' | 'expired' | 'revoked';
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
    email: string | null;
    avatar: string | null;
  } | null;
  usedBy: {
    id: string;
    name: string;
    email: string | null;
    avatar: string | null;
  } | null;
  usedAt: string | null;
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

export default function AdminInvitesPage() {
  const router = useRouter();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'used' | 'expired' | 'revoked'>('all');
  const [regionFilter, setRegionFilter] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
  
  // Detail modal
  const [selectedInvite, setSelectedInvite] = useState<Invite | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Revoke loading
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    fetchInvites();
  }, [statusFilter, regionFilter, roleFilter, searchQuery, page]);

  const fetchInvites = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (regionFilter) {
        params.append('region_id', regionFilter);
      }
      if (roleFilter) {
        params.append('role', roleFilter);
      }
      if (searchQuery) {
        params.append('q', searchQuery);
      }
      
      const res = await fetch(`/api/admin/invites?${params.toString()}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: `HTTP ${res.status}` };
        }
        throw new Error(errorData.message || errorData.error?.message || 'Failed to load invites');
      }
      
      const data = await res.json();
      
      if (!data.success || !data.data) {
        throw new Error(data.error?.message || 'Failed to load invites');
      }
      
      setInvites(data.data.items || []);
      setTotal(data.data.total || 0);
      setTotalPages(data.data.totalPages || 1);
      
      // Extract unique regions from invites
      const uniqueRegions = new Map<string, Region>();
      (data.data.items || []).forEach((invite: Invite) => {
        if (invite.region && !uniqueRegions.has(invite.region.id)) {
          uniqueRegions.set(invite.region.id, invite.region);
        }
      });
      
      if (uniqueRegions.size > 0) {
        setRegions(Array.from(uniqueRegions.values()));
      }
      
      // Also try to load all regions from settings API
      if (regions.length === 0) {
        try {
          const settingsRes = await fetch('/api/admin/settings');
          if (settingsRes.ok) {
            const settingsData = await settingsRes.json();
            if (settingsData.success && settingsData.data?.regions) {
              setRegions(settingsData.data.regions);
            }
          }
        } catch (err) {
          // Ignore error
        }
      }
    } catch (err: any) {
      console.error('[InvitesPage] Error:', err);
      setError(err.message || 'Failed to load invites');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    if (!confirm('Are you sure you want to revoke this invite?')) {
      return;
    }
    
    try {
      setRevokingId(inviteId);
      
      const res = await fetch(`/api/admin/invites/${inviteId}/revoke`, {
        method: 'POST',
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: `HTTP ${res.status}` };
        }
        throw new Error(errorData.message || errorData.error?.message || 'Failed to revoke invite');
      }
      
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to revoke invite');
      }
      
      // Refresh list
      await fetchInvites();
      
      // Close detail modal if open
      if (selectedInvite?.id === inviteId) {
        setShowDetailModal(false);
        setSelectedInvite(null);
      }
      
      alert('Invite revoked successfully');
    } catch (err: any) {
      console.error('[InvitesPage] Revoke error:', err);
      alert(err.message || 'Failed to revoke invite');
    } finally {
      setRevokingId(null);
    }
  };

  const handleViewDetail = async (inviteId: string) => {
    try {
      const res = await fetch(`/api/admin/invites/${inviteId}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: `HTTP ${res.status}` };
        }
        throw new Error(errorData.message || errorData.error?.message || 'Failed to load invite details');
      }
      
      const data = await res.json();
      
      if (!data.success || !data.data) {
        throw new Error(data.error?.message || 'Failed to load invite details');
      }
      
      setSelectedInvite(data.data);
      setShowDetailModal(true);
    } catch (err: any) {
      console.error('[InvitesPage] Load detail error:', err);
      alert(err.message || 'Failed to load invite details');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy');
    });
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      active: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
      used: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
      expired: 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200',
      revoked: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200',
    };
    
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${badges[status as keyof typeof badges] || badges.active}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const generateInviteLink = (token: string) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${appUrl}/invite/${token}`;
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      <AdminTopBar title="Merchant Invites" showBack />
      
      <main className="flex-1 overflow-y-auto px-4 py-6 pb-32">
        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Search
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by code or merchant name..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-10 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="used">Used</option>
                <option value="expired">Expired</option>
                <option value="revoked">Revoked</option>
              </select>
            </div>
            
            {/* Region Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Region
              </label>
              <select
                value={regionFilter}
                onChange={(e) => {
                  setRegionFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">All Regions</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Role Filter */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Role
            </label>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Roles</option>
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </select>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3 text-slate-500 dark:text-slate-400">Loading invites...</span>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="p-4 bg-alert-red/10 border border-alert-red rounded-lg">
            <p className="text-alert-red">{error}</p>
            <button
              onClick={fetchInvites}
              className="mt-2 px-4 py-2 bg-alert-red text-white rounded-lg text-sm hover:bg-alert-red/90"
            >
              Retry
            </button>
          </div>
        )}

        {/* Invites Table */}
        {!loading && !error && (
          <>
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        Merchant / Region
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        Used
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        Expires
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {invites.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                          No invites found
                        </td>
                      </tr>
                    ) : (
                      invites.map((invite) => (
                        <tr key={invite.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <code className="text-sm font-mono text-slate-900 dark:text-white">
                                {invite.formattedToken}
                              </code>
                              <button
                                onClick={() => copyToClipboard(invite.token)}
                                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded"
                                title="Copy code"
                              >
                                <span className="material-symbols-outlined text-sm text-slate-500 dark:text-slate-400">
                                  content_copy
                                </span>
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm">
                              {invite.merchant ? (
                                <div className="text-slate-900 dark:text-white font-medium">
                                  {invite.merchant.name}
                                </div>
                              ) : (
                                <div className="text-slate-500 dark:text-slate-400 italic">
                                  Create New Merchant
                                </div>
                              )}
                              {invite.region && (
                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                  {invite.region.name}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-slate-900 dark:text-white capitalize">
                              {invite.intendedRole}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {getStatusBadge(invite.status)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-slate-900 dark:text-white">
                              {invite.usedCount} / {invite.maxUses}
                            </div>
                            {invite.usedBy && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {invite.usedBy.email || invite.usedBy.name}
                              </div>
                            )}
                            {invite.usedAt && (
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {formatDate(invite.usedAt)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-slate-900 dark:text-white">
                              {formatDate(invite.expiresAt)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleViewDetail(invite.id)}
                                className="px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded"
                              >
                                View
                              </button>
                              {invite.status === 'active' && (
                                <button
                                  onClick={() => handleRevoke(invite.id)}
                                  disabled={revokingId === invite.id}
                                  className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
                                >
                                  {revokingId === invite.id ? 'Revoking...' : 'Revoke'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} invites
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Detail Modal */}
      {showDetailModal && selectedInvite && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowDetailModal(false);
              setSelectedInvite(null);
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Invite Details</h2>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedInvite(null);
                  }}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  <span className="material-symbols-outlined text-slate-500 dark:text-slate-400">close</span>
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Code */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Invite Code
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-2xl font-mono text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-700 p-3 rounded-lg">
                      {selectedInvite.formattedToken}
                    </code>
                    <button
                      onClick={() => copyToClipboard(selectedInvite.token)}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
                    >
                      Copy Code
                    </button>
                  </div>
                </div>

                {/* Invite Link */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Invite Link
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generateInviteLink(selectedInvite.token)}
                      className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => copyToClipboard(generateInviteLink(selectedInvite.token))}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
                    >
                      Copy Link
                    </button>
                  </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Status
                    </label>
                    {getStatusBadge(selectedInvite.status)}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Role
                    </label>
                    <span className="text-sm text-slate-900 dark:text-white capitalize">
                      {selectedInvite.intendedRole}
                    </span>
                  </div>
                  
                  {selectedInvite.merchant && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Merchant
                      </label>
                      <span className="text-sm text-slate-900 dark:text-white">
                        {selectedInvite.merchant.name}
                      </span>
                    </div>
                  )}
                  
                  {selectedInvite.region && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Region
                      </label>
                      <span className="text-sm text-slate-900 dark:text-white">
                        {selectedInvite.region.name}
                        {selectedInvite.region.state && `, ${selectedInvite.region.state}`}
                      </span>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Created At
                    </label>
                    <span className="text-sm text-slate-900 dark:text-white">
                      {formatDate(selectedInvite.createdAt)}
                    </span>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Expires At
                    </label>
                    <span className="text-sm text-slate-900 dark:text-white">
                      {formatDate(selectedInvite.expiresAt)}
                    </span>
                  </div>
                  
                  {selectedInvite.usedBy && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Used By
                        </label>
                        <span className="text-sm text-slate-900 dark:text-white">
                          {selectedInvite.usedBy.email || selectedInvite.usedBy.name}
                        </span>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Used At
                        </label>
                        <span className="text-sm text-slate-900 dark:text-white">
                          {formatDate(selectedInvite.usedAt)}
                        </span>
                      </div>
                    </>
                  )}
                  
                  {selectedInvite.createdBy && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Created By
                      </label>
                      <span className="text-sm text-slate-900 dark:text-white">
                        {selectedInvite.createdBy.email || selectedInvite.createdBy.name}
                      </span>
                    </div>
                  )}
                </div>

                {/* Usage */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Usage
                  </label>
                  <div className="text-sm text-slate-900 dark:text-white">
                    {selectedInvite.usedCount} / {selectedInvite.maxUses} uses
                  </div>
                </div>

                {/* Actions */}
                {selectedInvite.status === 'active' && (
                  <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <button
                      onClick={() => {
                        handleRevoke(selectedInvite.id);
                      }}
                      disabled={revokingId === selectedInvite.id}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      {revokingId === selectedInvite.id ? 'Revoking...' : 'Revoke Invite'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <AdminBottomNav />
    </div>
  );
}
