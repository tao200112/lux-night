'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageContainer from '@/components/admin/PageContainer';

type Region = { id: string; name: string; city?: string | null; state?: string | null; country?: string | null };
type Merchant = { id: string; name: string; region_id?: string };
type Venue = {
  id: string;
  name: string;
  region_id: string;
  merchant_id?: string;
  address_line1?: string | null;
  address_line2?: string | null;
  formatted_address?: string | null;
  region?: { id: string; name: string; city?: string | null; state?: string | null } | null;
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
  const [addAddressLine1, setAddAddressLine1] = useState('');
  const [addAddressLine2, setAddAddressLine2] = useState('');
  const [addPostalCode, setAddPostalCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddressLine1, setEditAddressLine1] = useState('');
  const [editAddressLine2, setEditAddressLine2] = useState('');
  const [editPostalCode, setEditPostalCode] = useState('');

  // 根据选中的 merchant 显示继承的 region
  const selectedMerchant = merchants.find(m => m.id === addMerchantId);
  const inheritedRegion = selectedMerchant?.region_id ? regions.find(r => r.id === selectedMerchant.region_id) : null;

  const load = async () => {
    setErr(null);
    try {
      const [vRes, mRes, rRes] = await Promise.all([
        fetch('/api/admin/venues').then((r) => r.json()),
        fetch('/api/admin/merchants').then((r) => r.json()),
        fetch('/api/admin/regions').then((r) => r.json()),
      ]);
      if (vRes.success && vRes.data) setVenues(vRes.data);
      else if (vRes.error) setErr(vRes.error?.message || vRes.error);
      // merchants 可能在 data.merchants 或直接 merchants
      const merchantList = mRes?.data?.merchants || mRes?.merchants || [];
      setMerchants(merchantList);
      if (rRes.success && rRes.data) setRegions(rRes.data);
    } catch {
      setErr('Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!addName.trim() || !addMerchantId || !addAddressLine1.trim()) {
      alert('Please enter venue name, select merchant, and provide street address.');
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
          address_line1: addAddressLine1.trim(),
          address_line2: addAddressLine2.trim() || null,
          postal_code: addPostalCode.trim() || null,
          // region_id 由后端自动继承 merchant.region_id
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.error || 'Failed to create');
      }
      setVenues((p) => [...p, data.data]);
      setShowAdd(false);
      setAddName('');
      setAddMerchantId('');
      setAddAddressLine1('');
      setAddAddressLine2('');
      setAddPostalCode('');
    } catch (e: unknown) {
      alert((e as Error)?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim() || !editAddressLine1.trim()) {
      alert('Name and street address are required.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body = {
        name: editName.trim(),
        address_line1: editAddressLine1.trim(),
        address_line2: editAddressLine2.trim() || null,
        postal_code: editPostalCode.trim() || null,
      };
      const res = await fetch(`/api/admin/venues/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update');
      }
      setVenues((p) => p.map((v) => (v.id === editingId ? { ...v, ...data.data } : v)));
      setEditingId(null);
      setEditName('');
      setEditAddressLine1('');
      setEditAddressLine2('');
      setEditPostalCode('');
    } catch (e: unknown) {
      alert((e as Error)?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (v: Venue) => {
    setEditingId(v.id);
    setEditName(v.name);
    setEditAddressLine1(v.address_line1 || '');
    setEditAddressLine2(v.address_line2 || '');
    setEditPostalCode(''); // postal_code 尚未在 venues 表暴露，可选
  };

  // 显示地址：address_line1 + Region city/state
  const formatAddress = (v: Venue) => {
    const line1 = v.address_line1 || v.formatted_address || '';
    const cityState = v.region ? [v.region.city || v.region.name, v.region.state].filter(Boolean).join(', ') : '';
    if (line1 && cityState) return `${line1}, ${cityState}`;
    return line1 || cityState || '—';
  };

  return (
    <PageContainer className="overflow-x-hidden bg-background-light dark:bg-background-dark">
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
              onClick={() => { setShowAdd(true); setAddName(''); setAddMerchantId(''); setAddAddressLine1(''); setAddAddressLine2(''); setAddPostalCode(''); }}
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
              {/* Region 自动继承，只读显示 */}
              {addMerchantId && (
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Region (auto-inherited)</label>
                  <input
                    type="text"
                    value={inheritedRegion ? `${inheritedRegion.city || inheritedRegion.name}, ${inheritedRegion.state}` : 'Loading...'}
                    readOnly
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 px-3 py-2 text-sm text-slate-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Street address *</label>
                <input
                  value={addAddressLine1}
                  onChange={(e) => setAddAddressLine1(e.target.value)}
                  placeholder="e.g. 123 Main St"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Address line 2 (optional)</label>
                <input
                  value={addAddressLine2}
                  onChange={(e) => setAddAddressLine2(e.target.value)}
                  placeholder="Suite 101, Floor 2"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Postal code (optional)</label>
                <input
                  value={addPostalCode}
                  onChange={(e) => setAddPostalCode(e.target.value)}
                  placeholder="90001"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600">Cancel</button>
                <button onClick={handleCreate} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
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
                    <div><label className="block text-sm text-gray-500 mb-1">Street address *</label><input value={editAddressLine1} onChange={(e) => setEditAddressLine1(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm" /></div>
                    <div><label className="block text-sm text-gray-500 mb-1">Address line 2 (optional)</label><input value={editAddressLine2} onChange={(e) => setEditAddressLine2(e.target.value)} placeholder="Suite 101" className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm" /></div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingId(null); }} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600">Cancel</button>
                      <button onClick={handleSaveEdit} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
                    </div>
                  </li>
                ) : (
                  <li key={v.id} className="p-3 rounded-xl border border-border-light dark:border-border-dark flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{v.name}</div>
                      <div className="text-xs text-gray-500 truncate line-clamp-2">{formatAddress(v)}</div>
                    </div>
                    <button onClick={() => startEdit(v)} className="shrink-0 p-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm">Edit</button>
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      </main>
    </PageContainer>
  );
}
