'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PlaceAutocomplete from '@/components/PlaceAutocomplete';

type Region = { id: string; name: string; slug?: string; city?: string; state?: string; country?: string };
type Venue = {
  id: string;
  name: string;
  region_id: string;
  city?: string | null;
  state?: string | null;
  formatted_address?: string | null;
  address_line2?: string | null;
};

export default function VenuesSettingsPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addRegionId, setAddRegionId] = useState('');
  const [addPlaceId, setAddPlaceId] = useState('');
  const [addPlaceDesc, setAddPlaceDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddressLine2, setEditAddressLine2] = useState('');
  const [editPlaceId, setEditPlaceId] = useState('');
  const [editPlaceDesc, setEditPlaceDesc] = useState('');
  const [noWorkspace, setNoWorkspace] = useState(false);

  const load = async () => {
    setErr(null);
    setNoWorkspace(false);
    try {
      const [vRes, rRes] = await Promise.all([
        fetch('/api/merchant/venues').then((x) => x.json()),
        fetch('/api/regions').then((x) => x.json()),
      ]);
      if (vRes.data) setVenues(vRes.data);
      else if (vRes.error === 'NO_WORKSPACE') setNoWorkspace(true);
      else if (vRes.error && vRes.error !== 'UNAUTHENTICATED') setErr(vRes.error);
      if (rRes.data) setRegions(rRes.data);
    } catch {
      setErr('Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAddPlace = (v: { place_id: string; description: string }) => {
    setAddPlaceId(v.place_id);
    setAddPlaceDesc(v.description);
  };

  const handleEditPlace = (v: { place_id: string; description: string }) => {
    setEditPlaceId(v.place_id);
    setEditPlaceDesc(v.description);
  };

  const handleCreate = async () => {
    if (!addName.trim() || !addRegionId || !addPlaceId) {
      alert('Please enter venue name, select a region, and select an address (search and choose from the list).');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch('/api/merchant/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), region_id: addRegionId, place_id: addPlaceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
          alert('GOOGLE_MAPS_API_KEY is not configured. Set it in .env to add venues with address search.');
          return;
        }
        if (data?.code === 'PLACE_ID_DUPLICATE') {
          alert('This address is already used by another venue. Choose a different place.');
          return;
        }
        throw new Error(data?.error || data?.message || 'Failed to create');
      }
      setVenues((prev) => [...prev, data.data]);
      setShowAdd(false);
      setAddName('');
      setAddRegionId('');
      setAddPlaceId('');
      setAddPlaceDesc('');
    } catch (e: unknown) {
      alert((e as Error)?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    if (!editName.trim()) {
      alert('Venue name is required.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body: { name: string; address_line2?: string; place_id?: string } = { name: editName.trim() };
      body.address_line2 = editAddressLine2.trim(); // API converts '' to null
      if (editPlaceId) body.place_id = editPlaceId;
      const res = await fetch(`/api/merchant/venues/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
          alert('GOOGLE_MAPS_API_KEY is not configured. Set it in .env to update venue address from place.');
          return;
        }
        if (data?.code === 'PLACE_ID_DUPLICATE') {
          alert('This address is already used by another venue. Choose a different place.');
          return;
        }
        throw new Error(data?.error || data?.message || 'Failed to update');
      }
      setVenues((prev) => prev.map((v) => (v.id === editingId ? { ...v, ...data.data } : v)));
      setEditingId(null);
      setEditName('');
      setEditAddressLine2('');
      setEditPlaceId('');
      setEditPlaceDesc('');
    } catch (e: unknown) {
      alert((e as Error)?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (v: Venue) => {
    setEditingId(v.id);
    setEditName(v.name);
    setEditAddressLine2(v.address_line2 || '');
    setEditPlaceId('');
    setEditPlaceDesc('');
  };

  return (
    <div className="w-full max-w-[430px] mx-auto bg-background-light dark:bg-background-dark font-display text-[#0c1d1d] dark:text-gray-100 min-h-screen pb-8">
      <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-xl font-bold">Venues</h1>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {err && <div className="p-3 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-sm">{err}</div>}
        {noWorkspace && (
          <div className="p-3 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
            Select a workspace first to manage venues.
          </div>
        )}

        {!noWorkspace && (
          <div>
            {!showAdd ? (
              <button
                onClick={() => setShowAdd(true)}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-primary/50 text-primary font-medium"
              >
                <span className="material-symbols-outlined">add</span>
                Add Venue
              </button>
            ) : (
              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                <h3 className="font-semibold">Add Venue</h3>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Venue name (storefront) *</label>
                  <input
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="e.g. Downtown Lounge"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Region *</label>
                  <select
                    value={addRegionId}
                    onChange={(e) => setAddRegionId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  >
                    <option value="">Select region</option>
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Address * (search and select)</label>
                  <PlaceAutocomplete
                    value={addPlaceDesc}
                    onSelect={handleAddPlace}
                    placeholder="Search and select an address..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowAdd(false); setAddName(''); setAddRegionId(''); setAddPlaceId(''); setAddPlaceDesc(''); }}
                    className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600"
                  >
                    Cancel
                  </button>
                  <button onClick={handleCreate} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Your Venues</h2>
          {loading ? (
            <div className="text-gray-500">Loading...</div>
          ) : venues.length === 0 ? (
            <div className="text-gray-500 py-4">No venues yet.{!noWorkspace ? ' Add one above.' : ''}</div>
          ) : (
            <ul className="space-y-2">
              {venues.map((v) =>
                editingId === v.id ? (
                  <li key={v.id} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                    <h3 className="font-semibold">Edit Venue</h3>
                    <div>
                      <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Venue name *</label>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Address line 2 (optional, e.g. suite/unit)</label>
                      <input
                        value={editAddressLine2}
                        onChange={(e) => setEditAddressLine2(e.target.value)}
                        placeholder="Suite 101"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current: {v.formatted_address || v.city || '—'}</p>
                      <PlaceAutocomplete
                        value={editPlaceDesc}
                        onSelect={handleEditPlace}
                        placeholder="Search to change address (optional)"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingId(null); setEditName(''); setEditAddressLine2(''); setEditPlaceId(''); setEditPlaceDesc(''); }}
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
                  <li key={v.id} className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{v.name}</div>
                      <div className="text-xs text-gray-500 mt-1 truncate">{[v.city, v.state].filter(Boolean).join(', ') || v.formatted_address || '—'}</div>
                    </div>
                    <button
                      onClick={() => startEdit(v)}
                      className="shrink-0 p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
                    >
                      Edit
                    </button>
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
