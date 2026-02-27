'use client';

import React, { useState, useEffect, useCallback } from 'react';
import PlaceAutocomplete from './PlaceAutocomplete';

export interface CitySelectResult {
  city: string;
  state?: string;
  country?: string;
  center_lat?: number;
  center_lng?: number;
}

interface CitySelectProps {
  country: string;
  state: string;
  value: string;
  onChange: (v: CitySelectResult) => void;
  disabled?: boolean;
  hasPlacesKey: boolean;
  className?: string;
}

/**
 * 方式 A：从 DB regions 已有 city 下拉选择；
 * 方式 B：当 A 无数据时，用 Google Places (types=cities) 选城市，解析 city/state/country/center。
 */
export default function CitySelect({
  country,
  state,
  value,
  onChange,
  disabled,
  hasPlacesKey,
  className = '',
}: CitySelectProps) {
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showGoogle, setShowGoogle] = useState(false);
  const [googlePlaceDesc, setGooglePlaceDesc] = useState('');

  const fetchCities = useCallback(async () => {
    if (!state || !country) {
      setCities([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/regions/cities?state=${encodeURIComponent(state)}&country=${encodeURIComponent(country)}`);
      const data = await res.json();
      setCities((data.success && data.data) ? data.data : []);
    } catch {
      setCities([]);
    } finally {
      setLoading(false);
    }
  }, [state, country]);

  useEffect(() => {
    fetchCities();
    setShowGoogle(false);
    setGooglePlaceDesc('');
  }, [fetchCities]);

  const handleGoogleSelect = async (v: { place_id: string; description: string }) => {
    setGooglePlaceDesc(v.description);
    const res = await fetch('/api/admin/places/details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ place_id: v.place_id }),
    });
    const d = await res.json();
    if (res.ok && d && (d.city || d.formatted_address)) {
      onChange({
        city: d.city || d.formatted_address || v.description,
        state: d.state || state,
        country: d.country || country,
        center_lat: d.lat,
        center_lng: d.lng,
      });
    }
  };

  if (!state) {
    return (
      <div className={`text-sm text-slate-500 dark:text-slate-400 ${className}`}>
        Select state first
      </div>
    );
  }

  if (loading) {
    return <div className={`text-sm text-slate-500 ${className}`}>Loading cities…</div>;
  }

  // 方式 A：有 DB cities 时显示下拉 + 始终提供 Google 添加新城市
  if (cities.length > 0 && !showGoogle) {
    return (
      <div className={className}>
        <select
          value={value}
          onChange={(e) => onChange({ city: e.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Select city</option>
          {value && !cities.includes(value) && <option value={value}>{value}</option>}
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {hasPlacesKey && (
          <button
            type="button"
            onClick={() => setShowGoogle(true)}
            disabled={disabled}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Or add a new city (Google)
          </button>
        )}
      </div>
    );
  }

  // 方式 B：无 DB cities，或用户点击了 Google 添加新城市
  if (!showGoogle) {
    return (
      <div className={className}>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
          No cities in DB for this state. Add a region with city first, or:
        </p>
        {hasPlacesKey ? (
          <button
            type="button"
            onClick={() => setShowGoogle(true)}
            disabled={disabled}
            className="px-3 py-2 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary/10"
          >
            Select city center (Google)
          </button>
        ) : (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            GOOGLE_MAPS_API_KEY not configured. Set it in .env to select a city.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Select city (Google)</label>
      <PlaceAutocomplete
        types="cities"
        value={googlePlaceDesc}
        onSelect={handleGoogleSelect}
        placeholder="Search city…"
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => { setShowGoogle(false); setGooglePlaceDesc(''); }}
        className="mt-1 text-xs text-slate-500 hover:underline"
      >
        Back to options
      </button>
    </div>
  );
}
