'use client';

import React, { useState, useEffect } from 'react';
import { getRegions, type Region } from '@/lib/data/regions';
import { getEventsByRegion } from '@/lib/data/events';
import type { EventWithVenue } from '@/lib/data/events';
import { useAuth } from '@/contexts/AuthContext';
import { useRegion } from '@/contexts/RegionContext';
import { useRouter } from 'next/navigation';
import BottomTabBar from '@/components/ui/BottomTabBar';
import EventGlassCard from '@/components/EventGlassCard';

export default function DiscoverPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { region, setRegion } = useRegion();
  const [regions, setRegions] = useState<Region[]>([]);
  const [events, setEvents] = useState<EventWithVenue[]>([]);
  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?redirect=' + encodeURIComponent('/'));
      return;
    }
    getRegions().then(setRegions).catch(() => setRegions([]));
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!region?.id) return;
    let cancelled = false;
    setEventsError(null);
    setEventsLoading(true);
    getEventsByRegion(region.id)
      .then((d) => { if (!cancelled) setEvents(d); })
      .catch((e) => { if (!cancelled) setEventsError(e?.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setEventsLoading(false); });
    return () => { cancelled = true; };
  }, [region?.id]);

  const handleRegionSelect = (r: Region) => {
    setRegion(r.id);
    setIsRegionOpen(false);
  };

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
      {/* Region Picker Modal */}
      {isRegionOpen && (
        <div className="fixed inset-0 z-[60] bg-background-dark text-white font-display min-h-screen flex flex-col">
          <div className="fixed top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/5 rounded-full blur-[100px] pointer-events-none z-0" />
          <main className="relative z-10 flex-1 flex flex-col overflow-y-auto no-scrollbar pb-32">
            <header className="pt-8 pb-4 px-6 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="text-[32px] font-bold tracking-tight text-white leading-[1.1]">
                  Choose<br />your area
                </h2>
                <button
                  onClick={() => setIsRegionOpen(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </header>
            <section className="px-6 flex-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-white/30">Regions</h3>
              </div>
              {regions.length === 0 ? (
                <div className="text-center py-8 text-white/50">Loading regions...</div>
              ) : (
                <div className="flex flex-col space-y-2">
                  {regions.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => handleRegionSelect(r)}
                      className={`w-full group flex items-center justify-between py-4 px-2 rounded-lg transition-all ${r.id === region?.id ? 'bg-primary/10' : 'hover:bg-white/5'}`}
                    >
                      <span className={`text-xl font-medium ${r.id === region?.id ? 'text-primary' : 'text-white'}`}>{r.name}</span>
                      <span className="material-symbols-outlined text-white/40">chevron_right</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </main>
        </div>
      )}

      {/* Header: Region + no Bars/Filters */}
      <header className="sticky top-0 z-40 bg-background-dark/90 backdrop-blur-xl border-b border-white/5">
        <div className="px-4 py-4">
          <button
            onClick={() => setIsRegionOpen(true)}
            className="group relative flex items-center justify-center gap-2 bg-primary w-full px-5 py-3 rounded-full shadow-[0_0_15px_rgba(223,181,42,0.3)] active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-background-dark text-[20px]">location_on</span>
            <span className="text-background-dark font-bold text-sm tracking-wide uppercase">
              {region ? region.name : 'Choose your area'}
            </span>
            <span className="material-symbols-outlined text-background-dark text-[18px]">expand_more</span>
          </button>
        </div>
      </header>

      {/* Main: Events list or empty */}
      <main className="flex-1 overflow-y-auto pb-24 no-scrollbar">
        {!region && (
          <div className="mx-4 mt-6 p-6 rounded-xl bg-white/[0.05] backdrop-blur-md border border-[rgba(212,175,55,0.22)] text-center">
            <span className="material-symbols-outlined text-5xl text-white/30 mb-4">location_on</span>
            <h3 className="text-lg font-bold text-white mb-2">Choose your region</h3>
            <p className="text-white/50 text-sm mb-5">Select an area above to see events near you.</p>
            <button
              onClick={() => setIsRegionOpen(true)}
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
              onClick={() => setIsRegionOpen(true)}
              className="px-5 py-3 rounded-xl bg-primary/20 text-primary font-bold text-sm border border-[rgba(212,175,55,0.4)] hover:bg-primary/30 transition-colors"
            >
              Change region
            </button>
          </div>
        )}

        {region && !eventsLoading && !eventsError && events.length > 0 && (
          <section className="px-4 py-4 space-y-3">
            {events.map((event) => (
              <EventGlassCard key={event.id} event={event} />
            ))}
          </section>
        )}
      </main>

      <BottomTabBar />
    </div>
  );
}
