'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getEventsByRegion } from '@/lib/data/events';
import { useEventsRealtime } from '@/hooks/useEventsRealtime';
import type { EventWithVenue } from '@/lib/data/events';
import { useAuth } from '@/contexts/AuthContext';
import { useRegion } from '@/contexts/RegionContext';
import { useRouter } from 'next/navigation';
import { getRegions } from '@/lib/data/regions';
import BottomTabBar from '@/components/ui/BottomTabBar';
import TopBar from '@/components/ui/TopBar';
import EventCard from '@/components/discover/EventCard';

export default function DiscoverPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { region, setRegion } = useRegion();
  const [events, setEvents] = useState<EventWithVenue[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?redirect=' + encodeURIComponent('/'));
      return;
    }
  }, [user, authLoading, router]);

  // If only one region exists, auto-select and skip Choose Area
  useEffect(() => {
    if (region) return;
    let cancelled = false;
    getRegions()
      .then((regions) => {
        if (!cancelled && regions.length === 1) {
          setRegion(regions[0].id);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [region, setRegion]);

  const fetchEvents = useCallback(() => {
    if (!region?.id) return;
    setEventsError(null);
    setEventsLoading(true);
    getEventsByRegion(region.id)
      .then(setEvents)
      .catch((e) => setEventsError(e?.message || 'Failed to load'))
      .finally(() => setEventsLoading(false));
  }, [region?.id]);

  useEffect(() => {
    if (!region?.id) return;
    fetchEvents();
  }, [region?.id, fetchEvents]);

  useEventsRealtime(fetchEvents);

  if (authLoading) {
    return (
      <div className="relative w-full max-w-md mx-auto min-h-screen flex flex-col bg-background-dark overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="relative w-full max-w-md mx-auto min-h-screen flex flex-col bg-background-dark overflow-hidden shadow-2xl">
      <TopBar />

      {/* Main: Events list or empty */}
      <main className="flex-1 overflow-y-auto pb-24 no-scrollbar">
        {!region && (
          <div className="mx-4 mt-6 p-6 rounded-xl bg-white/[0.05] backdrop-blur-md border border-[rgba(212,175,55,0.22)] text-center">
            <span className="material-symbols-outlined text-5xl text-white/30 mb-4">location_on</span>
            <h3 className="text-lg font-bold text-white mb-2">Choose your region</h3>
            <p className="text-white/50 text-sm mb-5">Select an area above to see events near you.</p>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('lux-open-region-picker'))}
              className="px-5 py-3 rounded-xl bg-primary text-background-dark font-bold text-sm hover:opacity-90 transition-opacity"
            >
              Choose Area
            </button>
          </div>
        )}

        {region && eventsLoading && (
          <div className="px-4 py-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {region && !eventsLoading && eventsError && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <span className="material-symbols-outlined text-5xl text-red-400/80 mb-4">error</span>
            <p className="text-white/80 mb-4">{eventsError}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-3 rounded-xl bg-white/10 text-white font-medium"
            >
              Try again
            </button>
          </div>
        )}

        {region && !eventsLoading && !eventsError && events.length === 0 && (
          <div className="mx-4 mt-6 p-6 rounded-xl bg-white/[0.05] backdrop-blur-md border border-[rgba(212,175,55,0.22)] text-center">
            <span className="material-symbols-outlined text-5xl text-white/30 mb-4">event_busy</span>
            <h3 className="text-lg font-bold text-white mb-2">No events in {region.name}</h3>
            <p className="text-white/50 text-sm mb-5">Try another region or check back later.</p>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('lux-open-region-picker'))}
              className="px-5 py-3 rounded-xl bg-primary/20 text-primary font-bold text-sm border border-[rgba(212,175,55,0.4)] hover:bg-primary/30 transition-colors"
            >
              Change region
            </button>
          </div>
        )}

        {region && !eventsLoading && !eventsError && events.length > 0 && (
          <section className="px-4 py-4 space-y-4">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </section>
        )}
      </main>

      <BottomTabBar />
    </div>
  );
}
