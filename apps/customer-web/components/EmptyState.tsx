'use client';

import React from 'react';
import Link from 'next/link';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}

export default function EmptyState({
  icon = 'inbox',
  title,
  description,
  actionLabel = 'Explore Events',
  actionHref = '/',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-2xl border border-white/5 bg-white/[0.02]">
      <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 ring-1 ring-white/10">
        <span className="material-symbols-outlined text-3xl text-white/40">{icon}</span>
      </div>
      <h3 className="text-white font-semibold mb-1">{title}</h3>
      {description && <p className="text-white/50 text-sm max-w-[240px] mb-6">{description}</p>}
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-2 bg-lux-gold text-lux-dark hover:bg-[#D4A63B] transition-colors rounded-xl px-5 py-2.5 font-bold text-sm"
        >
          {actionLabel}
          <span className="material-symbols-outlined text-lg">arrow_forward</span>
        </Link>
      )}
    </div>
  );
}
