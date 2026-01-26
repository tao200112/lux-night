'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRegion } from '@/contexts/RegionContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getDropsByRegion } from '@/lib/data/events';
import type { EventWithVenue } from '@/lib/data/events';
import BottomTabBar from '@/components/ui/BottomTabBar';
import EventGlassCard from '@/components/EventGlassCard';

export default function DropsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { region } = useRegion();
  const [items, setItems] = useState<EventWithVenue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=' + encodeURIComponent('/drops'));
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!region?.id) return;
    let cancelled = false;
    setError(null);
    setLoading(true);
    getDropsByRegion(region.id)
      .then((d) => { if (!cancelled) setItems(d); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [region?.id]);

  if (authLoading) {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col bg-background-dark text-white pb-24">
      <header className="sticky top-0 z-10 px-6 py-4 bg-background-dark/95 backdrop-blur-md border-b border-white/5">
        <h1 className="text-xl font-bold tracking-tight">Drops</h1>
        {region && <p className="text-white/50 text-sm mt-1">{region.name}</p>}
      </header>

      <main className="flex-1 px-6 py-6">
        {!region && (
          <div className="mx-0 p-6 rounded-xl bg-white/[0.05] backdrop-blur-md border border-[rgba(212,175,55,0.22)] text-center">
            <span className="material-symbols-outlined text-5xl text-white/30 mb-4">location_off</span>
            <h3 className="text-lg font-bold text-white mb-2">Choose your region</h3>
            <p className="text-white/50 text-sm mb-5">Select a region on Home to see drops in your area.</p>
            <Link href="/" className="inline-flex px-5 py-3 rounded-xl bg-primary text-background-dark font-bold text-sm hover:opacity-90 transition-opacity">
              Go to Home
            </Link>
          </div>
        )}

        {region && loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {region && !loading && error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="material-symbols-outlined text-5xl text-red-400/80 mb-4">error</span>
            <p className="text-white/80 mb-4">{error}</p>
            <button onClick={() => window.location.reload()} className="px-5 py-3 rounded-xl bg-white/10 text-white font-medium">Try again</button>
          </div>
        )}

        {region && !loading && !error && items.length === 0 && (
          <div className="p-6 rounded-xl bg-white/[0.05] backdrop-blur-md border border-[rgba(212,175,55,0.22)] text-center">
            <span className="material-symbols-outlined text-5xl text-white/30 mb-4">inventory_2</span>
            <h3 className="text-lg font-bold text-white mb-2">No drops in {region.name}</h3>
            <p className="text-white/50 text-sm">Check back later for new drops.</p>
          </div>
        )}

        {region && !loading && !error && items.length > 0 && (
          <div className="space-y-3">
            {items.map((event) => (
              <EventGlassCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </main>

      <BottomTabBar />
    </div>
  );
}
