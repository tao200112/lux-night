/**
 * Merchant Bottom Navigation
 * 固定在 layout，永不 unmount（Shell 用 hidden 控制显隐）；仅 mobile 显示
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MerchantBottomNav({ hidden }: { hidden?: boolean }) {
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

  const iconCls = (filled: boolean, active: boolean) =>
    `inline-flex items-center justify-center w-10 h-10 shrink-0 leading-[0] material-symbols-outlined text-2xl ${
      filled && active ? 'filled' : ''
    } ${!filled && active ? 'font-bold' : ''}`;

  const navItem = (href: string, icon: string, label: string, filled = false) => (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 ${
        isActive(href) ? 'text-primary' : 'text-gray-400'
      }`}
    >
      <span className={iconCls(filled, isActive(href))}>{icon}</span>
      <span className="block text-[10px] font-bold leading-[1.2] text-center min-w-0 w-full truncate">
        {label}
      </span>
    </Link>
  );

  return (
    <nav
      className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] lg:hidden bg-background-light dark:bg-background-dark border-t border-gray-100 dark:border-gray-800 px-1 py-2 flex items-stretch justify-between gap-0 z-[60] pb-[env(safe-area-inset-bottom)] ${hidden ? 'invisible opacity-0 pointer-events-none' : ''}`}
      aria-hidden={hidden}
    >
      {navItem('/dashboard', 'dashboard', 'Dashboard')}
      {navItem('/events', 'event', 'Events', true)}
      <Link
        href="/scan"
        className={`flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 ${
          isActive('/scan') ? 'text-primary' : 'text-gray-400'
        }`}
      >
        <span className="inline-flex items-center justify-center w-10 h-10 shrink-0 leading-[0] rounded-full bg-primary text-white material-symbols-outlined text-2xl">
          qr_code_scanner
        </span>
        <span className="block text-[10px] font-bold leading-[1.2] text-center min-w-0 w-full truncate">
          Scan
        </span>
      </Link>
      {navItem('/staff', 'group', 'Staff')}
      {showSettings ? navItem('/settings', 'settings', 'Settings') : <div className="min-w-0 flex-1" />}
    </nav>
  );
}
