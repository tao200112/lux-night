/**
 * Merchant Shell
 * 条件渲染 Bottom Nav，仅 merchant 页面显示
 */

'use client';

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
  const showNav = shouldShowNav(pathname);

  return (
    <>
      {showNav && <MerchantTopBar />}
      <div className={showNav ? 'pb-24 lg:pb-6' : ''}>{children}</div>
      {showNav && <MerchantBottomNav />}
    </>
  );
}
