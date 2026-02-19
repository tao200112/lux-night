/**
 * Merchant Top Bar
 * 全屏顶栏，仅在 merchant 页面显示，桌面端全宽；hidden 时仅 CSS 隐藏，不 unmount
 */

'use client';

import Link from 'next/link';
import { useMerchantContext } from '../contexts/MerchantContext';

export default function MerchantTopBar({ hidden }: { hidden?: boolean }) {
  const { workspace } = useMerchantContext();
  const displayName = workspace?.merchantName || workspace?.venueName || 'Merchant';

  return (
    <header
      className={`sticky top-0 z-40 w-full bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 ${hidden ? 'invisible opacity-0 pointer-events-none' : ''}`}
      aria-hidden={hidden}
    >
      <div className="w-full max-w-[430px] lg:max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold"
        >
          <span className="material-symbols-outlined text-primary text-xl">nightlife</span>
          <span className="text-sm tracking-tight hidden sm:inline">Lux</span>
        </Link>
        <Link
          href="/workspaces"
          className="flex items-center gap-1.5 rounded-full px-3 py-2 bg-primary/10 dark:bg-primary/20 text-primary hover:bg-primary/20 dark:hover:bg-primary/30 transition-colors"
        >
          <span className="text-sm font-bold truncate max-w-[140px]">{displayName}</span>
          <span className="material-symbols-outlined text-sm shrink-0">expand_more</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="size-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
