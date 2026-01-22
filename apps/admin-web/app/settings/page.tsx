/**
 * Admin Settings Page
 * System Settings 页面（完全按照 uiadmin/system_settings/code.html 重写）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminBottomNav from '@/components/admin/AdminBottomNav';
import ErrorState from '@/components/admin/ErrorState';
import EmptyState from '@/components/admin/EmptyState';
import { Skeleton } from '@/components/admin/Skeleton';

interface Region {
  id: string;
  name: string;
  state: string | null;
  country: string | null;
  status: string; // 'operational', 'maintenance', etc.
  isActive: boolean;
}

interface AdminUser {
  id: string;
  displayName: string;
  email: string | null;
  avatar: string | null;
  role: string;
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'general' | 'invites'>('general');
  const [regions, setRegions] = useState<Region[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [force2FA, setForce2FA] = useState(true);
  const [apiWriteAccess, setApiWriteAccess] = useState(false);
  const [systemStatus, setSystemStatus] = useState<'active' | 'maintenance'>('active');
  const [lastAudit, setLastAudit] = useState<string | null>(null);
  
  useEffect(() => {
    fetchSettings();
  }, []);
  
  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/admin/settings');
      
      // Parse JSON with error handling
      const result = await response.json().catch(() => null);
      
      // Check HTTP status first
      if (!response.ok) {
        const errorMsg = result?.message || result?.error || `HTTP ${response.status}`;
        console.error('[ADMIN SETTINGS] HTTP Error:', { status: response.status, result });
        throw new Error(errorMsg);
      }
      
      // Check response shape (support both 'ok' and 'success')
      if (result?.ok !== true && result?.success !== true) {
        const errorMsg = result?.message || result?.error || 'Invalid response format';
        console.error('[ADMIN SETTINGS] Bad response shape:', result);
        throw new Error(errorMsg);
      }
      
      // Extract data with fallbacks
      setRegions(result.data?.regions || []);
      setAdminUsers(result.data?.adminUsers || []);
      setForce2FA(result.data?.settings?.force2FA || false);
      setApiWriteAccess(result.data?.settings?.apiWriteAccess || false);
      setSystemStatus(result.data?.settings?.systemStatus || 'active');
      setLastAudit(result.data?.lastAudit || null);
    } catch (err: any) {
      console.error('[ADMIN SETTINGS] Error:', err);
      // Set user-friendly error message
      setError(err.message || 'Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  };
  
  const getRegionIcon = (region: Region) => {
    const name = region.name.toLowerCase();
    if (name.includes('north america') || name.includes('na')) {
      return { icon: 'public', color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' };
    }
    if (name.includes('emea') || name.includes('europe')) {
      return { icon: 'euro', color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' };
    }
    if (name.includes('apac') || name.includes('asia')) {
      return { icon: 'sunny', color: 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' };
    }
    return { icon: 'public', color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' };
  };
  
  const getRegionStatusColor = (status: string) => {
    if (status === 'operational' || status === 'Operational') {
      return 'text-emerald-600 dark:text-emerald-400';
    }
    return 'text-orange-600 dark:text-orange-400';
  };
  
  const formatTime = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };
  
  const formatDateShort = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const isToday = date.toDateString() === new Date().toDateString();
    if (isToday) return 'Today';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  
  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };
  
  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-background-light dark:bg-background-dark border-x border-border-light dark:border-border-dark shadow-2xl">
      {/* Top App Bar - 完全按照 UI 文档 */}
      <header className="sticky top-0 z-50 flex items-center justify-between bg-surface-light/95 dark:bg-surface-dark/95 backdrop-blur-md px-4 py-3 border-b border-border-light dark:border-border-dark">
        <button
          onClick={() => router.back()}
          className="flex size-10 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-primary dark:text-white"
        >
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="text-base font-bold uppercase tracking-wide text-primary dark:text-white">System Settings</h1>
        <button className="flex h-10 px-3 items-center justify-center text-primary-active font-semibold text-sm hover:opacity-80 transition-opacity">
          Done
        </button>
      </header>
      
      {/* Content - 完全按照 UI 文档 */}
      <main className="flex-1 flex flex-col p-4 gap-6 pb-24">
        {/* Tabs */}
        <div className="flex border-b border-border-light dark:border-border-dark">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'general'
                ? 'border-primary-active text-primary-active'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            General
          </button>
          <Link
            href="/settings/invites"
            className="flex-1 px-4 py-2 text-sm font-semibold border-b-2 border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 text-center transition-colors"
          >
            Invites
          </Link>
        </div>

        {/* Tab Content */}
        {activeTab === 'general' && (
          <>
            {/* Profile Stats / Global Overview - 完全按照 UI 文档 */}
        <section aria-label="System Overview">
          <div className="grid grid-cols-2 gap-3">
            {/* Stat Card 1: Status */}
            <div className="flex flex-col justify-between gap-3 rounded bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    systemStatus === 'active' ? 'bg-emerald-400' : 'bg-orange-400'
                  }`}></span>
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    systemStatus === 'active' ? 'bg-emerald-500' : 'bg-orange-500'
                  }`}></span>
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary dark:text-white">
                  {systemStatus === 'active' ? 'Active' : 'Maintenance'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">99.9% Uptime</p>
              </div>
            </div>
            
            {/* Stat Card 2: Last Audit */}
            <div className="flex flex-col justify-between gap-3 rounded bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-gray-400 text-[18px]">history</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Last Audit</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary dark:text-white">
                  {formatTime(lastAudit)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatDateShort(lastAudit)}</p>
              </div>
            </div>
          </div>
        </section>
        
        {/* Loading State */}
        {loading && (
          <>
            <Skeleton className="h-32 w-full mb-4" />
            <Skeleton className="h-64 w-full" />
          </>
        )}
        
        {/* Error State */}
        {error && !loading && (
          <ErrorState message={error} onRetry={fetchSettings} />
        )}
        
        {/* Settings Content */}
        {!loading && !error && (
          <>
            {/* Regional Configuration - 完全按照 UI 文档 */}
            <section>
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                  Regional Config
                </h3>
                <span className="text-xs font-medium text-primary-active bg-primary-active/10 px-2 py-0.5 rounded">
                  {regions.filter((r) => r.status === 'operational' || r.status === 'Operational').length} Active
                </span>
              </div>
              
              <div className="flex flex-col bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded overflow-hidden">
                {regions.length > 0 ? (
                  regions.map((region, index) => {
                    const regionIcon = getRegionIcon(region);
                    const isLast = index === regions.length - 1;
                    
                    return (
                      <div
                        key={region.id}
                        className={`group flex items-center justify-between p-4 ${
                          !isLast ? 'border-b border-border-light dark:border-border-dark' : ''
                        } hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded flex items-center justify-center ${regionIcon.color}`}>
                            <span className="material-symbols-outlined text-[20px]">{regionIcon.icon}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-primary dark:text-white">
                              {region.name}
                            </span>
                            <span className={`text-xs font-medium ${getRegionStatusColor(region.status)}`}>
                              {region.status}
                            </span>
                          </div>
                        </div>
                        <span className="material-symbols-outlined text-gray-400 dark:text-gray-600 text-[20px]">
                          chevron_right
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    No regions configured
                  </div>
                )}
                
                {/* Add Button - 完全按照 UI 文档 */}
                <button className="flex items-center justify-center gap-2 p-3 w-full bg-gray-50 hover:bg-gray-100 dark:bg-white/5 dark:hover:bg-white/10 text-primary-active text-sm font-semibold transition-colors">
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Add New Region
                </button>
              </div>
            </section>
            
            {/* Admin Users - 完全按照 UI 文档 */}
            <section>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                    Admin Users
                  </h3>
                  <button className="text-xs font-medium text-primary-active hover:underline">Manage All</button>
                </div>
                
                {/* Search - 完全按照 UI 文档 */}
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Search admins..."
                    className="w-full bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded pl-10 pr-4 py-2.5 text-sm text-primary dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary-active focus:ring-1 focus:ring-primary-active transition-all"
                  />
                </div>
                
                {/* Admin Users List - 完全按照 UI 文档 */}
                <div className="flex flex-col bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded overflow-hidden mt-1">
                  {adminUsers.length > 0 ? (
                    adminUsers.map((admin, index) => {
                      const isLast = index === adminUsers.length - 1;
                      
                      return (
                        <div
                          key={admin.id}
                          className={`flex items-center justify-between p-3 ${
                            !isLast ? 'border-b border-border-light dark:border-border-dark' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {admin.avatar ? (
                              <img
                                alt={`Portrait of ${admin.displayName}`}
                                className="h-10 w-10 rounded object-cover border border-border-light dark:border-border-dark"
                                src={admin.avatar}
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-primary/10 dark:bg-primary/30 flex items-center justify-center text-primary dark:text-blue-300 text-sm font-bold border border-primary/10 dark:border-primary/20">
                                {getInitials(admin.displayName)}
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-primary dark:text-white">
                                {admin.displayName}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {admin.role || 'Global Super Admin'}
                              </span>
                            </div>
                          </div>
                          <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded">
                            {admin.role === 'Full Access' ? 'Full Access' : 'Ltd Access'}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                      No admin users found
                    </div>
                  )}
                  
                  {/* Add Admin Button - 完全按照 UI 文档 */}
                  <button className="flex items-center justify-center gap-2 p-3 w-full bg-gray-50 hover:bg-gray-100 dark:bg-white/5 dark:hover:bg-white/10 text-primary-active text-sm font-semibold transition-colors">
                    <span className="material-symbols-outlined text-[18px]">person_add</span>
                    Add Admin
                  </button>
                </div>
              </div>
            </section>
            
            {/* Permissions / Security - 完全按照 UI 文档 */}
            <section className="pb-6">
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                  Security & Permissions
                </h3>
              </div>
              
              <div className="flex flex-col bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded overflow-hidden divide-y divide-border-light dark:divide-border-dark">
                {/* Toggle 1: Force 2FA - 完全按照 UI 文档 */}
                <div className="flex items-center justify-between p-4">
                  <div className="flex flex-col pr-4">
                    <span className="text-sm font-semibold text-primary dark:text-white">Force 2FA</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Require 2-factor auth for all admin levels
                    </span>
                  </div>
                  {/* Toggle Switch - 完全按照 UI 文档 */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={force2FA}
                      onChange={(e) => setForce2FA(e.target.checked)}
                      className="sr-only peer"
                      disabled
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-active"></div>
                  </label>
                </div>
                
                {/* Toggle 2: API Write Access - 完全按照 UI 文档 */}
                <div className="flex items-center justify-between p-4">
                  <div className="flex flex-col pr-4">
                    <span className="text-sm font-semibold text-primary dark:text-white">API Write Access</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Allow external services to modify data
                    </span>
                  </div>
                  {/* Toggle Switch - 完全按照 UI 文档 */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={apiWriteAccess}
                      onChange={(e) => setApiWriteAccess(e.target.checked)}
                      className="sr-only peer"
                      disabled
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-active"></div>
                  </label>
                </div>
                
                {/* Link Item: Audit Logs - 完全按照 UI 文档 */}
                <div className="group flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-primary dark:text-white">Audit Logs</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      View full system change history
                    </span>
                  </div>
                  <span className="material-symbols-outlined text-gray-400 dark:text-gray-600 text-[20px]">
                    chevron_right
                  </span>
                </div>
              </div>
            </section>
            
            {/* Danger Zone - 完全按照 UI 文档 */}
            <div className="mt-4 px-1">
              <button className="w-full py-3 rounded border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 text-sm font-bold uppercase tracking-wide hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors">
                Maintenance Mode
              </button>
            </div>
          </>
        )}
          </>
        )}
      </main>
      
      {/* Bottom Navigation - 使用统一组件 */}
      <AdminBottomNav pendingCount={0} />
    </div>
  );
}
