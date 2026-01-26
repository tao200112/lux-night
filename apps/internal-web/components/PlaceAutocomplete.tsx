'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

export interface PlaceSuggestion {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text: string;
}

interface PlaceAutocompleteProps {
  value?: string;
  placeholder?: string;
  onSelect: (v: { place_id: string; description: string }) => void;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
}

export default function PlaceAutocomplete({
  value = '',
  placeholder = 'Search address...',
  onSelect,
  disabled,
  className = '',
  inputClassName = '',
}: PlaceAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [list, setList] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setList([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Search unavailable');
        setList([]);
        return;
      }
      setList(data.predictions || []);
    } catch {
      setError('Search failed');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!query.trim()) {
      setList([]);
      setOpen(false);
      return;
    }
    debounce.current = setTimeout(() => fetchSuggestions(query), 280);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, fetchSuggestions]);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (s: PlaceSuggestion) => {
    setQuery(s.description);
    setList([]);
    setOpen(false);
    onSelect({ place_id: s.place_id, description: s.description });
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => query.length >= 2 && setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={`w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${inputClassName}`}
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
        </div>
      )}
      {error && (
        <p className="text-red-500 text-xs mt-1">{error}</p>
      )}
      {open && list.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg max-h-60 overflow-y-auto">
          {list.map((s) => (
            <li key={s.place_id}>
              <button
                type="button"
                onClick={() => handleSelect(s)}
                className="w-full text-left px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0"
              >
                <div className="font-medium text-gray-900 dark:text-white truncate">{s.main_text || s.description}</div>
                {s.secondary_text && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.secondary_text}</div>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
