'use client';

import React from 'react';
import Link from 'next/link';
import type { EventWithVenue } from '@/lib/data/events';

function formatAddress(venue: { name: string; address: string | null }): string {
  if (!venue) return 'Venue TBD';
  // Use strictly the venue name provided or fallback
  if (venue.name === 'Venue TBD' && !venue.address) return 'Venue TBD';
  
  if (venue.address) {
      if (venue.name && venue.name !== 'Venue TBD' && !venue.address.startsWith(venue.name)) {
          return `${venue.name} · ${venue.address}`;
      }
      return venue.address;
  }
  return venue.name || 'Venue TBD';
}

export default function EventGlassCard({ event }: { event: EventWithVenue }) {
  const addressText = formatAddress(event.venue);

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

        {/* Subtitle & Address */}
        <div className="flex flex-col gap-0.5">
          {event.subtitle && (
            <p className="text-[#D4AF37] text-sm font-medium truncate">
                {event.subtitle}
            </p>
          )}
          <p className="text-gray-400 text-xs font-light truncate">
            {addressText}
          </p>
        </div>
      </div>
    </Link>
  );
}
