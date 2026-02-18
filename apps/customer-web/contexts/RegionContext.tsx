'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import type { Region } from '@/lib/data/regions';
import { getRegions } from '@/lib/data/regions';

const LUX_REGION_ID = 'lux_region_id';
/** Distance threshold (km) for geolocation match */
const GEO_MATCH_KM = 150;

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  const geoAttempted = useRef(false);

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
        const r = data.region;
        setRegionState({
          id: r.id,
          name: r.name,
          state: r.state ?? null,
          country: r.country ?? 'US',
          lat: r.lat ?? null,
          lng: r.lng ?? null,
          center_lat: r.center_lat ?? null,
          center_lng: r.center_lng ?? null,
          city: r.city ?? null,
          is_active: r.is_active ?? true,
          created_at: r.created_at ?? '',
          updated_at: r.updated_at ?? '',
        });
        if (typeof window !== 'undefined') localStorage.setItem(LUX_REGION_ID, regionId);
      }
    } catch (e) {
      console.error('[RegionContext] setRegion failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Rehydrate from localStorage or try geolocation (only when no region yet)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (region) return;
    if (geoAttempted.current) return;
    geoAttempted.current = true;

    const fallbackToFirstRegion = () => {
      getRegions().then((regions) => {
        if (regions.length > 0) setRegion(regions[0].id);
      });
    };

    const tryGeolocation = () => {
      if (!navigator.geolocation) {
        fallbackToFirstRegion();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          getRegions().then((regions) => {
            let nearest: Region | null = null;
            let minDist = Infinity;
            for (const r of regions) {
              const clat = r.center_lat ?? r.lat;
              const clng = r.center_lng ?? r.lng;
              if (clat == null || clng == null) continue;
              const d = haversineKm(lat, lng, clat, clng);
              if (d < minDist && d <= GEO_MATCH_KM) {
                minDist = d;
                nearest = r;
              }
            }
            if (nearest) setRegion(nearest.id);
            else fallbackToFirstRegion();
          });
        },
        () => fallbackToFirstRegion(),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
      );
    };

    const id = localStorage.getItem(LUX_REGION_ID);
    if (id) {
      let cancelled = false;
      fetch('/api/region/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ regionId: id }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled && data?.ok && data?.region) {
            const r = data.region;
            setRegionState({
              id: r.id,
              name: r.name,
              state: r.state ?? null,
              country: r.country ?? 'US',
              lat: r.lat ?? null,
              lng: r.lng ?? null,
              center_lat: r.center_lat ?? null,
              center_lng: r.center_lng ?? null,
              city: r.city ?? null,
              is_active: r.is_active ?? true,
              created_at: r.created_at ?? '',
              updated_at: r.updated_at ?? '',
            });
          } else if (!cancelled) {
            tryGeolocation();
          }
        })
        .catch(() => {
          if (!cancelled) tryGeolocation();
        });
      return () => { cancelled = true; };
    }
    tryGeolocation();
  }, [region, setRegion]);

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
