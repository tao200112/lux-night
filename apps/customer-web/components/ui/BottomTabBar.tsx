'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function BottomTabBar() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-20 bg-[#121416]/95 backdrop-blur-xl border-t border-white/5 flex items-start justify-around pt-4 px-2 max-w-md mx-auto">
      <Link href="/" className="flex flex-col items-center gap-1 w-14 group">
        <span className={`material-symbols-outlined transition-colors ${isActive('/') ? 'text-white filled' : 'text-gray-500 group-hover:text-white'}`}>home</span>
        <span className={`text-[10px] font-medium transition-colors ${isActive('/') ? 'text-white' : 'text-gray-500 group-hover:text-white'}`}>Home</span>
      </Link>
      <Link href="/wallet" className="flex flex-col items-center gap-1 w-14 group">
        <span className={`material-symbols-outlined transition-colors ${isActive('/wallet') ? 'text-lux-gold filled' : 'text-gray-500 group-hover:text-white'}`}>wallet</span>
        <span className={`text-[10px] font-medium transition-colors ${isActive('/wallet') ? 'text-lux-gold font-bold' : 'text-gray-500 group-hover:text-white'}`}>Wallet</span>
      </Link>
      <Link href="/drops" className="flex flex-col items-center gap-1 w-14 group">
        <span className={`material-symbols-outlined transition-colors ${isActive('/drops') ? 'text-white filled' : 'text-gray-500 group-hover:text-white'}`}>inventory_2</span>
        <span className={`text-[10px] font-medium transition-colors ${isActive('/drops') ? 'text-white' : 'text-gray-500 group-hover:text-white'}`}>Drops</span>
      </Link>
      <Link href="/profile" className="flex flex-col items-center gap-1 w-14 group">
        <span className={`material-symbols-outlined transition-colors ${isActive('/profile') ? 'text-white filled' : 'text-gray-500 group-hover:text-white'}`}>person</span>
        <span className={`text-[10px] font-medium transition-colors ${isActive('/profile') ? 'text-white' : 'text-gray-500 group-hover:text-white'}`}>Profile</span>
      </Link>
    </nav>
  );
}
