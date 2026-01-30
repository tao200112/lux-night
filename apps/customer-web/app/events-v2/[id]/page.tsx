/**
 * Customer Event V2 Detail Page
 * 活动详情页（按天展示票种，支持 paused 状态）
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import BackButton from '@/components/ui/BackButton';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface TicketType {
  id: string;
  name: string;
  category: string;
  price_cents: number;
  currency: string;
  min_age: number | null;
  inventory_limit: number | null;
  status: string;
  stripe_price_id: string | null;
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

interface EventV2 {
  id: string;
  title: string;
  description: string | null;
  poster_url: string;
  status: 'active' | 'paused' | 'temp_closed' | 'archived';
  merchant: {
    id: string;
    name: string;
  };
  venue: {
    id: string;
    name: string;
    address: string | null;
  } | null;
}

interface WeekConfig {
  event_week_id: string;
  week_start_date: string;
  days: DayConfig[];
  event_status: string;
}

export default function CustomerEventV2DetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventV2 | null>(null);
  const [weekConfig, setWeekConfig] = useState<WeekConfig | null>(null);
  const [selections, setSelections] = useState<Record<string, number>>({}); // ticketTypeId -> quantity

  useEffect(() => {
    if (eventId) {
      fetchData();
    }
  }, [eventId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch event and week config in parallel
      const [eventResponse, weekResponse] = await Promise.all([
        fetch(`/api/public/events-v2/${eventId}`),
        fetch(`/api/public/events-v2/${eventId}/week?date=${new Date().toISOString().split('T')[0]}`),
      ]);

      const eventResult = await eventResponse.json();
      const weekResult = await weekResponse.json();

      if (eventResult.error) {
        throw new Error(eventResult.error);
      }

      if (weekResult.error) {
        throw new Error(weekResult.error);
      }

      setEvent(eventResult);
      setWeekConfig(weekResult);
    } catch (err: any) {
      console.error('[CUSTOMER EVENT V2] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = (ticketTypeId: string, delta: number) => {
    setSelections((prev) => {
      const current = prev[ticketTypeId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [ticketTypeId]: next };
    });
  };

  const totalQuantity = Object.values(selections).reduce((a, b) => a + b, 0);
  const totalPrice = weekConfig
    ? weekConfig.days.reduce((sum, day) => {
        return (
          sum +
          day.tickets.reduce((daySum, ticket) => {
            const qty = selections[ticket.id] || 0;
            return daySum + (ticket.price_cents / 100) * qty;
          }, 0)
        );
      }, 0)
    : 0;

  const handleCheckout = async () => {
    if (!event || !weekConfig || totalQuantity === 0) return;

    // Check if event is paused
    if (event.status === 'paused' || event.status === 'temp_closed') {
      alert('This event is temporarily closed. Please check back later.');
      return;
    }

    try {
      // Build items array from selections
      const items: Array<{
        ticketTypeId: string;
        eventWeekDayId: string;
        quantity: number;
      }> = [];

      weekConfig.days.forEach((day) => {
        day.tickets.forEach((ticket) => {
          const qty = selections[ticket.id] || 0;
          if (qty > 0) {
            items.push({
              ticketTypeId: ticket.id,
              eventWeekDayId: day.id,
              quantity: qty,
            });
          }
        });
      });

      if (items.length === 0) {
        return;
      }

      // Call checkout API
      const response = await fetch('/api/public/checkout-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          eventWeekId: weekConfig.event_week_id,
          items,
        }),
      });

      const result = await response.json();

      if (!result.success || !result.data?.sessionId) {
        throw new Error(result.error?.message || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      const stripe = await import('@stripe/stripe-js').then((m) => m.loadStripe);
      const stripeInstance = await stripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

      if (!stripeInstance) {
        throw new Error('Stripe failed to load');
      }

      const { error: stripeError } = await stripeInstance.redirectToCheckout({
        sessionId: result.data.sessionId,
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }
    } catch (err: any) {
      console.error('[CUSTOMER EVENT V2] Checkout error:', err);
      alert('Failed to proceed to checkout: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="relative w-full min-h-screen flex flex-col pb-32 bg-background-dark text-white max-w-md mx-auto">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error || !event || !weekConfig) {
    return (
      <div className="relative w-full min-h-screen flex flex-col pb-32 bg-background-dark text-white max-w-md mx-auto">
        <header className="sticky top-0 z-40 bg-background-dark/95 backdrop-blur-xl border-b border-white/5 p-4">
          <BackButton />
        </header>
        <main className="flex-1 p-4">
          <div className="text-red-400">{error || 'Failed to load event'}</div>
        </main>
      </div>
    );
  }

  const isPaused = event.status === 'paused' || event.status === 'temp_closed';
  
  // Filter days: Only show future days (or active today)
  // Assumption: week_start_date is YYYY-MM-DD local to venue. 
  // We approximate using browser time.
  // Filter days: Only show future days (or active today)
  // Assumption: week_start_date is YYYY-MM-DD local to venue. 
  // We approximate using browser time.
  const enabledDays = weekConfig.days.filter((day) => {
     if (!day.enabled) return false;
     
     // Construct approx End Time for this day
     // Week Start is Monday. Dow 0=Monday.
     const d = new Date(weekConfig.week_start_date + 'T00:00:00');
     const offset = day.dow; // DB: 0=Mon, 1=Tue...6=Sun
     d.setDate(d.getDate() + offset);
     
     const [h, m] = day.end_time.split(':');
     d.setHours(parseInt(h), parseInt(m));
     if (day.end_next_day) d.setDate(d.getDate() + 1);

     // Strict comparison: End time must be in the future
     return d > new Date();
  });

  return (
    <div className="relative w-full min-h-screen flex flex-col pb-32 bg-background-dark text-white max-w-md mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background-dark/95 backdrop-blur-xl border-b border-white/5 p-4">
        <BackButton />
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Paused Banner */}
        {isPaused && (
          <div className="bg-yellow-500/20 border-b border-yellow-500/50 p-4 text-center">
            <p className="text-yellow-400 font-medium">Temporarily Closed</p>
            <p className="text-sm text-yellow-300/80 mt-1">
              This event is currently unavailable for purchase
            </p>
          </div>
        )}

        {/* Event Poster */}
        {event.poster_url && (
          <img
            src={event.poster_url}
            alt={event.title}
            className="w-full h-64 object-cover"
          />
        )}

        {/* Event Info */}
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-2">{event.title}</h1>
          {event.description && (
            <p className="text-gray-400 mb-4">{event.description}</p>
          )}

          {/* Venue Address */}
          {event.venue?.address && (
            <div className="mb-4 text-sm text-gray-400">
              <span className="material-symbols-outlined inline-block mr-2">location_on</span>
              {event.venue.address}
            </div>
          )}

          {/* Week Info */}
          <div className="mb-6 text-sm text-gray-400">
            Week of {new Date(weekConfig.week_start_date).toLocaleDateString()}
          </div>

          {/* Days with Tickets */}
          {enabledDays.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>No tickets available for this week</p>
            </div>
          ) : (
            <div className="space-y-6">
              {enabledDays.map((day) => {
                const dayDate = new Date(weekConfig.week_start_date + 'T00:00:00');
                const offset = day.dow;
                dayDate.setDate(dayDate.getDate() + offset);
                // Simple Date Header
                const dateHeader = dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

                return (
                  <div key={day.dow} className="mb-8 last:mb-20">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 pl-1">
                      {dateHeader} <span className="font-normal opacity-50 ml-2">| {day.start_time}</span>
                    </h3>

                    {day.tickets.length === 0 ? (
                      <p className="text-sm text-zinc-600 pl-1">No tickets available</p>
                    ) : (
                      <div className="bg-[#1A1A1A] rounded-xl overflow-hidden border border-white/5 divide-y divide-white/5">
                        {day.tickets.map((ticket) => {
                          const qty = selections[ticket.id] || 0;
                          const isAvailable = ticket.status === 'active' && !isPaused;

                          return (
                            <div key={ticket.id} className="flex items-center justify-between p-4 active:bg-white/[0.02]">
                              {/* Left: Info */}
                              <div className="flex-1 min-w-0 pr-4">
                                <div className="font-medium text-white text-[15px]">{ticket.name}</div>
                                <div className="text-[11px] text-zinc-500 mt-0.5">
                                   {ticket.category}
                                   {ticket.min_age ? ` • ${ticket.min_age}+` : ''}
                                </div>
                              </div>

                              {/* Mid: Price */}
                              <div className="text-[15px] font-medium text-[rgb(212,175,55)] mr-6 min-w-[3rem] text-right">
                                ${(ticket.price_cents / 100).toFixed(0)}
                              </div>

                              {/* Right: Controls */}
                              {isAvailable ? (
                                  <div className="flex items-center gap-3">
                                    <button
                                      onClick={() => updateQuantity(ticket.id, -1)}
                                      disabled={qty === 0}
                                      className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white disabled:opacity-20 transition-all active:scale-95"
                                    >
                                      <span className="material-symbols-outlined text-[18px]">remove</span>
                                    </button>
                                    <span className="w-4 text-center text-[15px] font-medium tabular-nums">{qty}</span>
                                    <button
                                      onClick={() => updateQuantity(ticket.id, 1)}
                                      disabled={ticket.inventory_limit !== null && qty >= ticket.inventory_limit}
                                      className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white disabled:opacity-20 transition-all active:scale-95"
                                    >
                                      <span className="material-symbols-outlined text-[18px]">add</span>
                                    </button>
                                  </div>
                              ) : (
                                  <div className="text-[10px] text-zinc-500 font-bold px-2 py-1 bg-white/5 rounded uppercase tracking-wider">
                                      {isPaused ? 'Closed' : ticket.status === 'sold_out' ? 'Sold Out' : 'N/A'}
                                  </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Checkout Footer */}
      {totalQuantity > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background-dark/95 backdrop-blur-xl border-t border-white/5 p-4 max-w-md mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-gray-400">
                {totalQuantity} {totalQuantity === 1 ? 'ticket' : 'tickets'}
              </div>
              <div className="text-xl font-bold">${totalPrice.toFixed(2)}</div>
            </div>
            <Button
              onClick={handleCheckout}
              disabled={isPaused || totalQuantity === 0}
              variant="primary"
              fullWidth={false}
            >
              {isPaused ? 'Temporarily Closed' : 'Checkout'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
