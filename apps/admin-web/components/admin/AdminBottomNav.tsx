/**
 * Admin Bottom Navigation
 * 统一底部导航组件（5个 Tab：Dashboard, Approvals, Merchants, Orders, Settings）
 * 完全按照 UI 文档对齐
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface AdminBottomNavProps {
  pendingCount?: number;
}

export default function AdminBottomNav({ pendingCount = 0 }: AdminBottomNavProps) {
  const pathname = usePathname();
  
  const navItems = [
    {
      href: '/dashboard',
      icon: 'dashboard',
      label: 'Dashboard',
      exact: true,
    },
    {
      href: '/approvals',
      icon: 'approval_delegation',
      label: 'Approvals',
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      href: '/merchants',
      icon: 'storefront',
      label: 'Merchants',
    },
    {
      href: '/orders',
      icon: 'receipt_long',
      label: 'Orders',
    },
    {
      href: '/settings',
      icon: 'settings',
      label: 'Settings',
    },
  ];
  
  const isActive = (href: string, exact?: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  // 完全按照 UI 文档的结构和样式
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface-light dark:bg-background-dark border-t border-border-light dark:border-border-dark safe-area-bottom max-w-[480px] mx-auto">
      <div className="flex justify-around items-center h-16 px-1">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact);
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                active
                  ? 'text-primary-action dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 active:scale-95 transition-all'
              } group relative`}
            >
              <div className="relative flex items-center justify-center mb-1">
                <span 
                  className={`material-symbols-outlined ${active ? 'filled' : ''}`} 
                  style={{ 
                    fontSize: 24, 
                    fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" 
                  }}
                >
                  {item.icon}
                </span>
                {item.badge && item.badge > 0 && (
                  <div className="absolute -top-1 right-6 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-surface-dark"></div>
                )}
              </div>
              <span className={`text-[10px] leading-none ${
                active ? 'font-bold' : 'font-medium'
              }`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
