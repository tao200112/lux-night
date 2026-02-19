/**
 * Admin Events List Page
 * 活动列表 — sortable via up/down buttons
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import PageContainer from '@/components/admin/PageContainer';
import ErrorState from '@/components/admin/ErrorState';
import EmptyState from '@/components/admin/EmptyState';
import { SkeletonList } from '@/components/admin/Skeleton';

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  poster_url: string;
  status: 'active' | 'paused' | 'temp_closed' | 'archived' | 'draft';
  sort_order?: number | null;
  merchant: {
    id: string;
    name: string;
  };
  created_at: string;
  updated_at: string;
}

function EventCardRow({
  event,
  index,
  onStatusChange,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  event: EventItem;
  index: number;
  onStatusChange: (id: string, status: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <div className="bg-surface-dark rounded-lg p-4 hover:bg-surface-light transition">
      <div className="flex gap-3">
        <div className="shrink-0 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => onMoveUp(index)}
            disabled={!canMoveUp}
            title="上移"
            className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-surface-dark disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 6L4 10h8L8 6z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(index)}
            disabled={!canMoveDown}
            title="下移"
            className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-surface-dark disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 10L4 6h8l-4 4z" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-w-0">
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
              Merchant: {event.merchant?.name || 'Unknown'}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <span
              className={`px-2 py-1 rounded text-xs ${
                event.status === 'active'
                  ? 'bg-green-500/20 text-green-400'
                  : event.status === 'temp_closed' || event.status === 'paused'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : event.status === 'draft'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {event.status === 'temp_closed' ? 'Temp Closed' : event.status}
            </span>
            <div className="flex gap-2">
              <Link
                href={`/events/${event.id}/week`}
                className="px-3 py-1 bg-primary text-black rounded text-sm hover:bg-primary-hover transition"
              >
                Configure
              </Link>
              <select
                value={event.status === 'paused' ? 'temp_closed' : event.status}
                onChange={(e) => onStatusChange(event.id, e.target.value)}
                className="px-2 py-1 bg-surface-light rounded text-sm max-w-[100px]"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="temp_closed">Closed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'temp_closed' | 'archived' | 'draft'>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const persistOrder = useCallback(
    async (next: EventItem[]) => {
      const payload = next.map((e, i) => ({ id: e.id, sort_order: (i + 1) * 1000 }));
      setSavingOrder(true);
      try {
        const res = await fetch('/api/admin/events', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: payload }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || data.details?.join?.(', ') || 'Save failed');
      } catch (err: any) {
        setEvents(events);
        setToast(err?.message || 'Failed to save order. Reverted.');
        setTimeout(() => setToast(null), 5000);
      } finally {
        setSavingOrder(false);
      }
    },
    [events]
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index <= 0) return;
      const next = [...events];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      setEvents(next);
      persistOrder(next);
    },
    [events, persistOrder]
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= events.length - 1) return;
      const next = [...events];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      setEvents(next);
      persistOrder(next);
    },
    [events, persistOrder]
  );

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

      const response = await fetch(`/api/admin/events?${params.toString()}`);
      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setEvents(result.events || []);
    } catch (err: any) {
      console.error('[ADMIN EVENTS] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (eventId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/admin/events/${eventId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      fetchEvents();
    } catch (err: any) {
      console.error('[ADMIN EVENTS] Error updating status:', err);
      alert('Failed to update status: ' + err.message);
    }
  };

  if (loading) {
    return (
      <PageContainer fullBleed className="bg-background-dark text-white">
        <div className="max-w-7xl mx-auto py-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Events</h1>
          </div>
          <SkeletonList count={5} />
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer fullBleed className="bg-background-dark text-white">
        <div className="max-w-7xl mx-auto py-8">
          <ErrorState message={error} onRetry={fetchEvents} />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer fullBleed className="bg-background-dark text-white">
      <div className="max-w-7xl mx-auto py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Events</h1>
          <Link
            href="/events/new"
            className="px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary-hover transition"
          >
            + New Event
          </Link>
        </div>

        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          {(['all', 'active', 'temp_closed', 'archived', 'draft'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status as any)}
              className={`px-4 py-2 rounded-lg transition whitespace-nowrap ${
                statusFilter === status
                  ? 'bg-primary text-black'
                  : 'bg-surface-dark text-white hover:bg-surface-light'
              }`}
            >
              {status === 'temp_closed' ? 'Temp Closed' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {toast && (
          <div className="mb-4 py-2 px-4 rounded-lg bg-amber-500/20 text-amber-200 text-sm">
            {toast}
          </div>
        )}
        {savingOrder && (
          <div className="mb-2 text-xs text-zinc-500">Saving order…</div>
        )}
        {events.length === 0 ? (
          <EmptyState title="No events found" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map((event, index) => (
              <EventCardRow
                key={event.id}
                event={event}
                index={index}
                onStatusChange={handleStatusChange}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                canMoveUp={index > 0}
                canMoveDown={index < events.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
