'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRegion } from '@/contexts/RegionContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getPublishedDrops } from '@lux-night/shared/data/drops';
import type { Drop } from '@lux-night/shared/types';
import BottomTabBar from '@/components/ui/BottomTabBar';
import TopBar from '@/components/ui/TopBar';
import DropsList from './components/DropsList';

export default function DropsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { region } = useRegion();
  const [items, setItems] = useState<Drop[]>([]);
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
    // Use Shared Data Function
    getPublishedDrops(region.id)
      .then((d) => { if (!cancelled) setItems(d); })
      .catch((e) => { 
          if (!cancelled) {
              console.error(e);
              setError('Failed to load drops');
          } 
      })
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
      <TopBar />

      <main className="flex-1 px-4 py-6">
        {!region ? (
          <div className="mx-0 p-8 rounded-2xl bg-white/[0.05] backdrop-blur-md border border-[rgba(212,175,55,0.22)] text-center shadow-2xl">
            <div className="bg-primary/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="material-symbols-outlined text-3xl text-primary font-light">location_off</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Location Required</h3>
            <p className="text-white/50 text-sm mb-8 leading-relaxed">
                Please select your city to see exclusive drops and events near you.
            </p>
            <Link href="/" className="inline-flex w-full justify-center px-5 py-3 rounded-xl bg-primary text-background-dark font-bold text-sm hover:opacity-90 active:scale-95 transition-all">
              Select Region
            </Link>
          </div>
        ) : (
             <DropsList drops={items} isLoading={loading} regionName={region.name} />
        )}

        {region && !loading && error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="material-symbols-outlined text-4xl text-red-400/80 mb-4">error_outline</span>
            <p className="text-white/70 mb-6 text-sm">{error}</p>
            <button onClick={() => window.location.reload()} className="px-6 py-2 rounded-full bg-white/10 text-white font-medium hover:bg-white/20 transition-colors text-sm">
                Try again
            </button>
          </div>
        )}
      </main>

      <BottomTabBar />
    </div>
  );
}

