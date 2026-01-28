/**
 * Admin Create Event V2 Page
 * 创建活动页面（v2）
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminBottomNav from '@/components/admin/AdminBottomNav';

export default function AdminNewEventV2Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    merchant_id: '',
    title: '',
    description: '',
    poster_url: '',
    status: 'active' as 'active' | 'paused' | 'archived',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!formData.merchant_id || !formData.title || !formData.poster_url) {
        throw new Error('Please fill in all required fields');
      }

      const response = await fetch('/api/admin/events-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
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
    <div className="min-h-screen bg-background-dark text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/events-v2"
            className="text-primary hover:text-primary-hover mb-4 inline-block"
          >
            ← Back to Events
          </Link>
          <h1 className="text-2xl font-bold">Create New Event</h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              Merchant ID <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.merchant_id}
              onChange={(e) => setFormData({ ...formData, merchant_id: e.target.value })}
              className="w-full px-4 py-2 bg-surface-dark rounded-lg border border-gray-700 focus:border-primary focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 bg-surface-dark rounded-lg border border-gray-700 focus:border-primary focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 bg-surface-dark rounded-lg border border-gray-700 focus:border-primary focus:outline-none"
              rows={4}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Poster URL <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              value={formData.poster_url}
              onChange={(e) => setFormData({ ...formData, poster_url: e.target.value })}
              className="w-full px-4 py-2 bg-surface-dark rounded-lg border border-gray-700 focus:border-primary focus:outline-none"
              placeholder="https://..."
              required
            />
            {formData.poster_url && (
              <img
                src={formData.poster_url}
                alt="Poster preview"
                className="mt-2 w-full h-64 object-cover rounded-lg"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value as any })
              }
              className="w-full px-4 py-2 bg-surface-dark rounded-lg border border-gray-700 focus:border-primary focus:outline-none"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-primary text-black rounded-lg hover:bg-primary-hover transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Event'}
            </button>
            <Link
              href="/events-v2"
              className="px-6 py-3 bg-surface-dark rounded-lg hover:bg-surface-light transition"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
      <AdminBottomNav />
    </div>
  );
}
