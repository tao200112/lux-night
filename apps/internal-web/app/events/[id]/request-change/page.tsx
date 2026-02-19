/**
 * Request Change Page - 提交修改申请
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface TicketType {
  id?: string;
  name: string;
  category: 'entry' | 'vip' | 'drink' | 'skipline' | 'other';
  price_cents: number;
  currency: string;
  min_age: number | null;
  inventory_limit: number | null;
  status: 'active' | 'hidden' | 'sold_out';
  sort_order: number;
  action?: 'upsert' | 'delete';
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

export default function RequestChangePage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekConfig, setWeekConfig] = useState<WeekConfig | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (eventId) fetchWeekConfig();
  }, [eventId, selectedDate]);

  const fetchWeekConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const dateStr = selectedDate.toISOString().split('T')[0];
      const response = await fetch(`/api/events/${eventId}/week?date=${dateStr}`);
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      setWeekConfig({
        event_week_id: result.event_week_id,
        week_start_date: result.week_start_date,
        days: result.days || [],
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weekConfig) return;
    try {
      setSaving(true);
      setError(null);
      const daysPayload: Record<string, any> = {};
      weekConfig.days.forEach((day) => {
        daysPayload[day.dow.toString()] = {
          enabled: day.enabled,
          start_time: day.start_time,
          end_time: day.end_time,
          end_next_day: day.end_next_day,
          tickets: day.tickets.map((t) => ({ ...t, action: t.action || 'upsert' })),
        };
      });
      const response = await fetch(`/api/events/${eventId}/change-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_week_start_date: weekConfig.week_start_date,
          payload: { week_start_date: weekConfig.week_start_date, days: daysPayload },
          note: note || null,
        }),
      });
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      alert('Change request submitted successfully! Waiting for admin approval.');
      router.push(`/events/${eventId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateDay = (dow: number, updates: Partial<DayConfig>) => {
    if (!weekConfig) return;
    setWeekConfig({
      ...weekConfig,
      days: weekConfig.days.map((d) => (d.dow === dow ? { ...d, ...updates } : d)),
    });
  };

  const updateTicket = (dow: number, ticketIndex: number, updates: Partial<TicketType>) => {
    if (!weekConfig) return;
    setWeekConfig({
      ...weekConfig,
      days: weekConfig.days.map((day) =>
        day.dow === dow
          ? {
              ...day,
              tickets: day.tickets.map((t, i) => (i === ticketIndex ? { ...t, ...updates } : t)),
            }
          : day
      ),
    });
  };

  const addTicket = (dow: number) => {
    if (!weekConfig) return;
    const day = weekConfig.days.find((d) => d.dow === dow);
    const newTicket: TicketType = {
      name: 'New Ticket',
      category: 'entry',
      price_cents: 0,
      currency: 'usd',
      min_age: null,
      inventory_limit: null,
      status: 'active',
      sort_order: day?.tickets.length || 0,
      action: 'upsert',
    };
    updateDay(dow, { tickets: [...(day?.tickets || []), newTicket] });
  };

  const deleteTicket = (dow: number, ticketIndex: number) => {
    if (!weekConfig) return;
    const day = weekConfig.days.find((d) => d.dow === dow);
    if (!day) return;
    const ticket = day.tickets[ticketIndex];
    if (ticket.id) {
      updateTicket(dow, ticketIndex, { action: 'delete' });
    } else {
      updateDay(dow, { tickets: day.tickets.filter((_, i) => i !== ticketIndex) });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background-dark text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  if (error || !weekConfig) {
    return (
      <div className="min-h-screen bg-background-dark text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-red-400">{error || 'Failed to load week configuration'}</div>
          <Link href={`/events/${eventId}`} className="mt-4 inline-block px-4 py-2 bg-primary text-black rounded-lg">
            Back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-dark text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href={`/events/${eventId}`} className="text-primary hover:text-primary-hover mb-4 inline-block">
            ← Back to Event
          </Link>
          <h1 className="text-2xl font-bold">Request Changes</h1>
          <p className="text-gray-400 mt-2">Propose changes to week configuration (requires admin approval)</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Select Week</label>
            <input
              type="date"
              value={selectedDate.toISOString().split('T')[0]}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
              className="px-4 py-2 bg-surface-dark rounded-lg border border-gray-700"
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Note (Optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-4 py-2 bg-surface-dark rounded-lg border border-gray-700"
              rows={3}
              placeholder="Explain the reason for these changes..."
            />
          </div>

          <div className="space-y-4 mb-6">
            {weekConfig.days.map((day) => (
              <div key={day.dow} className="bg-surface-dark rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold">{DAY_NAMES[day.dow]}</h3>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={day.enabled}
                        onChange={(e) => updateDay(day.dow, { enabled: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Enabled</span>
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => addTicket(day.dow)}
                    className="px-3 py-1 bg-primary text-black rounded text-sm hover:bg-primary-hover"
                  >
                    + Add Ticket
                  </button>
                </div>
                {day.enabled && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Start Time</label>
                        <input
                          type="time"
                          value={day.start_time}
                          onChange={(e) => updateDay(day.dow, { start_time: e.target.value })}
                          className="w-full px-3 py-2 bg-surface-light text-gray-900 rounded border border-gray-600"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">End Time</label>
                        <input
                          type="time"
                          value={day.end_time}
                          onChange={(e) => updateDay(day.dow, { end_time: e.target.value })}
                          className="w-full px-3 py-2 bg-surface-light text-gray-900 rounded border border-gray-600"
                        />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={day.end_next_day}
                            onChange={(e) => updateDay(day.dow, { end_next_day: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">End Next Day</span>
                        </label>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {day.tickets
                        .filter((t) => t.action !== 'delete')
                        .map((ticket, idx) => (
                          <div
                            key={idx}
                            className="bg-primary text-black rounded p-3 flex flex-wrap items-center gap-3 min-w-0"
                          >
                            <input
                              type="text"
                              value={ticket.name}
                              onChange={(e) => updateTicket(day.dow, idx, { name: e.target.value })}
                              placeholder="Ticket Name"
                              className="flex-1 min-w-0 basis-24 px-3 py-1 bg-white/20 text-black placeholder:text-black/60 rounded border border-black/30"
                            />
                            <select
                              value={ticket.category}
                              onChange={(e) => updateTicket(day.dow, idx, { category: e.target.value as any })}
                              className="flex-shrink-0 px-3 py-1 bg-white/20 text-black rounded border border-black/30"
                            >
                              <option value="entry">Entry</option>
                              <option value="vip">VIP</option>
                              <option value="drink">Drink</option>
                              <option value="skipline">Skip Line</option>
                              <option value="other">Other</option>
                            </select>
                            <input
                              type="number"
                              value={ticket.price_cents / 100}
                              onChange={(e) =>
                                updateTicket(day.dow, idx, {
                                  price_cents: Math.round(parseFloat(e.target.value) * 100),
                                })
                              }
                              placeholder="Price ($)"
                              className="w-24 flex-shrink-0 px-3 py-1 bg-white/20 text-black rounded border border-black/30 placeholder:text-black/60"
                            />
                            <button
                              type="button"
                              onClick={() => deleteTicket(day.dow, idx)}
                              className="flex-shrink-0 px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-400">{error}</div>
          )}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-primary text-black rounded-lg hover:bg-primary-hover transition disabled:opacity-50"
            >
              {saving ? 'Submitting...' : 'Submit Change Request'}
            </button>
            <Link href={`/events/${eventId}`} className="px-6 py-3 bg-surface-dark rounded-lg hover:bg-surface-light transition">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
