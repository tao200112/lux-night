'use client';

import React from 'react';
import Link from 'next/link';

interface AccountListItemProps {
  icon: string;
  label: string;
  href?: string;
  subtitle?: string;
  /** 若提供，则渲染为 button 而非 Link（用于 Share 等需客户端交互的项） */
  onClick?: () => void;
}

export default function AccountListItem({ icon, label, href, subtitle, onClick }: AccountListItemProps) {
  const cn = "flex items-center justify-between p-4 rounded-xl hover:bg-white/[0.04] active:scale-[0.995] transition-all duration-[120ms]";
  const inner = (
    <>
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 text-primary/90">
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        <div className="flex flex-col items-start">
          <span className="text-white font-medium">{label}</span>
          {subtitle && <span className="text-white/50 text-xs">{subtitle}</span>}
        </div>
      </div>
      <span className="material-symbols-outlined text-white/40 text-xl">chevron_right</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`w-full text-left ${cn}`}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={href ?? '#'} className={cn}>
      {inner}
    </Link>
  );
}
