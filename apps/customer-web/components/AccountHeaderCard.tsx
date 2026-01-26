'use client';

import React from 'react';
import Link from 'next/link';

interface AccountHeaderCardProps {
  displayName: string;
  email: string | undefined;
  avatarUrl: string | null | undefined;
  href?: string;
  /** 例如 "Gold Member"，不传则不显示徽章 */
  badge?: string;
}

function getInitials(name: string, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '?';
}

export default function AccountHeaderCard({
  displayName,
  email,
  avatarUrl,
  href = '/profile/edit',
  badge,
}: AccountHeaderCardProps) {
  const initials = getInitials(displayName || '', email);
  const name = displayName || email?.split('@')[0] || 'User';

  return (
    <Link
      href={href}
      className="flex items-center gap-5 p-6 rounded-2xl bg-[#1A1D1F] border border-white/10 backdrop-blur-sm hover:border-primary/30 transition-all"
    >
      <div className="relative flex-shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-20 h-20 rounded-full object-cover ring-2 ring-white/10 shadow-lg"
          />
        ) : (
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #2d5016 0%, #195966 50%, #1a3a52 100%)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            {initials}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-lg truncate">{name}</p>
        {email && <p className="text-white/50 text-sm truncate mt-0.5">{email}</p>}
        {badge && (
          <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary/20 text-primary border border-primary/40">
            {badge}
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span className="text-primary text-sm font-medium">Edit</span>
        <span className="material-symbols-outlined text-primary/80" style={{ fontSize: '20px' }}>chevron_right</span>
      </div>
    </Link>
  );
}
