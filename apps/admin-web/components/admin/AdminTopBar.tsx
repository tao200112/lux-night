/**
 * Admin Top Bar
 * 统一顶部导航栏组件
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface AdminTopBarProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  showMenu?: boolean;
  showNotifications?: boolean;
  notificationCount?: number;
  rightAction?: React.ReactNode;
}

export default function AdminTopBar({
  title,
  subtitle,
  showBack = false,
  showMenu = true,
  showNotifications = true,
  notificationCount = 0,
  rightAction,
}: AdminTopBarProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#1f2937]/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between transition-colors duration-300">
      <div className="flex items-center gap-3">
        {showBack ? (
          <Link
            href="/dashboard"
            className="p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
        ) : showMenu ? (
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
        ) : null}
        
        <div className="flex flex-col">
          <h1 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {subtitle}
            </span>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        {showNotifications && (
          <button className="relative p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <span className="material-symbols-outlined text-[22px]">notifications</span>
            {notificationCount > 0 && (
              <span className="absolute top-2 right-2 h-2 w-2 bg-danger rounded-full border-2 border-white dark:border-slate-800"></span>
            )}
          </button>
        )}
        
        {rightAction || (
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold ring-2 ring-slate-100 dark:ring-slate-700 cursor-pointer overflow-hidden">
            <img
              alt="Admin Avatar"
              className="h-full w-full object-cover"
              src="https://ui-avatars.com/api/?name=Admin&background=2d3c4e&color=fff"
            />
          </div>
        )}
      </div>
    </header>
  );
}
