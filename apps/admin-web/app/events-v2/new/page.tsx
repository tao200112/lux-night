/**
 * Admin Create Event V2 Page
 * 创建活动页面（v2）
 * 仅包含：Title, Description, Poster, Status
 * Merchant ID 从 URL 获取，禁止修改
 * Poster 仅支持上传
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminBottomNav from '@/components/admin/AdminBottomNav';
import AdminTopBar from '@/components/admin/AdminTopBar';

export default function NewEventV2Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [merchantId, setMerchantId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [status, setStatus] = useState<'active' | 'paused' | 'archived'>('active');

  // 从 URL 参数获取 merchant_id（如果从 merchant 页面跳转过来）
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const mId = searchParams.get('merchant_id');
    if (mId) {
      setMerchantId(mId);
    }
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);
      if (merchantId) {
        formData.append('merchant_id', merchantId);
      }

      const res = await fetch('/api/admin/uploads/poster', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Upload failed');
      }

      setPosterUrl(result.data.poster_url);
    } catch (err: any) {
      console.error('Upload Error:', err);
      alert('Failed to upload poster: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!merchantId) {
        throw new Error('Merchant ID is missing. Please create event from Merchant Detail page.');
      }
      if (!title) {
        throw new Error('Title is required');
      }
      if (!posterUrl) {
        throw new Error('Poster is required. Please upload an image.');
      }

      const response = await fetch('/api/admin/events-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: merchantId,
          title,
          description,
          poster_url: posterUrl,
          status,
        }),
      });

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      // Redirect to week configuration
      router.push(`/events-v2/${result.event.id}/week`);
    } catch (err: any) {
      console.error('[ADMIN NEW EVENT V2] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-white pb-32">
      <AdminTopBar title="Create New Event" showBack />

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-red-500 dark:text-red-400 text-sm">
              <p className="font-bold">Error</p>
              {error}
            </div>
          )}

          {!merchantId && (
            <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 text-yellow-600 dark:text-yellow-400 text-sm">
              <span className="material-symbols-outlined align-bottom mr-1">warning</span>
              <strong>Warning:</strong> No Merchant ID found. You must access this page from a Merchant Detail page.
            </div>
          )}

          {/* Section 1: Basic Info */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 space-y-6">
            <h2 className="text-lg font-bold border-b border-slate-100 dark:border-slate-700 pb-3 mb-4">
              Basic Information
            </h2>
            
            <div className="md:grid md:grid-cols-2 md:gap-6 space-y-6 md:space-y-0">
               <div className="col-span-2">
                <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Event Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-600 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                  placeholder="e.g. Friday Night Live"
                  required
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-600 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors resize-none"
                  rows={4}
                  placeholder="Describe your event..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                   className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-600 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                >
                  <option value="active">Active</option>
                  <option value="paused">Temporarily Closed</option>
                  <option value="archived">Archived</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Paused events are visible but cannot be purchased.
                </p>
              </div>

               <div>
                <label className="block text-sm font-medium mb-1 text-slate-500 dark:text-slate-400">
                  Merchant ID (Read-only)
                </label>
                <input
                  type="text"
                  value={merchantId}
                  readOnly
                  className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 cursor-not-allowed font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Visuals */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 space-y-6">
            <h2 className="text-lg font-bold border-b border-slate-100 dark:border-slate-700 pb-3 mb-4">
              Visuals
            </h2>

            <div>
              <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                Event Poster <span className="text-red-500">*</span>
              </label>
              
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors relative">
                {uploading ? (
                   <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="text-sm text-slate-500">Uploading...</span>
                   </div>
                ) : posterUrl ? (
                  <div className="relative w-full aspect-video md:w-64 md:aspect-[3/4] group">
                    <img
                      src={posterUrl}
                      alt="Poster preview"
                      className="w-full h-full object-cover rounded-lg shadow-md"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                      <p className="text-white text-sm font-medium">Click "Choose File" to replace</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center pointer-events-none">
                    <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">cloud_upload</span>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Upload a poster image
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      JPG, PNG, WebP up to 5MB
                    </p>
                  </div>
                )}
                
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={uploading}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Link
              href={merchantId ? `/merchants/${merchantId}` : '/events-v2'}
              className="px-6 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading || !merchantId || !title || !posterUrl}
              className="flex-1 px-6 py-3 bg-primary text-slate-900 rounded-lg font-bold hover:bg-primary/90 transition shadow-lg disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? 'Creating...' : 'Continue to Week Setup →'}
            </button>
          </div>
        </form>
      </main>
      
      <AdminBottomNav />
    </div>
  );
}
