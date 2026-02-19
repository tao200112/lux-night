/**
 * Merchant Shell
 * 统一 Layout：Desktop 顶部 Header + 内容区；Mobile 顶部 Header + BottomNav + 内容区 pb 预留
 * BottomNav 永不 unmount（用 stale path 避免 pathname=null 时消失）
 */

'use client';

import { useRef } from 'react';
import { usePathname } from 'next/navigation';
import MerchantBottomNav from './MerchantBottomNav';
import MerchantTopBar from './MerchantTopBar';

const MERCHANT_NAV_PATHS = [
  '/dashboard',
  '/events',
  '/staff',
  '/settings',
  '/scan',
  '/workspaces',
  '/requests',
  '/invites/create',
  '/admin/event-change-requests',
];

function shouldShowNav(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === '/') return false;
  return MERCHANT_NAV_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export default function MerchantShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lastShowNavRef = useRef(false);
  const showNav = (() => {
    if (pathname === null || pathname === '/') return lastShowNavRef.current;
    const v = shouldShowNav(pathname);
    lastShowNavRef.current = v;
    return v;
  })();

  return (
    <>
      <MerchantTopBar hidden={!showNav} />
      <div className={showNav ? 'pb-24 lg:pb-6' : ''}>{children}</div>
      <MerchantBottomNav hidden={!showNav} />
    </>
  );
}
