/**
 * Internal Event V2 Detail Page (Read-only)
 * 活动详情页面（只读，v2）
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface TicketType {
  id: string;
  name: string;
  category: string;
  price_cents: number;
  currency: string;
  min_age: number | null;
  inventory_limit: number | null;
  status: string;
}

interface DayConfig {
  id: string;
  dow: number;
  enabled: boolean;
  start_time: string;
  end_time: string;
  end_next_day: boolean;
  tickets: TicketType[];
}

interface WeekConfig {
  event_week_id: string;
  week_start_date: string;
  days: DayConfig[];
}

export default function InternalEventV2DetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekConfig, setWeekConfig] = useState<WeekConfig | null>(null);

  useEffect(() => {
    if (eventId) {
      fetchWeekConfig();
    }
  }, [eventId]);

  const fetchWeekConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/events-v2/${eventId}/week?date=${today}`);
      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setWeekConfig({
        event_week_id: result.event_week_id,
        week_start_date: result.week_start_date,
        days: result.days || [],
      });
    } catch (err: any) {
      console.error('[INTERNAL EVENT V2] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background-dark text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse">Loading event configuration...</div>
        </div>
      </div>
    );
  }

  if (error || !weekConfig) {
    return (
      <div className="min-h-screen bg-background-dark text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-red-400">{error || 'Failed to load event configuration'}</div>
          <Link
            href="/events-v2"
            className="mt-4 inline-block px-4 py-2 bg-primary text-black rounded-lg"
          >
            Back to Events
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-dark text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/events-v2"
            className="text-primary hover:text-primary-hover mb-4 inline-block"
          >
            ← Back to Events
          </Link>
          <h1 className="text-2xl font-bold">Event Week Configuration (Read-only)</h1>
          <p className="text-gray-400 mt-2">
            Week of {new Date(weekConfig.week_start_date).toLocaleDateString()}
          </p>
        </div>

        {/* Request Change Button */}
        <div className="mb-6">
          <Link
            href={`/events-v2/${eventId}/request-change`}
            className="inline-block px-6 py-3 bg-primary text-black rounded-lg hover:bg-primary-hover transition"
          >
            Request Changes
          </Link>
        </div>

        {/* Days */}
        <div className="space-y-4">
          {weekConfig.days.map((day) => (
            <div
              key={day.dow}
              className="bg-surface-dark rounded-lg p-4 border border-gray-700"
            >
              {/* Day Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <h3 className="text-lg font-semibold">{DAY_NAMES[day.dow]}</h3>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      day.enabled
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {day.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>

              {/* Time Range */}
              {day.enabled && (
                <div className="mb-4 text-sm text-gray-400">
                  <p>
                    Time: {day.start_time} - {day.end_time}
                    {day.end_next_day && ' (next day)'}
                  </p>
                </div>
              )}

              {/* Tickets */}
              {day.enabled && day.tickets.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium mb-2">Tickets:</h4>
                  {day.tickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="bg-surface-light rounded p-3 flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{ticket.name}</div>
                        <div className="text-sm text-gray-400">
                          {ticket.category} • ${(ticket.price_cents / 100).toFixed(2)}
                          {ticket.min_age && ` • ${ticket.min_age}+`}
                          {ticket.inventory_limit !== null &&
                            ` • Limit: ${ticket.inventory_limit}`}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          ticket.status === 'active'
                            ? 'bg-green-500/20 text-green-400'
                            : ticket.status === 'hidden'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {ticket.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {day.enabled && day.tickets.length === 0 && (
                <p className="text-sm text-gray-500">No tickets configured for this day</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
