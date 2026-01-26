'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PlaceAutocomplete from '@/components/PlaceAutocomplete';
import AdminBottomNav from '@/components/admin/AdminBottomNav';

type Region = { id: string; name: string; state?: string | null; country?: string | null };
type Merchant = { id: string; name: string };
type Venue = {
  id: string;
  name: string;
  region_id: string;
  city?: string | null;
  state?: string | null;
  formatted_address?: string | null;
  address_line2?: string | null;
  region?: { id: string; name: string } | null;
  merchant?: { id: string; name: string };
};

export default function SettingsVenuesPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addMerchantId, setAddMerchantId] = useState('');
  const [addRegionId, setAddRegionId] = useState('');
  const [addPlaceId, setAddPlaceId] = useState('');
  const [addPlaceDesc, setAddPlaceDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddressLine2, setEditAddressLine2] = useState('');
  const [editPlaceId, setEditPlaceId] = useState('');
  const [editPlaceDesc, setEditPlaceDesc] = useState('');
  const [hasPlacesKey, setHasPlacesKey] = useState(true);

  const load = async () => {
    setErr(null);
    try {
      const [vRes, mRes, rRes, statusRes] = await Promise.all([
        fetch('/api/admin/venues').then((r) => r.json()),
        fetch('/api/admin/merchants').then((r) => r.json()),
        fetch('/api/admin/regions').then((r) => r.json()),
        fetch('/api/admin/places/status').then((r) => r.json()).catch(() => ({ configured: false })),
      ]);
      if (vRes.success && vRes.data) setVenues(vRes.data);
      else if (vRes.error) setErr(vRes.error?.message || vRes.error);
      setMerchants(mRes?.data?.merchants || mRes?.merchants || []);
      if (rRes.success && rRes.data) setRegions(rRes.data);
      setHasPlacesKey(!!statusRes?.configured);
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
    if (!addName.trim() || !addMerchantId || !addRegionId || !addPlaceId) {
      alert('Please enter venue name, select merchant, region, and address (search and choose).');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addName.trim(),
          merchant_id: addMerchantId,
          region_id: addRegionId,
          place_id: addPlaceId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.error?.code === 'CONFIG') {
          alert('GOOGLE_MAPS_API_KEY not configured. Set it in .env to add venues.');
          return;
        }
        if (data.error?.code === 'PLACE_ID_DUPLICATE') {
          alert('This address is already used by another venue.');
          return;
        }
        throw new Error(data.error?.message || data.error || 'Failed to create');
      }
      setVenues((p) => [...p, data.data]);
      setShowAdd(false);
      setAddName('');
      setAddMerchantId('');
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
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const body: { name: string; address_line2?: string; place_id?: string } = { name: editName.trim() };
      body.address_line2 = editAddressLine2.trim();
      if (editPlaceId) body.place_id = editPlaceId;
      const res = await fetch(`/api/admin/venues/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.error && (String(data.error).includes('GOOGLE_MAPS') || data.status === 503)) {
          alert('GOOGLE_MAPS_API_KEY not configured. Set it in .env to update venue address.');
          return;
        }
        if (data.code === 'PLACE_ID_DUPLICATE' || (data.error && String(data.error).includes('already used'))) {
          alert('This address is already used by another venue.');
          return;
        }
        throw new Error(data.error || 'Failed to update');
      }
      setVenues((p) => p.map((v) => (v.id === editingId ? { ...v, ...data.data } : v)));
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
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-background-light dark:bg-background-dark border-x border-border-light dark:border-border-dark shadow-2xl">
      <header className="sticky top-0 z-50 flex items-center justify-between bg-surface-light/95 dark:bg-surface-dark/95 backdrop-blur-md px-4 py-3 border-b border-border-light dark:border-border-dark">
        <button onClick={() => router.back()} className="flex size-10 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-primary dark:text-white">
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="text-base font-bold uppercase tracking-wide text-primary dark:text-white">Venues</h1>
        <div className="w-10" />
      </header>

      <main className="flex-1 flex flex-col p-4 gap-6 pb-24">
        {err && <div className="p-3 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-sm">{err}</div>}

        <div>
          {!showAdd ? (
            <button
              onClick={() => { setShowAdd(true); setAddName(''); setAddMerchantId(''); setAddRegionId(''); setAddPlaceId(''); setAddPlaceDesc(''); }}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-primary/50 text-primary font-medium"
            >
              <span className="material-symbols-outlined">add</span>
              Add Venue
            </button>
          ) : (
            <div className="p-4 rounded-xl border border-border-light dark:border-border-dark space-y-3">
              <h3 className="font-semibold">Add Venue</h3>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Venue name *</label>
                <input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Downtown Lounge"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Merchant *</label>
                <select
                  value={addMerchantId}
                  onChange={(e) => setAddMerchantId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
                >
                  <option value="">Select merchant</option>
                  {merchants.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Region *</label>
                <select
                  value={addRegionId}
                  onChange={(e) => setAddRegionId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
                >
                  <option value="">Select region</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Address * (search and select)</label>
                {!hasPlacesKey ? (
                  <p className="text-amber-600 dark:text-amber-400 text-sm py-2">GOOGLE_MAPS_API_KEY not configured. Set it in .env to add venues.</p>
                ) : (
                  <PlaceAutocomplete types="address" value={addPlaceDesc} onSelect={handleAddPlace} placeholder="Search and select an address..." />
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600">Cancel</button>
                <button onClick={handleCreate} disabled={saving || !hasPlacesKey} className="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">All Venues</h2>
          {loading ? <div className="text-gray-500">Loading...</div> : venues.length === 0 ? <div className="text-gray-500 py-4">No venues yet.</div> : (
            <ul className="space-y-2">
              {venues.map((v) =>
                editingId === v.id ? (
                  <li key={v.id} className="p-4 rounded-xl border border-border-light dark:border-border-dark space-y-3">
                    <h3 className="font-semibold">Edit Venue</h3>
                    <div><label className="block text-sm text-gray-500 mb-1">Name *</label><input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm" /></div>
                    <div><label className="block text-sm text-gray-500 mb-1">Address line 2 (optional)</label><input value={editAddressLine2} onChange={(e) => setEditAddressLine2(e.target.value)} placeholder="Suite 101" className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm" /></div>
                    <div><p className="text-xs text-gray-500 mb-1">Current: {v.formatted_address || (v as { address?: string }).address || v.city || '—'}</p>{hasPlacesKey ? <PlaceAutocomplete types="address" value={editPlaceDesc} onSelect={handleEditPlace} placeholder="Search to change address (optional)" /> : <p className="text-amber-600 text-sm">GOOGLE_MAPS_API_KEY not configured. Set it in .env to change address.</p>}</div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingId(null); }} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600">Cancel</button>
                      <button onClick={handleSaveEdit} disabled={saving || (!!editPlaceId && !hasPlacesKey)} className="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
                    </div>
                  </li>
                ) : (
                  <li key={v.id} className="p-3 rounded-xl border border-border-light dark:border-border-dark flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{v.name}</div>
                      <div className="text-xs text-gray-500 truncate line-clamp-2">{v.formatted_address || (v as { address?: string }).address || [v.city, v.state].filter(Boolean).join(', ') || '—'}</div>
                    </div>
                    <button onClick={() => startEdit(v)} className="shrink-0 p-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm">Edit</button>
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      </main>
      <AdminBottomNav pendingCount={0} />
    </div>
  );
}
