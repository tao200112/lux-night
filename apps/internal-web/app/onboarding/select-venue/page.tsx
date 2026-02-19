/**
 * Venue Selection & Role Routing Page (Step 1)
 * 完全按照 uimerchant/role_routing_&_venue_select_1/code.html 设计
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMerchantContext } from '@/contexts/MerchantContext';
import { signOut } from '@/lib/auth/client';
import PageContainer from '@/components/layout/PageContainer';

export default function SelectVenuePage() {
  const router = useRouter();
  const { workspace, memberships, switchWorkspace } = useMerchantContext();
  const [selectedVenueId, setSelectedVenueId] = useState<string>('');
  const [skipNextTime, setSkipNextTime] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 如果已有默认 venue，自动选择
    if (workspace?.venueId) {
      setSelectedVenueId(workspace.venueId);
    } else if (memberships.length > 0 && memberships[0].venues.length > 0) {
      setSelectedVenueId(memberships[0].venues[0].venueId);
    }
    setLoading(false);
  }, [workspace, memberships]);

  // 获取当前 merchant 的所有 venues
  const currentMerchant = memberships[0]; // 假设先显示第一个 merchant
  const venues = currentMerchant?.venues || [];

  const handleStaffPath = async () => {
    if (selectedVenueId) {
      await switchWorkspace(currentMerchant.merchantId, selectedVenueId);
      // 如果启用了跳过，设置跳过标志（TODO: 保存到 profile）
      router.push('/scan');
    }
  };

  const handleManagerPath = async () => {
    if (selectedVenueId) {
      await switchWorkspace(currentMerchant.merchantId, selectedVenueId);
      router.push('/');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const userEmail = 'user@example.com'; // TODO: 从 context 获取

  return (
    <PageContainer className="bg-background-light dark:bg-background-dark text-[#0c1d1d] dark:text-gray-100 min-h-screen flex flex-col">
      {/* iOS Status Bar Spacer */}
      <div className="h-[44px] w-full bg-background-light dark:bg-background-dark"></div>

      {/* TopAppBar */}
      <nav className="flex items-center bg-background-light dark:bg-background-dark px-6 py-4 justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-2xl filled">shield_person</span>
          <h2 className="text-[#0c1d1d] dark:text-white text-lg font-bold tracking-tight">Access Control</h2>
        </div>
        <button 
          onClick={async () => {
            if (confirm('确定要登出吗？')) {
              try {
                await signOut('/login');
              } catch (error) {
                console.error('Logout error:', error);
              }
            }
          }}
          className="text-primary text-sm font-semibold hover:bg-primary/5 px-3 py-1 rounded-lg transition-colors"
        >
          Logout
        </button>
      </nav>

      {/* ProfileHeader */}
      <header className="flex flex-col items-center px-6 py-8 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="relative">
          <div className="bg-center bg-no-repeat aspect-square bg-gray-300 dark:bg-gray-700 rounded-full h-24 w-24 border-2 border-primary/20 p-1 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-gray-400">person</span>
          </div>
          <div className="absolute bottom-0 right-0 bg-green-500 w-5 h-5 rounded-full border-4 border-background-light dark:border-background-dark"></div>
        </div>
        <div className="mt-4 text-center">
          <h1 className="text-[#0c1d1d] dark:text-white text-2xl font-bold tracking-tight">Good Evening</h1>
          <p className="text-primary dark:text-primary/80 text-sm font-medium mt-1">{userEmail}</p>
          <div className="flex gap-2 mt-3 justify-center">
            {currentMerchant && (
              <span className="bg-primary/10 text-primary text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-wider">
                {currentMerchant.role}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 pb-24 w-full">
        {/* Section: Venue Selection */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[#0c1d1d] dark:text-white text-sm font-bold uppercase tracking-widest">Select Active Venue</h3>
            <span className="text-xs text-primary font-semibold">{venues.length} Available</span>
          </div>
          <div className="relative group">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-primary text-xl">nightlife</span>
            </div>
            <select
              value={selectedVenueId}
              onChange={(e) => setSelectedVenueId(e.target.value)}
              className="block w-full pl-12 pr-10 py-4 text-base font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-primary focus:border-primary appearance-none transition-all"
            >
              {venues.length === 0 ? (
                <option value="">No venues available</option>
              ) : (
                venues.map((venue) => (
                  <option key={venue.venueId} value={venue.venueId}>
                    {venue.venueName}
                  </option>
                ))
              )}
            </select>
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-gray-400">unfold_more</span>
            </div>
          </div>
        </section>

        {/* Section: Primary Actions */}
        <section className="space-y-4">
          <h3 className="text-[#0c1d1d] dark:text-white text-sm font-bold uppercase tracking-widest mb-3">Continue to Workspace</h3>
          
          {/* Staff Path */}
          <button
            onClick={handleStaffPath}
            disabled={!selectedVenueId}
            className="w-full flex items-center gap-5 p-5 bg-background-light dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm hover:shadow-md transition-all text-left disabled:opacity-50 active:scale-[0.98]"
          >
            <div className="size-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-3xl">qr_code_scanner</span>
            </div>
            <div className="flex-1">
              <h4 className="text-[#0c1d1d] dark:text-white font-bold text-lg leading-tight">Entry Management</h4>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Check-in guests and scan digital tickets.</p>
            </div>
            <span className="material-symbols-outlined text-primary/40">chevron_right</span>
          </button>

          {/* Manager Path */}
          <button
            onClick={handleManagerPath}
            disabled={!selectedVenueId}
            className="w-full flex items-center gap-5 p-5 bg-background-light dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm hover:shadow-md transition-all text-left disabled:opacity-50 active:scale-[0.98]"
          >
            <div className="size-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-3xl">query_stats</span>
            </div>
            <div className="flex-1">
              <h4 className="text-[#0c1d1d] dark:text-white font-bold text-lg leading-tight">Business Intelligence</h4>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">View real-time sales and performance data.</p>
            </div>
            <span className="material-symbols-outlined text-primary/40">chevron_right</span>
          </button>
        </section>

        {/* Quick Toggle */}
        <div className="mt-10 flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/10">
          <div className="flex flex-col">
            <p className="text-xs font-bold text-primary uppercase">Efficiency Mode</p>
            <p className="text-sm text-[#0c1d1d] dark:text-gray-300">Skip this screen next time</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={skipNextTime}
              onChange={(e) => setSkipNextTime(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>
      </main>
    </PageContainer>
  );
}
