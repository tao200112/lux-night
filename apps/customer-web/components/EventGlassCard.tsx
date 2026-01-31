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
      className="group flex gap-3 p-3 rounded-lg w-full
        bg-[#0A0A0A] border border-[#D4AF37]/20
        hover:border-[#D4AF37]/40 active:scale-[0.99] transition-all duration-300"
    >
      {/* Poster: Portrait ratio 3:4 */}
      <div className="w-[60px] h-[80px] shrink-0 rounded overflow-hidden bg-gray-900 shadow-lg relative">
        {event.poster_url ? (
          <img src={event.poster_url} alt="" className="w-full h-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-800">
            <span className="material-symbols-outlined text-white/20 text-xl">event</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-center relative z-10 pl-1">
        
        {/* Title */}
        <h3 className="text-white font-semibold text-base leading-tight truncate mb-1.5">
          {event.title}
        </h3>

        {/* Date & Time and Venue */}
        <div className="flex flex-col gap-0.5">
          <p className="text-[#D4AF37] text-sm font-medium">
            {formatTime(event.start_at)}
          </p>
          <p className="text-gray-400 text-xs font-light truncate">
            {locationText}
          </p>
        </div>
      </div>
    </Link>
  );
}
