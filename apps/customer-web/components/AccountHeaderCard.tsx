'use client';

import React from 'react';
import Link from 'next/link';

interface AccountHeaderCardProps {
  displayName: string;
  email: string | undefined;
  avatarUrl: string | null | undefined;
  href?: string;
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

export default function AccountHeaderCard({ displayName, email, avatarUrl, href = '#' }: AccountHeaderCardProps) {
  const initials = getInitials(displayName || '', email);
  const name = displayName || email?.split('@')[0] || 'User';

  return (
    <Link
      href={href}
      className="flex items-center gap-4 p-4 rounded-2xl bg-[#1E2224] border border-white/5 hover:border-white/10 transition-colors"
    >
      <div className="relative flex-shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-14 h-14 rounded-full object-cover ring-2 ring-white/10 shadow-lg"
          />
        ) : (
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md"
            style={{
              background: 'linear-gradient(135deg, #2d5016 0%, #195966 50%, #1a3a52 100%)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            {initials}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold truncate">{name}</p>
        {email && <p className="text-white/50 text-sm truncate">{email}</p>}
      </div>
      <span className="material-symbols-outlined text-white/40">chevron_right</span>
    </Link>
  );
}
