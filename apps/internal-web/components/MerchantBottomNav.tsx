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

  const navItem = (href: string, icon: string, label: string, filled = false) => (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-1 min-w-0 flex-1 ${isActive(href) ? 'text-primary' : 'text-gray-400'}`}
    >
      <span className={`flex items-center justify-center w-10 h-10 shrink-0 ${filled && isActive(href) ? 'material-symbols-outlined text-2xl filled' : 'material-symbols-outlined'} ${!filled && isActive(href) ? 'font-bold' : ''}`}>
        {icon}
      </span>
      <span className="text-[10px] font-bold truncate w-full text-center">{label}</span>
    </Link>
  );

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] lg:hidden bg-background-light dark:bg-background-dark border-t border-gray-100 dark:border-gray-800 px-2 py-2 flex items-center justify-between gap-0 z-50">
      {navItem('/dashboard', 'dashboard', 'Dashboard')}
      {navItem('/events', 'event', 'Events', true)}
      <Link
        href="/scan"
        className={`flex flex-col items-center justify-center gap-1 min-w-0 flex-1 ${
          isActive('/scan') ? 'text-primary' : 'text-gray-400'
        }`}
      >
        <span className="flex items-center justify-center w-10 h-10 shrink-0 rounded-full transition-colors bg-primary text-white">
          <span className="material-symbols-outlined text-2xl">qr_code_scanner</span>
        </span>
        <span className="text-[10px] font-bold truncate w-full text-center">Scan</span>
      </Link>
      {navItem('/staff', 'group', 'Staff')}
      {showSettings ? navItem('/settings', 'settings', 'Settings') : <div className="min-w-0 flex-1" />}
    </nav>
  );
}
