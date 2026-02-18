'use client';

import React from 'react';
import Link from 'next/link';
import type { EventWithVenue } from '@/lib/data/events';

export default function EventCard({ event }: { event: EventWithVenue }) {
  return (
    <Link
      href={`/events-v2/${event.id}`}
      className="block group rounded-2xl overflow-hidden active:scale-[0.98] transition-transform duration-150 ease-out"
    >
      <div className="relative rounded-2xl overflow-hidden bg-[#0A0A0A]">
        {/* Large cover */}
        <div className="aspect-[4/3] w-full overflow-hidden relative">
          {event.poster_url ? (
            <img
              src={event.poster_url}
              alt=""
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-900">
              <span className="material-symbols-outlined text-white/20 text-4xl">event</span>
            </div>
          )}
          {/* Subtle dark gradient on lower half */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
        </div>

        {/* Content overlay: title + subtitle + Buy only */}
        <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col gap-2">
          <h3 className="text-white font-bold text-xl leading-tight">
            {event.title}
          </h3>
          {event.subtitle && (
            <p className="text-zinc-400 text-sm truncate">{event.subtitle}</p>
          )}
          <div className="mt-1 w-full py-3 rounded-xl text-center font-bold text-[#121212] bg-[#D4AF37] group-hover:bg-[#E8B94B] transition-colors duration-150 ease-out">
            Buy
          </div>
        </div>
      </div>
    </Link>
  );
}
