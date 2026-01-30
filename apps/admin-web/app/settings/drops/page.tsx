'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminBottomNav from '@/components/admin/AdminBottomNav';
import { Drop } from '@lux-night/shared/types'; 

interface Region {
  id: string;
  name: string;
}

export default function AdminDropsPage() {
  const router = useRouter();
  const [drops, setDrops] = useState<Drop[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingDrop, setEditingDrop] = useState<Drop | null>(null);

  // Form State
  const [formRegion, setFormRegion] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formSubtitle, setFormSubtitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formPoster, setFormPoster] = useState('');
  const [formStatus, setFormStatus] = useState<'draft' | 'published'>('draft');

  useEffect(() => {
    fetchData();
  }, [selectedRegion]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch regions first if empty
      if (regions.length === 0) {
          const resR = await fetch('/api/admin/regions');
          const jsonR = await resR.json();
          if (jsonR.success) setRegions(jsonR.data);
      }

      // Fetch drops
      let url = '/api/admin/drops';
      if (selectedRegion && selectedRegion !== 'all') {
          url += `?region_id=${selectedRegion}`;
      }
      const resD = await fetch(url);
      const jsonD = await resD.json();
      if (jsonD.success) setDrops(jsonD.data);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (drop: Drop) => {
    setEditingDrop(drop);
    setFormRegion(drop.region_id);
    setFormTitle(drop.title);
    setFormSubtitle(drop.subtitle || '');
    setFormContent(drop.content);
    setFormPoster(drop.poster_url || '');
    setFormStatus(drop.status);
    setShowModal(true);
  };

  const openCreate = () => {
    setEditingDrop(null);
    setFormRegion(regions.length > 0 ? regions[0].id : '');
    setFormTitle('');
    setFormSubtitle('');
    setFormContent('');
    setFormPoster('');
    setFormStatus('draft'); // Default
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRegion || !formTitle || !formContent) return;
    
    setSubmitting(true);
    try {
       const payload = {
           region_id: formRegion,
           title: formTitle,
           subtitle: formSubtitle || null,
           content: formContent,
           poster_url: formPoster || null,
           status: formStatus
       };

       let res;
       if (editingDrop) {
           res = await fetch(`/api/admin/drops/${editingDrop.id}`, {
               method: 'PUT',
               headers: {'Content-Type': 'application/json'},
               body: JSON.stringify(payload)
           });
       } else {
           res = await fetch('/api/admin/drops', {
               method: 'POST',
               headers: {'Content-Type': 'application/json'},
               body: JSON.stringify(payload)
           });
       }
       
       const json = await res.json();
       if (!json.success) throw new Error(json.error);
       
       setShowModal(false);
       fetchData();
    } catch (err) {
        alert('Failed to save drop');
        console.error(err);
    } finally {
        setSubmitting(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-background-light dark:bg-background-dark border-x border-border-light dark:border-border-dark shadow-2xl">
      <header className="sticky top-0 z-50 flex items-center justify-between bg-surface-light/95 dark:bg-surface-dark/95 backdrop-blur-md px-4 py-3 border-b border-border-light dark:border-border-dark">
        <Link
          href="/settings"
          className="flex size-10 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-primary dark:text-white"
        >
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </Link>
        <h1 className="text-base font-bold uppercase tracking-wide text-primary dark:text-white">Drops Management</h1>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 flex flex-col p-4 gap-6 pb-24">
        {/* Tabs */}
        <div className="flex border-b border-border-light dark:border-border-dark">
           <Link
            href="/settings"
            className="flex-1 px-4 py-2 text-sm font-semibold border-b-2 border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 text-center transition-colors"
          >
            General
          </Link>
          <button
            className="flex-1 px-4 py-2 text-sm font-semibold border-b-2 border-primary-active text-primary-active transition-colors"
          >
            Drops
          </button>
          <Link
            href="/settings/invites"
            className="flex-1 px-4 py-2 text-sm font-semibold border-b-2 border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 text-center transition-colors"
          >
            Invites
          </Link>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
            <select 
                className="flex-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-primary dark:text-white font-medium"
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
            >
                <option value="all">All Regions</option>
                {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            
            <button 
                onClick={openCreate}
                className="flex items-center gap-1 rounded bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
                <span className="material-symbols-outlined text-[18px]">add</span>
                New
            </button>
        </div>

        {/* List */}
        <div className="flex flex-col gap-3">
            {loading ? (
                <div className="p-4 text-center text-slate-500">Loading...</div>
            ) : drops.length === 0 ? (
                <div className="p-8 text-center text-slate-500 border border-dashed border-slate-300 rounded">
                    No drops found. Create one!
                </div>
            ) : (
                drops.map(drop => (
                    <div key={drop.id} onClick={() => openEdit(drop)} className="flex items-start gap-3 p-3 rounded bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark cursor-pointer hover:border-primary-active transition-colors">
                        {drop.poster_url ? (
                            <img src={drop.poster_url} className="w-16 h-24 object-cover rounded bg-slate-200" alt="Poster" />
                        ) : (
                            <div className="w-16 h-24 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center">
                                <span className="material-symbols-outlined text-slate-400">image</span>
                            </div>
                        )}
                        <div className="flex-1">
                            <div className="flex justify-between items-start">
                                <h3 className="font-bold text-primary dark:text-white line-clamp-1">{drop.title}</h3>
                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${drop.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                    {drop.status}
                                </span>
                            </div>
                            {drop.subtitle && <p className="text-xs text-primary/70 dark:text-white/70 font-medium line-clamp-1">{drop.subtitle}</p>}
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{drop.content}</p>
                            <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">public</span>
                                {drop.region?.name || 'Unknown Region'}
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
      </main>

      <AdminBottomNav pendingCount={0} />

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-0">
            <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                        {editingDrop ? 'Edit Drop' : 'New Drop'}
                    </h3>
                    <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">
                        <span className="material-symbols-outlined dark:text-white">close</span>
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-4 flex-1">
                    <div>
                        <label className="block text-sm font-medium mb-1 dark:text-slate-300">Region <span className="text-red-500">*</span></label>
                        <select 
                            required 
                            className="w-full rounded border border-slate-300 dark:border-slate-600 p-2 text-sm bg-white dark:bg-slate-700 dark:text-white"
                            value={formRegion}
                            onChange={e => setFormRegion(e.target.value)}
                        >
                            <option value="">Select Region</option>
                            {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 dark:text-slate-300">Title <span className="text-red-500">*</span></label>
                        <input 
                            required 
                            type="text" 
                            className="w-full rounded border border-slate-300 dark:border-slate-600 p-2 text-sm bg-white dark:bg-slate-700 dark:text-white" 
                            value={formTitle}
                            onChange={e => setFormTitle(e.target.value)}
                            placeholder="e.g. Exclusive Merch Drop"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 dark:text-slate-300">Subtitle <span className="text-gray-400 text-xs">(optional)</span></label>
                        <input 
                            type="text" 
                            className="w-full rounded border border-slate-300 dark:border-slate-600 p-2 text-sm bg-white dark:bg-slate-700 dark:text-white" 
                            value={formSubtitle}
                            onChange={e => setFormSubtitle(e.target.value)}
                            placeholder="e.g. Free shipping on orders over $100"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 dark:text-slate-300">Poster URL</label>
                        <input 
                            type="text" 
                            className="w-full rounded border border-slate-300 dark:border-slate-600 p-2 text-sm bg-white dark:bg-slate-700 dark:text-white" 
                            value={formPoster}
                            onChange={e => setFormPoster(e.target.value)}
                            placeholder="https://..."
                        />
                        {formPoster && (
                            <img src={formPoster} className="mt-2 h-32 object-contain rounded border border-slate-200" alt="Preview" />
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 dark:text-slate-300">Content <span className="text-red-500">*</span></label>
                        <textarea 
                            required 
                            rows={5}
                            className="w-full rounded border border-slate-300 dark:border-slate-600 p-2 text-sm bg-white dark:bg-slate-700 dark:text-white" 
                            value={formContent}
                            onChange={e => setFormContent(e.target.value)}
                            placeholder="Enter drop details..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 dark:text-slate-300">Status</label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 dark:text-slate-300">
                                <input type="radio" name="status" value="draft" checked={formStatus === 'draft'} onChange={() => setFormStatus('draft')} />
                                <span className="text-sm">Draft</span>
                            </label>
                            <label className="flex items-center gap-2 dark:text-slate-300">
                                <input type="radio" name="status" value="published" checked={formStatus === 'published'} onChange={() => setFormStatus('published')} />
                                <span className="text-sm">Published</span>
                            </label>
                        </div>
                    </div>
                </form>

                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex gap-3">
                    <button type="button" onClick={() => setShowModal(false)} disabled={submitting} className="flex-1 py-2.5 rounded border border-slate-300 dark:border-slate-600 dark:text-slate-300 font-medium text-sm hover:bg-slate-100 dark:hover:bg-slate-700">Cancel</button>
                    <button onClick={handleSubmit} disabled={submitting} className="flex-1 py-2.5 rounded bg-primary text-white font-medium text-sm hover:opacity-90 disabled:opacity-50">
                        {submitting ? 'Saving...' : 'Save Drop'}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
