/**
 * Settings Page
 * 设置页面 - 包含账户信息和登出功能
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMerchantContext } from '@/contexts/MerchantContext';
import { signOut } from '@/lib/auth/client';

export default function SettingsPage() {
  const router = useRouter();
  const { user, workspace, memberships } = useMerchantContext();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (!confirm('确定要登出吗？')) {
      return;
    }

    try {
      setLoggingOut(true);
      await signOut('/login');
    } catch (error) {
      console.error('Logout error:', error);
      alert('登出失败，请重试');
      setLoggingOut(false);
    }
  };

  const handleSwitchAccount = async () => {
    if (!confirm('确定要切换账户吗？这将登出当前账户。')) {
      return;
    }

    try {
      setLoggingOut(true);
      await signOut('/login');
    } catch (error) {
      console.error('Switch account error:', error);
      alert('切换账户失败，请重试');
      setLoggingOut(false);
    }
  };

  return (
    <div className="w-full max-w-[430px] mx-auto bg-background-light dark:bg-background-dark font-display text-[#0c1d1d] dark:text-gray-100 min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 space-y-6">
        {/* Account Section */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 px-1">Account</h2>
          <div className="bg-card-light dark:bg-card-dark rounded-xl p-4 border border-gray-100 dark:border-gray-800 space-y-4">
            {/* User Email */}
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Email</p>
                <p className="text-base font-semibold text-gray-900 dark:text-white">{user?.email || 'Loading...'}</p>
              </div>
            </div>

            {/* Current Workspace */}
            {workspace && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Workspace</p>
                <p className="text-base font-semibold text-gray-900 dark:text-white">{workspace.merchantName}</p>
                {workspace.venueName && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{workspace.venueName}</p>
                )}
                <p className="text-xs text-primary mt-1 uppercase">{workspace.role}</p>
              </div>
            )}
          </div>
        </section>

        {/* Actions Section */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 px-1">Actions</h2>
          <div className="space-y-2">
            <button
              onClick={handleSwitchAccount}
              disabled={loggingOut}
              className="w-full flex items-center justify-between p-4 bg-card-light dark:bg-card-dark rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors active:scale-[0.98] disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">switch_account</span>
                <span className="text-base font-medium text-gray-900 dark:text-white">Switch Account</span>
              </div>
              <span className="material-symbols-outlined text-gray-400">chevron_right</span>
            </button>

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center justify-between p-4 bg-card-light dark:bg-card-dark rounded-xl border border-danger/20 dark:border-danger/30 text-danger hover:bg-danger/5 dark:hover:bg-danger/10 transition-colors active:scale-[0.98] disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined">logout</span>
                <span className="text-base font-medium">Logout</span>
              </div>
              {loggingOut && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-danger"></div>
              )}
            </button>
          </div>
        </section>
      </main>

      {/* Bottom Navigation - 移动端固定宽度 */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-background-light dark:bg-background-dark border-t border-gray-100 dark:border-gray-800 px-6 py-3 flex items-center justify-between z-50">
        <Link href="/dashboard" className="flex flex-col items-center gap-1 text-gray-400">
          <span className="material-symbols-outlined font-bold">dashboard</span>
          <span className="text-[10px] font-bold">Dashboard</span>
        </Link>
        <Link href="/events" className="flex flex-col items-center gap-1 text-gray-400">
          <span className="material-symbols-outlined">event</span>
          <span className="text-[10px] font-bold">Events</span>
        </Link>
        <div className="relative -top-6">
          <Link 
            href="/scan"
            className="w-14 h-14 bg-primary text-white rounded-full shadow-lg flex items-center justify-center border-4 border-background-light dark:border-background-dark"
          >
            <span className="material-symbols-outlined text-3xl">qr_code_scanner</span>
          </Link>
        </div>
        <Link href="/staff" className="flex flex-col items-center gap-1 text-gray-400">
          <span className="material-symbols-outlined">group</span>
          <span className="text-[10px] font-bold">Staff</span>
        </Link>
        <Link href="/settings" className="flex flex-col items-center gap-1 text-primary">
          <span className="material-symbols-outlined">settings</span>
          <span className="text-[10px] font-bold">Settings</span>
        </Link>
      </nav>
    </div>
  );
}
