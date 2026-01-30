'use client';

import { Drop } from '@lux-night/shared/types';
import DropCard from './DropCard';
import Link from 'next/link';

interface DropsListProps {
  drops: Drop[];
  isLoading: boolean;
  regionName?: string;
}

export default function DropsList({ drops, isLoading, regionName }: DropsListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="aspect-[4/5] w-full rounded-2xl bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (drops.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center rounded-2xl bg-white/[0.02] border border-white/5">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-3xl text-white/30">inventory_2</span>
        </div>
        <h3 className="text-lg font-bold text-white mb-2">No drops yet</h3>
        <p className="text-white/50 text-sm max-w-xs mx-auto mb-6">
          We haven't dropped any exclusive content in {regionName || 'this region'} yet. Stay tuned!
        </p>
        <Link href="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors text-sm">
            <span className="material-symbols-outlined text-sm">home</span>
            Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {drops.map((drop) => (
        <DropCard key={drop.id} drop={drop} />
      ))}
    </div>
  );
}
