/**
 * Admin Events V2 List Page
 * 活动列表页面（v2）— drag-and-drop sortable (native HTML5)
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
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
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
}: {
  event: EventV2;
  index: number;
  onStatusChange: (id: string, status: string) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      className={`bg-surface-dark rounded-lg p-4 hover:bg-surface-light transition ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex gap-3">
        <div
          className="shrink-0 mt-1 p-1 rounded cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 select-none"
          title="Drag to reorder"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="4" r="1.2" />
            <circle cx="11" cy="4" r="1.2" />
            <circle cx="5" cy="8" r="1.2" />
            <circle cx="11" cy="8" r="1.2" />
            <circle cx="5" cy="12" r="1.2" />
            <circle cx="11" cy="12" r="1.2" />
          </svg>
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
                href={`/events-v2/${event.id}/week`}
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

export default function AdminEventsV2Page() {
  const [events, setEvents] = useState<EventV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'temp_closed' | 'archived' | 'draft'>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const persistOrder = useCallback(
    async (next: EventV2[]) => {
      const payload = next.map((e, i) => ({ id: e.id, sort_order: (i + 1) * 1000 }));
      setSavingOrder(true);
      try {
        const res = await fetch('/api/admin/events-v2', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: payload }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
      } catch (err: any) {
        setEvents(events);
        setToast('Failed to save order. Reverted.');
        setTimeout(() => setToast(null), 3000);
      } finally {
        setSavingOrder(false);
      }
    },
    [events]
  );

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      setDragIndex(null);
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (fromIndex === toIndex || isNaN(fromIndex)) return;
      const next = [...events];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
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

  const handleStatusChange = async (eventId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/admin/events-v2/${eventId}/status`, {
        method: 'POST',
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
        {/* Events List - Drag & Drop Sortable */}
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
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                isDragging={dragIndex === index}
              />
            ))}
          </div>
        )}
      </div>
      <AdminBottomNav />
    </div>
  );
}
