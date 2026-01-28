/**
 * Admin Events V2 List Page
 * 活动列表页面（v2）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminBottomNav from '@/components/admin/AdminBottomNav';
import ErrorState from '@/components/admin/ErrorState';
import EmptyState from '@/components/admin/EmptyState';
import { SkeletonList } from '@/components/admin/Skeleton';

interface EventV2 {
  id: string;
  title: string;
  description: string | null;
  poster_url: string;
  status: 'active' | 'paused' | 'archived';
  merchant: {
    id: string;
    name: string;
  };
  created_at: string;
  updated_at: string;
}

export default function AdminEventsV2Page() {
  const router = useRouter();
  const [events, setEvents] = useState<EventV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'archived'>('all');

  useEffect(() => {
    fetchEvents();
  }, [statusFilter]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const response = await fetch(`/api/admin/events-v2?${params.toString()}`);
      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setEvents(result.events || []);
    } catch (err: any) {
      console.error('[ADMIN EVENTS V2] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (eventId: string, newStatus: 'active' | 'paused' | 'archived') => {
    try {
      const response = await fetch(`/api/admin/events-v2/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      // Refresh list
      fetchEvents();
    } catch (err: any) {
      console.error('[ADMIN EVENTS V2] Error updating status:', err);
      alert('Failed to update status: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background-dark text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Events V2</h1>
          </div>
          <SkeletonList count={5} />
        </div>
        <AdminBottomNav />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background-dark text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <ErrorState message={error} onRetry={fetchEvents} />
        </div>
        <AdminBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-dark text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Events V2</h1>
          <Link
            href="/events-v2/new"
            className="px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary-hover transition"
          >
            + New Event
          </Link>
        </div>

        {/* Filters */}
        <div className="mb-6 flex gap-2">
          {(['all', 'active', 'paused', 'archived'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg transition ${
                statusFilter === status
                  ? 'bg-primary text-black'
                  : 'bg-surface-dark text-white hover:bg-surface-light'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Events List */}
        {events.length === 0 ? (
          <EmptyState title="No events found" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-surface-dark rounded-lg p-4 hover:bg-surface-light transition"
              >
                <div className="mb-4">
                  {event.poster_url && (
                    <img
                      src={event.poster_url}
                      alt={event.title}
                      className="w-full h-48 object-cover rounded-lg mb-3"
                    />
                  )}
                  <h3 className="text-lg font-semibold mb-2">{event.title}</h3>
                  {event.description && (
                    <p className="text-sm text-gray-400 line-clamp-2">{event.description}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    Merchant: {event.merchant.name}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      event.status === 'active'
                        ? 'bg-green-500/20 text-green-400'
                        : event.status === 'paused'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {event.status}
                  </span>

                  <div className="flex gap-2">
                    <Link
                      href={`/events-v2/${event.id}/week`}
                      className="px-3 py-1 bg-primary text-black rounded text-sm hover:bg-primary-hover transition"
                    >
                      Configure Week
                    </Link>
                    <select
                      value={event.status}
                      onChange={(e) =>
                        handleStatusChange(
                          event.id,
                          e.target.value as 'active' | 'paused' | 'archived'
                        )
                      }
                      className="px-2 py-1 bg-surface-light rounded text-sm"
                    >
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <AdminBottomNav />
    </div>
  );
}
