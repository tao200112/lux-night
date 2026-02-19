/**
 * Merchant Shell
 * 统一 Layout：Desktop 顶部 Header + 内容区；Mobile 顶部 Header + BottomNav + 内容区 pb 预留
 * Nav 可见性：denylist 规则，默认 show，仅 /login /auth /invite 隐藏
 */

'use client';

import { usePathname } from 'next/navigation';
import MerchantBottomNav from './MerchantBottomNav';
import MerchantTopBar from './MerchantTopBar';
import { shouldShowNav } from '@/lib/nav-visibility';

export default function MerchantShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav = shouldShowNav(pathname);

  return (
    <>
      <MerchantTopBar hidden={!showNav} />
      <div className={showNav ? 'pb-24 lg:pb-6' : ''}>{children}</div>
      <MerchantBottomNav hidden={!showNav} />
    </>
  );
}
