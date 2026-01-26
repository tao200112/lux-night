'use client';

import React from 'react';
import Link from 'next/link';
import type { EventWithVenue } from '@/lib/data/events';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function formatAddress(venue: { name: string; address: string | null }): string {
  if (venue.address?.trim()) return `${venue.name} · ${venue.address.trim()}`;
  return venue.name || '—';
}

export default function EventGlassCard({ event }: { event: EventWithVenue }) {
  const address = formatAddress(event.venue ?? { name: '—', address: null });

  return (
    <Link
      href={`/events/${event.id}`}
      className="flex gap-3 p-3 rounded-xl min-w-0
        bg-white/[0.06] backdrop-blur-md
        border border-[rgba(212,175,55,0.28)]
        shadow-[0_2px_12px_rgba(0,0,0,0.2)]
        hover:bg-white/[0.08] hover:border-[rgba(212,175,55,0.4)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)]
        active:scale-[0.99] active:brightness-95
        transition-all duration-200"
    >
      {/* Poster 72x72 圆角，带轻阴影避免黑底吞图 */}
      <div className="w-[72px] h-[72px] shrink-0 rounded-lg overflow-hidden bg-white/5 ring-1 ring-white/10 shadow-md">
        {event.poster_url ? (
          <img src={event.poster_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-white/30 text-2xl">image</span>
          </div>
        )}
      </div>

      {/* 中间：title、时间、地址，避免溢出 */}
      <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
        <h4 className="text-white font-bold text-[15px] leading-snug line-clamp-2">{event.title}</h4>
        <p className="text-white/60 text-sm mt-0.5 truncate">{formatTime(event.start_at)}</p>
        <p className="text-white/45 text-xs mt-0.5 line-clamp-2 break-words">{address}</p>
      </div>

      <span className="material-symbols-outlined text-white/40 self-center shrink-0" aria-hidden>chevron_right</span>
    </Link>
  );
}
