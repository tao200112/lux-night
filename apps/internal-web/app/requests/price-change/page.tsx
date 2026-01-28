/**
 * Price Change Request Page
 * 完全按照 uimerchant/price_change_request/code.html 设计
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMerchantContext } from '@/contexts/MerchantContext';

interface Event {
  id: string;
  title: string;
}

interface TicketType {
  id: string;
  name: string;
  price_cents: number;
}

function PriceChangeRequestPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventIdParam = searchParams.get('event_id');
  const { workspace } = useMerchantContext();

  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);

  const [selectedEventId, setSelectedEventId] = useState<string>(eventIdParam || '');
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState<string>('');
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [newPrice, setNewPrice] = useState<string>('');
  const [effectiveTime, setEffectiveTime] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      loadTicketTypes(selectedEventId);
    }
  }, [selectedEventId]);

  useEffect(() => {
    if (selectedTicketTypeId && ticketTypes.length > 0) {
      const ticketType = ticketTypes.find(tt => tt.id === selectedTicketTypeId);
      if (ticketType) {
        setCurrentPrice(ticketType.price_cents);
      }
    }
  }, [selectedTicketTypeId, ticketTypes]);

  const loadEvents = async () => {
    try {
      const res = await fetch('/api/events', {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error('Error loading events:', err);
    }
  };

  const loadTicketTypes = async (eventId: string) => {
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setTicketTypes(data.event?.ticket_types || []);
      }
    } catch (err) {
      console.error('Error loading ticket types:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedEventId || !selectedTicketTypeId || !newPrice || !reason.trim()) {
      return;
    }

    try {
      setLoading(true);

      const selectedTicketType = ticketTypes.find(tt => tt.id === selectedTicketTypeId);
      if (!selectedTicketType) {
        throw new Error('Ticket type not found');
      }

      const res = await fetch('/api/merchant/event-change-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          event_id: selectedEventId,
          request_type: 'price_change',
          payload: {
            ticket_type_id: selectedTicketTypeId,
            ticket_type_name: selectedTicketType.name,
            old_price: currentPrice,
            new_price: Math.round(parseFloat(newPrice) * 100),
            effective_time: effectiveTime || new Date().toISOString(),
            reason: reason.trim(),
          },
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to submit request');
      }

      // 成功，返回事件详情页
      alert(`Submitted (Pending Approval)\nRequest ID: ${data.request.id}`);
      router.push(`/events-v2/${selectedEventId}`);
    } catch (err: any) {
      console.error('Error submitting request:', err);
      alert(err.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-screen bg-background-light dark:bg-background-dark text-[#1a1c1e] dark:text-gray-100 pb-10">
      {/* TopAppBar */}
      <header className="sticky top-0 z-10 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md px-4 py-4 flex items-center justify-between border-b border-gray-200/50 dark:border-gray-800/50">
        <button
          onClick={() => router.back()}
          className="text-primary flex items-center justify-center p-1 -ml-2"
        >
          <span className="material-symbols-outlined text-[28px]">chevron_left</span>
        </button>
        <h1 className="text-lg font-bold tracking-tight flex-1 text-center pr-8">Price Change Request</h1>
      </header>

      <main className="flex-1 px-4 pt-6 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Selection Section */}
          <section className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 ml-1">Select Event</label>
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="w-full h-14 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 text-base focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                required
              >
                <option value="">Choose an event...</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 ml-1">Ticket Type</label>
              <select
                value={selectedTicketTypeId}
                onChange={(e) => setSelectedTicketTypeId(e.target.value)}
                disabled={!selectedEventId || ticketTypes.length === 0}
                className="w-full h-14 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 text-base focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                required
              >
                <option value="">General Admission, VIP, etc.</option>
                {ticketTypes.map((tt) => (
                  <option key={tt.id} value={tt.id}>
                    {tt.name} - ${(tt.price_cents / 100).toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Price Comparison Card */}
          <section className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 ml-1">Current Price</label>
              <div className="h-14 bg-gray-100 dark:bg-gray-900 border border-transparent rounded-xl px-4 flex items-center text-gray-400 dark:text-gray-500 font-semibold cursor-not-allowed">
                ${(currentPrice / 100).toFixed(2)}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 ml-1">New Price</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-14 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-8 pr-4 text-base font-semibold text-primary focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  required
                />
              </div>
            </div>
          </section>

          {/* Time Selection */}
          <section className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400 ml-1">Effective Time</label>
            <div className="relative group">
              <input
                type="datetime-local"
                value={effectiveTime}
                onChange={(e) => setEffectiveTime(e.target.value)}
                className="w-full h-14 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 text-base focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 pointer-events-none">calendar_today</span>
            </div>
          </section>

          {/* Justification */}
          <section className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400 ml-1">
              Reason for Change <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why the price is changing..."
              rows={4}
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-base focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
              required
            />
          </section>

          {/* Info Box */}
          <div className="bg-primary/5 dark:bg-primary/10 rounded-xl p-4 flex gap-3 border border-primary/10">
            <span className="material-symbols-outlined text-primary text-[20px]">info</span>
            <p className="text-xs text-primary/80 leading-relaxed">
              Changes will be sent to the Venue Manager for approval. Once approved, the new price will automatically reflect on the ticketing portal at the scheduled effective time.
            </p>
          </div>

          {/* Primary CTA */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={loading || !selectedEventId || !selectedTicketTypeId || !newPrice || !reason.trim()}
              className="w-full h-16 bg-primary text-white font-bold text-lg rounded-2xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : 'Submit Price Request'}
              <span className="material-symbols-outlined">send</span>
            </button>
            <p className="text-center text-xs text-gray-400 mt-4 px-8 leading-tight">
              By submitting, you confirm that this change adheres to the venue's pricing policy.
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}

// Wrap with Suspense to handle useSearchParams()
export default function PriceChangeRequestPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0f1212]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <PriceChangeRequestPageContent />
    </Suspense>
  );
}
