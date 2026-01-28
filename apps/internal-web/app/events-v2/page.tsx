/**
 * Internal Events V2 List Page (Read-only)
 * 活动列表页面（只读，v2）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
}

export default function InternalEventsV2Page() {
  const router = useRouter();
  const [events, setEvents] = useState<EventV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/events-v2');
      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setEvents(result.events || []);
    } catch (err: any) {
      console.error('[INTERNAL EVENTS V2] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background-dark text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse">Loading events...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background-dark text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-red-400">{error}</div>
          <button
            onClick={fetchEvents}
            className="mt-4 px-4 py-2 bg-primary text-black rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-dark text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-gray-400 mt-2">View your merchant events (read-only)</p>
        </div>

        {/* Events List */}
        {events.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>No events found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/events-v2/${event.id}`}
                className="bg-surface-dark rounded-lg p-4 hover:bg-surface-light transition block"
              >
                {event.poster_url && (
                  <img
                    src={event.poster_url}
                    alt={event.title}
                    className="w-full h-48 object-cover rounded-lg mb-3"
                  />
                )}
                <h3 className="text-lg font-semibold mb-2">{event.title}</h3>
                {event.description && (
                  <p className="text-sm text-gray-400 line-clamp-2 mb-2">{event.description}</p>
                )}
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
                  <span className="text-xs text-gray-500">{event.merchant.name}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
