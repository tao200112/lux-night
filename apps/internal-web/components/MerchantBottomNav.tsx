/**
 * Merchant Bottom Navigation
 * 固定在 layout，永不 unmount（Shell 用 hidden 控制显隐）；mobile + desktop 均显示
 * 统一 icon box + label 结构，Scan 同基线不破坏对齐
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

  const iconBoxCls = (scan: boolean) =>
    `w-10 h-10 flex items-center justify-center shrink-0 ${scan ? 'rounded-full bg-primary text-white' : ''}`;

  const iconCls = (filled: boolean, active: boolean) =>
    `material-symbols-outlined text-2xl leading-none block ${
      filled && active ? 'filled' : ''
    } ${!filled && active ? 'font-bold' : ''}`;

  const navItem = (href: string, icon: string, label: string, filled = false) => (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center flex-1 h-16 min-w-0 gap-1 ${
        isActive(href) ? 'text-primary' : 'text-gray-400'
      }`}
    >
      <span className={iconBoxCls(false)}>
        <span className={iconCls(filled, isActive(href))}>{icon}</span>
      </span>
      <span className="text-[11px] leading-none font-bold text-center min-w-0 w-full truncate block">
        {label}
      </span>
    </Link>
  );

  return (
    <nav
      className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] h-16 bg-background-light dark:bg-background-dark border-t border-gray-100 dark:border-gray-800 px-1 flex items-center justify-between gap-0 z-[60] pb-[env(safe-area-inset-bottom)] ${hidden ? 'invisible opacity-0 pointer-events-none' : ''}`}
      aria-hidden={hidden}
    >
      {navItem('/dashboard', 'dashboard', 'Dashboard')}
      {navItem('/events', 'event', 'Events', true)}
      <Link
        href="/scan"
        className={`flex flex-col items-center justify-center flex-1 h-16 min-w-0 gap-1 ${
          isActive('/scan') ? 'text-primary' : 'text-gray-400'
        }`}
      >
        <span className={iconBoxCls(true)}>
          <span className={iconCls(false, isActive('/scan'))}>qr_code_scanner</span>
        </span>
        <span className="text-[11px] leading-none font-bold text-center min-w-0 w-full truncate block">
          Scan
        </span>
      </Link>
      {navItem('/staff', 'group', 'Staff')}
      {showSettings ? navItem('/settings', 'settings', 'Settings') : <div className="min-w-0 flex-1 h-16" />}
    </nav>
  );
}
