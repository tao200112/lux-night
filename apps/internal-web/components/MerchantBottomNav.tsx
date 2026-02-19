/**
 * Merchant Bottom Navigation
 * 固定在 layout，跨页面不 remount；仅 mobile 显示
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MerchantBottomNav() {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/me')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const role = data?.memberships?.[0]?.role || data?.roles?.merchant_memberships?.[0]?.role || null;
        setUserRole(role?.toLowerCase() || null);
      })
      .catch(() => {});
  }, []);

  const showSettings = userRole && userRole !== 'staff';
  const isActive = (path: string) => pathname === path || pathname?.startsWith(path + '/');

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] lg:hidden bg-background-light dark:bg-background-dark border-t border-gray-100 dark:border-gray-800 px-6 py-3 flex items-center justify-between z-50">
      <Link
        href="/dashboard"
        className={`flex flex-col items-center gap-1 ${isActive('/dashboard') ? 'text-primary' : 'text-gray-400'}`}
      >
        <span className={`material-symbols-outlined ${isActive('/dashboard') ? 'font-bold' : ''}`}>dashboard</span>
        <span className="text-[10px] font-bold">Dashboard</span>
      </Link>
      <Link
        href="/events"
        className={`flex flex-col items-center gap-1 ${isActive('/events') ? 'text-primary' : 'text-gray-400'}`}
      >
        <span className={`material-symbols-outlined ${isActive('/events') ? 'text-2xl filled' : ''}`}>event</span>
        <span className="text-[10px] font-bold">Events</span>
      </Link>
      <div className="relative -top-6">
        <Link
          href="/scan"
          className={`w-14 h-14 rounded-full flex items-center justify-center border-4 transition-colors ${
            isActive('/scan') ? 'bg-primary text-white border-primary/30' : 'bg-primary text-white border-background-light dark:border-background-dark'
          }`}
        >
          <span className="material-symbols-outlined text-3xl">qr_code_scanner</span>
        </Link>
      </div>
      <Link
        href="/staff"
        className={`flex flex-col items-center gap-1 ${isActive('/staff') ? 'text-primary' : 'text-gray-400'}`}
      >
        <span className={`material-symbols-outlined ${isActive('/staff') ? 'font-bold' : ''}`}>group</span>
        <span className="text-[10px] font-bold">Staff</span>
      </Link>
      {showSettings ? (
        <Link
          href="/settings"
          className={`flex flex-col items-center gap-1 ${isActive('/settings') ? 'text-primary' : 'text-gray-400'}`}
        >
          <span className={`material-symbols-outlined ${isActive('/settings') ? 'font-bold' : ''}`}>settings</span>
          <span className="text-[10px] font-bold">Settings</span>
        </Link>
      ) : (
        <div className="w-12" />
      )}
    </nav>
  );
}
