'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PlaceAutocomplete from '@/components/PlaceAutocomplete';

type Region = { id: string; name: string; slug?: string; state?: string; country?: string; city?: string; center_lat?: number; center_lng?: number; is_active?: boolean };

export default function RegionalConfigPage() {
  const router = useRouter();
  const [list, setList] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPlaceId, setAddPlaceId] = useState('');
  const [addPlaceDesc, setAddPlaceDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Edit region
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPlaceId, setEditPlaceId] = useState('');
  const [editPlaceDesc, setEditPlaceDesc] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [r, me] = await Promise.all([
          fetch('/api/regions').then((x) => x.json()),
          fetch('/api/me').then((x) => x.json()),
        ]);
        if (r.data) setList(r.data);
        if (me?.roles?.is_admin) setIsAdmin(true);
        if (r.error && r.error !== 'UNAUTHENTICATED') setErr(r.error);
      } catch (e) {
        setErr('Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleAddPlace = (v: { place_id: string; description: string }) => {
    setAddPlaceId(v.place_id);
    setAddPlaceDesc(v.description);
  };

  const handleEditPlace = (v: { place_id: string; description: string }) => {
    setEditPlaceId(v.place_id);
    setEditPlaceDesc(v.description);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) {
      alert('Region display name is required.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body: { name: string; place_id?: string } = { name: editName.trim() };
      if (editPlaceId) body.place_id = editPlaceId;
      const res = await fetch(`/api/regions/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
          alert('GOOGLE_MAPS_API_KEY is not configured. Set it in .env to update region address from place.');
          return;
        }
        throw new Error(data?.message || data?.error || 'Failed to update');
      }
      setList((prev) => prev.map((r) => (r.id === editingId ? { ...r, ...data.data } : r)));
      setEditingId(null);
      setEditName('');
      setEditPlaceId('');
      setEditPlaceDesc('');
    } catch (e: unknown) {
      alert((e as Error)?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!addName.trim() || !addPlaceId) {
      alert('Please enter Region display name and select a base address (search and choose from the list).');
      return;
    }
    if (!process.env.NEXT_PUBLIC_APP_URL && typeof window !== 'undefined' && !(window as unknown as { __GOOGLE_MAPS__?: boolean }).__GOOGLE_MAPS__) {
      // env not available in browser; try anyway
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch('/api/regions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), place_id: addPlaceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
          alert('GOOGLE_MAPS_API_KEY is not configured. Set it in .env to add regions with address.');
          return;
        }
        throw new Error(data?.message || data?.error || 'Failed to create');
      }
      setList((prev) => [...prev, data.data]);
      setShowAdd(false);
      setAddName('');
      setAddPlaceId('');
      setAddPlaceDesc('');
    } catch (e: unknown) {
      alert((e as Error)?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-[430px] mx-auto bg-background-light dark:bg-background-dark font-display text-[#0c1d1d] dark:text-gray-100 min-h-screen pb-8">
      <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-xl font-bold">Regional Config</h1>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {err && <div className="p-3 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-sm">{err}</div>}

        {isAdmin && (
          <div>
            {!showAdd ? (
              <button
                onClick={() => setShowAdd(true)}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-primary/50 text-primary font-medium"
              >
                <span className="material-symbols-outlined">add</span>
                Add New Region
              </button>
            ) : (
              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                <h3 className="font-semibold">Add Region</h3>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Region display name *</label>
                  <input
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="e.g. Los Angeles"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Base address / city center *</label>
                  <PlaceAutocomplete
                    value={addPlaceDesc}
                    onSelect={handleAddPlace}
                    placeholder="Search and select an address..."
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowAdd(false); setAddName(''); setAddPlaceId(''); setAddPlaceDesc(''); }} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600">Cancel</button>
                  <button onClick={handleCreate} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Regions</h2>
          {loading ? (
            <div className="text-gray-500">Loading...</div>
          ) : list.length === 0 ? (
            <div className="text-gray-500 py-4">No regions yet.{isAdmin ? ' Add one above.' : ''}</div>
          ) : (
            <ul className="space-y-2">
              {list.map((r) =>
                editingId === r.id ? (
                  <li key={r.id} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                    <h3 className="font-semibold">Edit Region</h3>
                    <div>
                      <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Region display name *</label>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="e.g. Los Angeles"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current base: {[r.city, r.state, r.country].filter(Boolean).join(', ') || '—'}</p>
                      <PlaceAutocomplete
                        value={editPlaceDesc}
                        onSelect={handleEditPlace}
                        placeholder="Search to change base address (optional)"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingId(null); setEditName(''); setEditPlaceId(''); setEditPlaceDesc(''); }}
                        className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600"
                      >
                        Cancel
                      </button>
                      <button onClick={handleSaveEdit} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </li>
                ) : (
                  <li key={r.id} className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-gray-500 mt-1">{[r.city, r.state, r.country].filter(Boolean).join(', ') || r.slug || '—'}</div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => { setEditingId(r.id); setEditName(r.name); setEditPlaceId(''); setEditPlaceDesc(''); }}
                        className="shrink-0 p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
                      >
                        Edit
                      </button>
                    )}
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
