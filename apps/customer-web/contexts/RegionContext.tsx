'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { Region } from '@/lib/data/regions';

interface RegionContextType {
  region: Region | null;
  setRegion: (regionId: string) => Promise<void>;
  loading: boolean;
}

const RegionContext = createContext<RegionContextType | undefined>(undefined);

export function RegionProvider({
  children,
  initialRegion,
}: {
  children: ReactNode;
  initialRegion: Region | null;
}) {
  const [region, setRegionState] = useState<Region | null>(initialRegion);
  const [loading, setLoading] = useState(false);

  const setRegion = useCallback(async (regionId: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/region/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ regionId }),
      });
      const data = await res.json();
      if (data.ok && data.region) {
        setRegionState(data.region);
      }
    } catch (e) {
      console.error('[RegionContext] setRegion failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <RegionContext.Provider value={{ region, setRegion, loading }}>
      {children}
    </RegionContext.Provider>
  );
}

export function useRegion(): RegionContextType {
  const ctx = useContext(RegionContext);
  if (!ctx) {
    throw new Error('useRegion must be used within RegionProvider');
  }
  return ctx;
}
