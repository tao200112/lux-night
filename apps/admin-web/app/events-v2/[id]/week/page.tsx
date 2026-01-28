/**
 * Admin Event Week Configuration Page
 * 本周编辑器页面（核心功能）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import AdminBottomNav from '@/components/admin/AdminBottomNav';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

export default function AdminEventWeekPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekConfig, setWeekConfig] = useState<WeekConfig | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    fetchWeekConfig();
  }, [eventId, selectedDate]);

  const fetchWeekConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const dateStr = selectedDate.toISOString().split('T')[0];
      const response = await fetch(`/api/admin/events-v2/${eventId}/week?date=${dateStr}`);
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
      console.error('[ADMIN WEEK CONFIG] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!weekConfig) return;

    try {
      setSaving(true);
      setError(null);

      // Prepare payload
      const daysPayload: Record<string, any> = {};
      weekConfig.days.forEach((day) => {
        daysPayload[day.dow.toString()] = {
          enabled: day.enabled,
          start_time: day.start_time,
          end_time: day.end_time,
          end_next_day: day.end_next_day,
          tickets: day.tickets.map((ticket) => ({
            ...ticket,
            action: ticket.action || 'upsert',
          })),
        };
      });

      const response = await fetch(`/api/admin/events-v2/${eventId}/week`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start_date: weekConfig.week_start_date,
          days: daysPayload,
        }),
      });

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      // Refresh config
      await fetchWeekConfig();
      alert('Week configuration saved successfully!');
    } catch (err: any) {
      console.error('[ADMIN WEEK CONFIG] Save error:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateDay = (dow: number, updates: Partial<DayConfig>) => {
    if (!weekConfig) return;

    setWeekConfig({
      ...weekConfig,
      days: weekConfig.days.map((day) =>
        day.dow === dow ? { ...day, ...updates } : day
      ),
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
              tickets: day.tickets.map((ticket, idx) =>
                idx === ticketIndex ? { ...ticket, ...updates } : ticket
              ),
            }
          : day
      ),
    });
  };

  const addTicket = (dow: number) => {
    if (!weekConfig) return;

    const newTicket: TicketType = {
      name: 'New Ticket',
      category: 'entry',
      price_cents: 0,
      currency: 'usd',
      min_age: null,
      inventory_limit: null,
      status: 'active',
      sort_order: weekConfig.days.find((d) => d.dow === dow)?.tickets.length || 0,
      action: 'upsert',
    };

    updateDay(dow, {
      tickets: [...(weekConfig.days.find((d) => d.dow === dow)?.tickets || []), newTicket],
    });
  };

  const deleteTicket = (dow: number, ticketIndex: number) => {
    if (!weekConfig) return;

    const day = weekConfig.days.find((d) => d.dow === dow);
    if (!day) return;

    const ticket = day.tickets[ticketIndex];
    if (ticket.id) {
      // Mark for deletion
      updateTicket(dow, ticketIndex, { action: 'delete' });
    } else {
      // Remove from array (new ticket)
      updateDay(dow, {
        tickets: day.tickets.filter((_, idx) => idx !== ticketIndex),
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background-dark text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse">Loading...</div>
        </div>
        <AdminBottomNav />
      </div>
    );
  }

  if (error || !weekConfig) {
    return (
      <div className="min-h-screen bg-background-dark text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-red-400">{error || 'Failed to load week configuration'}</div>
          <button
            onClick={fetchWeekConfig}
            className="mt-4 px-4 py-2 bg-primary text-black rounded-lg"
          >
            Retry
          </button>
        </div>
        <AdminBottomNav />
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
          <h1 className="text-2xl font-bold">Week Configuration</h1>
          <p className="text-gray-400 mt-2">
            Week of {new Date(weekConfig.week_start_date).toLocaleDateString()}
          </p>
        </div>

        {/* Week Picker */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Select Week</label>
          <input
            type="date"
            value={selectedDate.toISOString().split('T')[0]}
            onChange={(e) => setSelectedDate(new Date(e.target.value))}
            className="px-4 py-2 bg-surface-dark rounded-lg border border-gray-700"
          />
        </div>

        {/* Days */}
        <div className="space-y-4 mb-6">
          {weekConfig.days.map((day) => (
            <div
              key={day.dow}
              className="bg-surface-dark rounded-lg p-4 border border-gray-700"
            >
              {/* Day Header */}
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
                  onClick={() => addTicket(day.dow)}
                  className="px-3 py-1 bg-primary text-black rounded text-sm hover:bg-primary-hover"
                >
                  + Add Ticket
                </button>
              </div>

              {/* Time Range */}
              {day.enabled && (
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Start Time</label>
                    <input
                      type="time"
                      value={day.start_time}
                      onChange={(e) => updateDay(day.dow, { start_time: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-light rounded border border-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">End Time</label>
                    <input
                      type="time"
                      value={day.end_time}
                      onChange={(e) => updateDay(day.dow, { end_time: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-light rounded border border-gray-600"
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
              )}

              {/* Tickets */}
              {day.enabled && (
                <div className="space-y-2">
                  {day.tickets
                    .filter((t) => t.action !== 'delete')
                    .map((ticket, idx) => (
                      <div
                        key={idx}
                        className="bg-surface-light rounded p-3 flex items-center gap-4"
                      >
                        <input
                          type="text"
                          value={ticket.name}
                          onChange={(e) => updateTicket(day.dow, idx, { name: e.target.value })}
                          placeholder="Ticket Name"
                          className="flex-1 px-3 py-1 bg-background-dark rounded border border-gray-600"
                        />
                        <select
                          value={ticket.category}
                          onChange={(e) =>
                            updateTicket(day.dow, idx, { category: e.target.value as any })
                          }
                          className="px-3 py-1 bg-background-dark rounded border border-gray-600"
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
                          className="w-24 px-3 py-1 bg-background-dark rounded border border-gray-600"
                        />
                        <select
                          value={ticket.min_age || ''}
                          onChange={(e) =>
                            updateTicket(day.dow, idx, {
                              min_age: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          className="w-20 px-3 py-1 bg-background-dark rounded border border-gray-600"
                        >
                          <option value="">No Age</option>
                          <option value="18">18+</option>
                          <option value="21">21+</option>
                        </select>
                        <input
                          type="number"
                          value={ticket.inventory_limit || ''}
                          onChange={(e) =>
                            updateTicket(day.dow, idx, {
                              inventory_limit: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          placeholder="Limit"
                          className="w-20 px-3 py-1 bg-background-dark rounded border border-gray-600"
                        />
                        <select
                          value={ticket.status}
                          onChange={(e) =>
                            updateTicket(day.dow, idx, { status: e.target.value as any })
                          }
                          className="px-3 py-1 bg-background-dark rounded border border-gray-600"
                        >
                          <option value="active">Active</option>
                          <option value="hidden">Hidden</option>
                          <option value="sold_out">Sold Out</option>
                        </select>
                        <button
                          onClick={() => deleteTicket(day.dow, idx)}
                          className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Save Button */}
        {error && (
          <div className="mb-4 bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-primary text-black rounded-lg hover:bg-primary-hover transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Week Configuration'}
          </button>
        </div>
      </div>
      <AdminBottomNav />
    </div>
  );
}
