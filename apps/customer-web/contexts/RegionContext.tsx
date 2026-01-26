'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { Region } from '@/lib/data/regions';

const LUX_REGION_ID = 'lux_region_id';

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

  // 客户端 rehydrate：若 SSR 无 initialRegion 但 localStorage 有 lux_region_id，调用 set API 同步 cookie 并恢复 state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (initialRegion) return;
    const id = localStorage.getItem(LUX_REGION_ID);
    if (!id) return;
    let cancelled = false;
    fetch('/api/region/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ regionId: id }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.ok && data?.region) setRegionState(data.region);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [initialRegion]);

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
        if (typeof window !== 'undefined') localStorage.setItem(LUX_REGION_ID, regionId);
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
