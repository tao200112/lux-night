'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { EventWithVenue } from '@/lib/data/events';

function formatVenue(venue: { name: string; address: string | null } | undefined): string {
  if (!venue) return '';
  return venue.name && venue.name !== 'Venue TBD' ? venue.name : venue.address || '';
}

export default function EventCard({ event }: { event: EventWithVenue }) {
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const venueText = formatVenue(event.venue);

  useEffect(() => {
    fetch(`/api/public/events-v2/${event.id}/upcoming-days?limit=1`)
      .then((r) => r.json())
      .then((d) => {
        const day = d.days?.[0];
        if (day?.tickets?.length) {
          const prices = day.tickets.map((t: { price_cents: number }) => t.price_cents);
          if (prices.length) setMinPrice(Math.min(...prices));
        }
      })
      .catch(() => {});
  }, [event.id]);

  return (
    <Link
      href={`/events-v2/${event.id}`}
      className="block group rounded-2xl overflow-hidden active:scale-[var(--tap-scale)] transition-transform duration-[var(--transition-normal)] ease-[var(--ease-out)]"
      style={{ transitionDuration: '180ms' }}
    >
      <div className="relative rounded-2xl overflow-hidden bg-[#0A0A0A] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {/* Large cover */}
        <div className="aspect-[4/3] w-full overflow-hidden">
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
        </div>

        {/* Content overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col gap-2">
          <h3 className="text-white font-bold text-xl leading-tight drop-shadow-lg">
            {event.title}
          </h3>
          {event.subtitle && (
            <p className="text-[#D4AF37] text-sm font-medium truncate">{event.subtitle}</p>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-white/70 text-sm min-w-0">
              {venueText && (
                <span className="truncate flex items-center gap-1">
                  <span className="material-symbols-outlined text-base">location_on</span>
                  {venueText}
                </span>
              )}
              {(event.age_policy === '21+' || event.age_policy === 'BOTH') && (
                <span className="shrink-0 text-[#D4AF37]/90">21+</span>
              )}
            </div>
            {minPrice != null && (
              <span className="text-[#D4AF37] font-bold text-base shrink-0">
                ${(minPrice / 100).toFixed(0)}
              </span>
            )}
          </div>
          <div className="mt-2 w-full py-3 rounded-xl text-center font-bold text-[#121212] bg-[#D4AF37] group-hover:bg-[#E8B94B] transition-colors duration-[120ms] shadow-[0_0_20px_-5px_rgba(212,175,55,0.3)]">
            Buy
          </div>
        </div>
      </div>
    </Link>
  );
}
