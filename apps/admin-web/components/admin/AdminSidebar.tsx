/**
 * Admin Sidebar - Desktop layout (lg+)
 * Same nav items as AdminBottomNav, shown on left for desktop
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface AdminSidebarProps {
  pendingCount?: number;
}

const navItems = [
  { href: '/dashboard', icon: 'dashboard', label: 'Dashboard', exact: true },
  { href: '/approvals', icon: 'approval_delegation', label: 'Approvals', badge: true },
  { href: '/events', icon: 'event', label: 'Events' },
  { href: '/merchants', icon: 'storefront', label: 'Merchants' },
  { href: '/orders', icon: 'receipt_long', label: 'Orders' },
  { href: '/settings', icon: 'settings', label: 'Settings' },
];

export default function AdminSidebar({ pendingCount = 0 }: AdminSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark">
      <div className="p-4 border-b border-border-light dark:border-border-dark">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Lux Night Admin</h2>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact);
          const showBadge = item.badge && pendingCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-primary/10 text-primary dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span
                className={`material-symbols-outlined ${active ? 'filled' : ''}`}
                style={{ fontSize: 20, fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span className="flex h-2 w-2 rounded-full bg-red-500" aria-label={`${pendingCount} pending`} />
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
