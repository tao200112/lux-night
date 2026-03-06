'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getDrop } from '@lux-night/shared/data/drops';
import type { Drop } from '@lux-night/shared/types';
import BottomTabBar from '@/components/ui/BottomTabBar';

export default function DropDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [drop, setDrop] = useState<Drop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!params.id) return;
    const dropId = Array.isArray(params.id) ? params.id[0] : params.id;
    
    setLoading(true);
    getDrop(dropId)
      .then((data) => {
        if (!data) throw new Error('Drop not found');
        setDrop(data);
      })
      .catch((err) => {
        console.error(err);
        setError('Failed to load content');
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !drop) {
    return (
      <div className="min-h-screen bg-background-dark flex flex-col items-center justify-center p-6 text-center text-white">
        <span className="material-symbols-outlined text-4xl text-white/30 mb-4">error_outline</span>
        <h3 className="text-lg font-bold mb-2">Unavailable</h3>
        <p className="text-white/50 text-sm mb-6">{error || 'This content does not exist.'}</p>
        <Link href="/drops" className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors font-medium text-sm">
          Back to Drops
        </Link>
      </div>
    );
  }

  const publishedDate = drop.published_at ? new Date(drop.published_at) : new Date(drop.created_at);
  const dateStr = publishedDate.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric',
    timeZone: 'America/New_York'
  });

  return (
    <div className="min-h-screen bg-background-dark text-white pb-24">
      {/* Navigation Layer */}
      <div className="fixed top-0 left-0 right-0 z-50 p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <button 
          onClick={() => router.back()} 
          className="pointer-events-auto flex items-center justify-center w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-black/60 transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
      </div>

      {/* Hero Poster */}
      <div className="relative w-full h-[60vh] md:h-[500px]">
        {drop.poster_url ? (
          <Image
            src={drop.poster_url}
            alt={drop.title}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="w-full h-full bg-surface-light flex items-center justify-center">
             <span className="material-symbols-outlined text-white/20 text-6xl">image</span>
          </div>
        )}
        {/* Bottom Fade */}
        <div className="absolute inset-0 bg-gradient-to-t from-background-dark via-background-dark/60 to-transparent" />
        
        {/* Floating Title Group (Overlapping Hero) */}
        <div className="absolute bottom-0 left-0 right-0 p-6 pt-12">
           <div className="max-w-md mx-auto">
              <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded bg-primary text-background-dark text-[10px] font-bold uppercase tracking-wider">
                    Published
                  </span>
                  <span className="text-xs text-white/60 font-medium">
                    {dateStr}
                  </span>
              </div>
              <h1 className="text-3xl font-bold leading-tight mb-2 drop-shadow-lg">
                {drop.title}
              </h1>
              {drop.subtitle && (
                <p className="text-lg text-white/80 font-medium leading-normal drop-shadow-md">
                  {drop.subtitle}
                </p>
              )}
           </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 relative z-10 -mt-2">
        <div className="max-w-md mx-auto">
          {/* Metadata Bar */}
          <div className="flex items-center justify-between py-4 border-b border-white/10 mb-6">
             <div className="flex items-center gap-2 text-primary">
                 <span className="material-symbols-outlined text-[18px]">location_on</span>
                 <span className="text-sm font-bold uppercase tracking-wide">
                   {drop.region?.name || 'Global'}
                 </span>
             </div>
             {/* Share Button (Mock) */}
             <button className="text-white/40 hover:text-white transition-colors">
                 <span className="material-symbols-outlined text-[20px]">ios_share</span>
             </button>
          </div>

          {/* Body Content */}
          <div className="prose prose-invert prose-p:text-white/80 prose-p:leading-relaxed prose-headings:text-white max-w-none">
             <div className="whitespace-pre-line text-base font-light">
               {drop.content}
             </div>
          </div>
        </div>
      </div>
      
      <BottomTabBar />
    </div>
  );
}
