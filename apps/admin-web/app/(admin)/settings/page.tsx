/**
 * Admin Settings Page
 * System Settings 页面（完全按照 uiadmin/system_settings/code.html 重写）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageContainer from '@/components/admin/PageContainer';
import ErrorState from '@/components/admin/ErrorState';
import EmptyState from '@/components/admin/EmptyState';
import { Skeleton } from '@/components/admin/Skeleton';
import PlaceAutocomplete from '@/components/PlaceAutocomplete';
import CitySelect from '@/components/CitySelect';
import { US_STATES } from '@/lib/usStates';

interface Region {
  id: string;
  name: string;
  city?: string | null;
  state: string | null;
  country: string | null;
  status: string;
  is_active?: boolean;
  isActive?: boolean;
  center_lat?: number | null;
  center_lng?: number | null;
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
  const [hasPlacesKey, setHasPlacesKey] = useState(false);
  const [showAddRegionModal, setShowAddRegionModal] = useState(false);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [newRegionState, setNewRegionState] = useState('');
  const [newRegionCity, setNewRegionCity] = useState('');
  const [newRegionName, setNewRegionName] = useState('');
  const [newRegionCenterLat, setNewRegionCenterLat] = useState<number | null>(null);
  const [newRegionCenterLng, setNewRegionCenterLng] = useState<number | null>(null);
  const [newRegionCenterDesc, setNewRegionCenterDesc] = useState('');
  const [submittingRegion, setSubmittingRegion] = useState(false);
  const [editState, setEditState] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editName, setEditName] = useState('');
  const [editCenterLat, setEditCenterLat] = useState<number | null>(null);
  const [editCenterLng, setEditCenterLng] = useState<number | null>(null);
  const [editCenterDesc, setEditCenterDesc] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);
  
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
      setHasPlacesKey(!!result.data?.hasPlacesKey);
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
    <PageContainer className="overflow-x-hidden bg-background-light dark:bg-background-dark">
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
            href="/settings/drops"
            className="flex-1 px-4 py-2 text-sm font-semibold border-b-2 border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 text-center transition-colors"
          >
            Drops
          </Link>
          <Link
            href="/settings/invites"
            className="flex-1 px-4 py-2 text-sm font-semibold border-b-2 border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 text-center transition-colors"
          >
            Invites
          </Link>
          <Link
            href="/ambassadors"
            className="flex-1 px-4 py-2 text-sm font-semibold border-b-2 border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 text-center transition-colors"
          >
            Ambassadors
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
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-primary-active bg-primary-active/10 px-2 py-0.5 rounded">
                    {regions.filter((r) => r.status === 'operational' || r.status === 'Operational').length} Active
                  </span>
                </div>
              </div>
              
              <div className="flex flex-col bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded overflow-hidden">
                {regions.length > 0 ? (
                  regions.map((region, index) => {
                    const regionIcon = getRegionIcon(region);
                    const isLast = index === regions.length - 1;
                    
                    return (
                      <div
                        key={region.id}
                        onClick={() => { setEditingRegion(region); setEditState(region.state || ''); setEditCity(region.city || ''); setEditName(region.name || ''); setEditCenterLat(region.center_lat ?? null); setEditCenterLng(region.center_lng ?? null); setEditCenterDesc(''); setEditStatus(region.status || 'Operational'); }}
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
                            <span className={`text-xs ${getRegionStatusColor(region.status || '')}`}>
                              {[region.city, region.state].filter(Boolean).join(', ') || '—'}
                              {region.status ? ` · ${region.status}` : ''}
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
                <button
                  onClick={() => {
                    setShowAddRegionModal(true);
                    setNewRegionState('');
                    setNewRegionCity('');
                    setNewRegionName('');
                    setNewRegionCenterLat(null);
                    setNewRegionCenterLng(null);
                    setNewRegionCenterDesc('');
                  }}
                  className="flex items-center justify-center gap-2 p-3 w-full bg-gray-50 hover:bg-gray-100 dark:bg-white/5 dark:hover:bg-white/10 text-primary-active text-sm font-semibold transition-colors"
                >
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
      
      {/* Add Region Modal — 表格化：Country/State/City 选择，不允许手打 */}
      {showAddRegionModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddRegionModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto bg-white dark:bg-slate-800 rounded-t-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Add New Region</h3>
              <button onClick={() => setShowAddRegionModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">close</span>
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newRegionState || !newRegionCity.trim()) {
                  alert('State and City are required. Select from dropdowns or use "Select city center (Google)".');
                  return;
                }
                try {
                  setSubmittingRegion(true);
                  const body: { country: string; state: string; city: string; name: string; center_lat?: number; center_lng?: number } = {
                    country: 'US',
                    state: newRegionState,
                    city: newRegionCity.trim(),
                    name: (newRegionName || newRegionCity).trim(),
                  };
                  if (typeof newRegionCenterLat === 'number' && typeof newRegionCenterLng === 'number') {
                    body.center_lat = newRegionCenterLat;
                    body.center_lng = newRegionCenterLng;
                  }
                  const res = await fetch('/api/admin/regions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                  const data = await res.json();
                  if (!res.ok || !data.success) {
                    throw new Error(data.message || data.code || 'Failed to create region');
                  }
                  setShowAddRegionModal(false);
                  setNewRegionState(''); setNewRegionCity(''); setNewRegionName(''); setNewRegionCenterLat(null); setNewRegionCenterLng(null); setNewRegionCenterDesc('');
                  await fetchSettings();
                  alert('Region created successfully!');
                } catch (err: any) {
                  alert(err.message || 'Failed to create region');
                } finally {
                  setSubmittingRegion(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Country</label>
                <input type="text" value="US" readOnly className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 px-3 py-2.5 text-sm text-slate-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">State <span className="text-red-500">*</span></label>
                <select value={newRegionState} onChange={(e) => { setNewRegionState(e.target.value); setNewRegionCity(''); setNewRegionName(''); }} disabled={submittingRegion} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2.5 text-sm" required>
                  <option value="">Select state</option>
                  {US_STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">City <span className="text-red-500">*</span></label>
                <CitySelect country="US" state={newRegionState} value={newRegionCity} hasPlacesKey={hasPlacesKey} disabled={submittingRegion} onChange={(v) => { setNewRegionCity(v.city); if (v.state) setNewRegionState(v.state); if (v.center_lat != null) setNewRegionCenterLat(v.center_lat); if (v.center_lng != null) setNewRegionCenterLng(v.center_lng); setNewRegionName((n) => n || v.city); }} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Display name</label>
                <input type="text" value={newRegionName} onChange={(e) => setNewRegionName(e.target.value)} placeholder={newRegionCity || 'e.g. Los Angeles'} disabled={submittingRegion} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2.5 text-sm" />
              </div>
              {hasPlacesKey && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">City center (optional)</label>
                  <PlaceAutocomplete types="address" value={newRegionCenterDesc} onSelect={async (v) => {
                    setNewRegionCenterDesc(v.description);
                    const r = await fetch('/api/admin/places/details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ place_id: v.place_id }) });
                    const d = await r.json();
                    if (r.ok && d && (typeof d.lat === 'number' && typeof d.lng === 'number')) { setNewRegionCenterLat(d.lat); setNewRegionCenterLng(d.lng); }
                  }} placeholder="Search to set center point" disabled={submittingRegion} />
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAddRegionModal(false)} disabled={submittingRegion} className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 font-medium disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={submittingRegion || !newRegionState || !newRegionCity.trim()} className="flex-1 px-4 py-2 rounded-lg bg-primary text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed">{submittingRegion ? 'Creating...' : 'Create Region'}</button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Edit Region Modal */}
      {editingRegion && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setEditingRegion(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto bg-white dark:bg-slate-800 rounded-t-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Edit Region</h3>
              <button onClick={() => setEditingRegion(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><span className="material-symbols-outlined text-slate-600 dark:text-slate-400">close</span></button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!editingRegion?.id || !editState || !editCity.trim()) return;
                try {
                  setSubmittingEdit(true);
                  const body: Record<string, unknown> = { state: editState, city: editCity.trim(), name: editName.trim() || editCity, status: editStatus || 'Operational' };
                  if (typeof editCenterLat === 'number' && typeof editCenterLng === 'number') { body.center_lat = editCenterLat; body.center_lng = editCenterLng; }
                  const res = await fetch(`/api/admin/regions/${editingRegion.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                  const data = await res.json();
                  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update');
                  setEditingRegion(null);
                  await fetchSettings();
                  alert('Region updated.');
                } catch (err: any) {
                  alert(err.message || 'Failed to update');
                } finally {
                  setSubmittingEdit(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-1">State <span className="text-red-500">*</span></label>
                <select value={editState} onChange={(e) => { setEditState(e.target.value); setEditCity(''); }} disabled={submittingEdit} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2.5 text-sm" required>
                  <option value="">Select state</option>
                  {US_STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">City <span className="text-red-500">*</span></label>
                <CitySelect country="US" state={editState} value={editCity} hasPlacesKey={hasPlacesKey} disabled={submittingEdit} onChange={(v) => { setEditCity(v.city); if (v.state) setEditState(v.state); if (v.center_lat != null) setEditCenterLat(v.center_lat); if (v.center_lng != null) setEditCenterLng(v.center_lng); }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Display name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={submittingEdit} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} disabled={submittingEdit} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2.5 text-sm">
                  <option value="Operational">Operational</option>
                  <option value="Maintenance">Maintenance</option>
                </select>
              </div>
              {hasPlacesKey && (
                <div>
                  <label className="block text-sm font-medium mb-1">City center (optional)</label>
                  <PlaceAutocomplete types="address" value={editCenterDesc} onSelect={async (v) => {
                    setEditCenterDesc(v.description);
                    const r = await fetch('/api/admin/places/details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ place_id: v.place_id }) });
                    const d = await r.json();
                    if (r.ok && d && typeof d.lat === 'number' && typeof d.lng === 'number') { setEditCenterLat(d.lat); setEditCenterLng(d.lng); }
                  }} placeholder="Search to set center" disabled={submittingEdit} />
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setEditingRegion(null)} disabled={submittingEdit} className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 font-medium">Cancel</button>
                <button type="submit" disabled={submittingEdit || !editState || !editCity.trim()} className="flex-1 px-4 py-2 rounded-lg bg-primary text-white font-medium disabled:opacity-50">{submittingEdit ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </PageContainer>
  );
}
