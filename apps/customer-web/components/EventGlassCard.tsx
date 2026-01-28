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
  // Venue fallback logic: Venue Name -> Merchant Name -> Unknown
  // Location logic: Venue City -> Address -> 'Location TBD'
  const venueName = event.venue?.name || event.merchant?.name || (event as any).merchants?.name || ''; 
  const venueCity = event.venue?.city || (event.venue?.address ? event.venue.address.split(',').pop()?.trim() : '') || '';
  const locationText = venueCity ? `${venueName} • ${venueCity}` : venueName;

  return (
    <Link
      href={`/events-v2/${event.id}`}
      className="flex gap-3 p-2 rounded-lg w-full
        bg-[#1A1A1A] border border-white/5
        active:scale-[0.99] transition-transform duration-200"
    >
      {/* Poster: Landscape ratio (3:2 approx), compact */}
      <div className="w-[100px] h-[66px] shrink-0 rounded-md overflow-hidden bg-white/5 relative">
        {event.poster_url ? (
          <img src={event.poster_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-800">
            <span className="material-symbols-outlined text-white/20 text-xl">event</span>
          </div>
        )}
      </div>

      {/* Info: Compact Hierarchy */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        
        {/* Title */}
        <h4 className="text-white font-semibold text-[14px] leading-tight truncate">
          {event.title}
        </h4>

        {/* Date & Time */}
        <p className="text-[rgb(212,175,55)] text-[12px] font-medium leading-none mt-0.5">
          {formatTime(event.start_at)}
        </p>

        {/* Venue / Location */}
        <p className="text-zinc-500 text-[11px] truncate leading-none mt-1">
          {locationText}
        </p>
      </div>
    </Link>
  );
}
