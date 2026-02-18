/**
 * Customer Event V2 Detail Page
 * 活动详情页（按天展示票种，支持 paused 状态）
 */

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import { useEventRealtime } from '@/hooks/useEventRealtime';
import BackButton from '@/components/ui/BackButton';
import PosterPreviewModal from '@/components/ui/PosterPreviewModal';

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
  sold_count?: number;
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
  date: string;
  valid_start_at: string;
  valid_end_at: string;
  event_week_id?: string;
  week_start_date?: string;
}

interface EventV2 {
  id: string;
  title: string;
  subtitle?: string | null;
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
    full_address?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
  region?: { id: string; name: string; city?: string | null; state?: string | null } | null;
}

interface WeekConfig {
  event_week_id: string;
  week_start_date: string;
  days: DayConfig[];
  event_status: string;
}

export default function CustomerEventV2DetailPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventV2 | null>(null);
  const [weekConfig, setWeekConfig] = useState<WeekConfig | null>(null);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  
  const idempotencyKeyRef = useRef<string | null>(null);
  // Invite Code State
  const [inviteCode, setInviteCode] = useState('');
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [inviteMessage, setInviteMessage] = useState('');
  const [validatedInviteCode, setValidatedInviteCode] = useState('');

  const fetchData = useCallback(async () => {
    if (!eventId) return;
    try {
      setLoading(true);
      setError(null);

      const [eventResponse, upcomingResponse] = await Promise.all([
        fetch(`/api/public/events-v2/${eventId}`),
        fetch(`/api/public/events-v2/${eventId}/upcoming-days?limit=3`),
      ]);

      const eventResult = await eventResponse.json();
      const upcomingResult = await upcomingResponse.json();

      if (eventResult.error) throw new Error(eventResult.error);
      if (upcomingResult.error) throw new Error(upcomingResult.error);

      setEvent(eventResult);
      setWeekConfig({
        event_week_id: upcomingResult.days?.[0]?.event_week_id ?? '',
        week_start_date: upcomingResult.days?.[0]?.week_start_date ?? '',
        days: upcomingResult.days ?? [],
        event_status: upcomingResult.event_status ?? 'active',
      });
    } catch (err: any) {
      console.error('[CUSTOMER EVENT V2] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (eventId) fetchData();
  }, [eventId, fetchData]);

  useEventRealtime(eventId, fetchData);

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

  const selectedWeekIds = weekConfig
    ? [...new Set(
        weekConfig.days.flatMap((day) => {
          const weekId = (day as DayConfig & { event_week_id?: string }).event_week_id ?? weekConfig.event_week_id;
          const hasSelection = day.tickets.some((t) => (selections[t.id] || 0) > 0);
          return hasSelection ? [weekId] : [];
        })
      )]
    : [];
  const selectionsSpanMultipleWeeks = totalQuantity > 0 && selectedWeekIds.length > 1;

  const validateInviteCode = async () => {
    if (!inviteCode.trim()) {
      setInviteStatus('idle');
      setInviteMessage('');
      setValidatedInviteCode('');
      return;
    }

    setInviteStatus('validating');
    setInviteMessage('');

    try {
      const res = await fetch(
        `/api/public/invites/validate?code=${encodeURIComponent(inviteCode)}&eventId=${eventId}`
      );
      const data = await res.json();

      if (data.ok && data.valid) {
        setInviteStatus('valid');
        setValidatedInviteCode(data.code);
        setInviteMessage(`✓ ${data.ambassadorName || 'Valid code'}`);
      } else {
        setInviteStatus('invalid');
        setValidatedInviteCode('');
        setInviteMessage(data.message || 'Invalid code');
      }
    } catch (e) {
      setInviteStatus('invalid');
      setValidatedInviteCode('');
      setInviteMessage('Validation failed');
    }
  };

  const handleCheckout = async () => {
    if (!event || !weekConfig || totalQuantity === 0) return;

    if (event.status === 'paused' || event.status === 'temp_closed') {
      alert('This event is temporarily closed. Please check back later.');
      return;
    }

    try {
      const items: Array<{
        ticketTypeId: string;
        eventWeekDayId: string;
        quantity: number;
        valid_start_at?: string;
        valid_end_at?: string;
        event_week_id: string;
      }> = [];

      weekConfig.days.forEach((day) => {
        const weekId = (day as DayConfig & { event_week_id?: string }).event_week_id ?? weekConfig.event_week_id;
        day.tickets.forEach((ticket) => {
          const qty = selections[ticket.id] || 0;
          if (qty > 0) {
            items.push({
              ticketTypeId: ticket.id,
              eventWeekDayId: day.id,
              quantity: qty,
              valid_start_at: day.valid_start_at,
              valid_end_at: day.valid_end_at,
              event_week_id: weekId,
            });
          }
        });
      });

      if (items.length === 0) return;

      const weekIds = [...new Set(items.map((i) => i.event_week_id))];
      if (weekIds.length > 1) {
        alert('Please select tickets from one date group only. Clear selections and choose tickets from a single date.');
        return;
      }
      const eventWeekId = weekIds[0];

      const checkoutItems = items.map(({ event_week_id: _, ...rest }) => rest);

      idempotencyKeyRef.current ??= crypto.randomUUID();
      const response = await fetch('/api/public/checkout-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          eventWeekId,
          items: checkoutItems,
          inviteCode: validatedInviteCode || undefined,
          idempotencyKey: idempotencyKeyRef.current,
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
  const enabledDays = weekConfig?.days || [];
  const selectedDay = enabledDays[Math.min(selectedDayIndex, Math.max(0, enabledDays.length - 1))] ?? null;

  return (
    <div className="relative w-full min-h-screen flex flex-col pb-32 bg-background-dark text-white max-w-md mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0A0A0A]/95 backdrop-blur-md border-b border-white/5 p-4">
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
            <>
              <button 
                  type="button"
                  onClick={() => setIsPosterModalOpen(true)}
                  className="w-full relative block group cursor-zoom-in overflow-hidden"
              >
                  <img
                    src={event.poster_url}
                    alt={event.title}
                    className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                  {/* Subtle top fade */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent pointer-events-none" />
                  <span className="absolute bottom-2 right-2 material-symbols-outlined text-white/40 text-lg">zoom_in</span>
              </button>

              <PosterPreviewModal 
                  isOpen={isPosterModalOpen} 
                  onClose={() => setIsPosterModalOpen(false)} 
                  imageUrl={event.poster_url} 
              />
            </>
        )}

        {/* Event Info */}
        <div className="p-5">
          <h1 className="text-2xl font-bold text-white mb-2">{event.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500 mb-4">
            <span>21+</span>
          </div>
          {/* Venue / Full Address / View on Map */}
          {(event.venue?.name || event.venue?.full_address || event.venue?.address || event.venue?.city) && (
            <div className="mb-5 flex flex-col gap-1.5">
              {event.venue.name && event.venue.name !== 'Venue TBD' && (
                <div className="flex items-center gap-2 text-white font-medium text-base">
                  <span className="material-symbols-outlined text-base text-zinc-500 leading-none shrink-0">location_on</span>
                  <span className="leading-tight">{event.venue.name}</span>
                </div>
              )}
              {(event.venue.full_address || event.venue.address || event.venue.city || event.venue.state) && (
                <div className="text-sm text-zinc-500 ml-6 leading-relaxed">
                  {event.venue.full_address
                    || event.venue.address
                    || [event.venue.city ?? event.region?.city, event.venue.state ?? event.region?.state ?? event.region?.name].filter(Boolean).join(', ')}
                </div>
              )}
              {(() => {
                const q = event.venue.full_address || event.venue.address
                  || (event.venue.city || event.venue.state
                    ? `${event.venue.name || ''} ${event.venue.city || ''} ${event.venue.state || ''}`.trim()
                    : event.venue.name && event.venue.name !== 'Venue TBD'
                      ? event.venue.name
                      : null);
                if (!q) return null;
                return (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-6 inline-flex items-center gap-1 text-xs text-[#D4AF37] hover:underline"
                  >
                    View on Map
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                  </a>
                );
              })()}
            </div>
          )}

          {event.description && (
            <div className="mb-5">
              <p
                className={`text-zinc-400 text-sm ${descriptionExpanded ? '' : 'line-clamp-3'}`}
                style={{ lineHeight: 1.6 }}
              >
                {event.description}
              </p>
              <button
                type="button"
                onClick={() => setDescriptionExpanded((e) => !e)}
                className="mt-1 text-xs font-medium text-zinc-500 hover:text-zinc-400"
              >
                {descriptionExpanded ? 'Less' : 'More'}
              </button>
            </div>
          )}

          {/* Date Pills */}
          {enabledDays.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-4 -mx-1 no-scrollbar">
              {enabledDays.map((day, i) => {
                const [y, m, d] = day.date.split('-').map(Number);
                const dayDate = new Date(y, m - 1, d);
                const label = dayDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
                const selected = i === selectedDayIndex;
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => setSelectedDayIndex(i)}
                    className={`shrink-0 px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                      selected
                        ? 'bg-[#D4AF37] text-[#121212] scale-[1.02]'
                        : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Tickets for selected day */}
          {enabledDays.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>No tickets available</p>
            </div>
          ) : !selectedDay ? null : (
            <div className="space-y-4">
              {selectedDay.tickets.length === 0 ? (
                <p className="text-sm text-zinc-500">No tickets for this date</p>
              ) : (
                <div className="space-y-3">
                        {selectedDay.tickets.map((ticket) => {
                          const qty = selections[ticket.id] || 0;
                          const isAvailable = ticket.status === 'active' && !isPaused;

                          return (
                            <div key={ticket.id} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors duration-[120ms] active:scale-[0.995]">
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
                                      disabled={ticket.inventory_limit != null && qty >= Math.max(0, ticket.inventory_limit - (ticket.sold_count ?? 0))}
                                      className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white disabled:opacity-20 transition-all active:scale-95"
                                    >
                                      <span className="material-symbols-outlined text-[18px]">add</span>
                                    </button>
                                  </div>
                              ) : (
                                  <span className="text-[10px] text-zinc-500 font-medium uppercase">
                                    {isPaused ? 'Closed' : ticket.status === 'sold_out' ? 'Sold Out' : 'N/A'}
                                  </span>
                              )}
                            </div>
                          );
                        })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Sticky Buy Bar */}
      {totalQuantity > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0A0A0A]/95 backdrop-blur-md border-t border-white/5 p-4 max-w-md mx-auto">
          {selectionsSpanMultipleWeeks && (
            <p className="mb-2 text-xs text-amber-400">Select tickets from one date only</p>
          )}
          <div className="flex items-center gap-4">
            <div className="text-sm text-zinc-400">
              {totalQuantity} {totalQuantity === 1 ? 'Ticket' : 'Tickets'} · <span className="text-white font-bold">${totalPrice.toFixed(0)}</span>
            </div>
            <button
              onClick={handleCheckout}
              disabled={isPaused || totalQuantity === 0 || selectionsSpanMultipleWeeks}
              className="flex-1 py-3.5 rounded-xl font-bold text-[#121212] bg-[#D4AF37] hover:bg-[#E8B94B] active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:scale-100"
            >
              Buy Now
            </button>
          </div>
          {/* Collapsible invite code */}
          <details className="mt-2 group">
            <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400">Have a code?</summary>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                onBlur={validateInviteCode}
                placeholder="Code"
                disabled={inviteStatus === 'validating'}
                className={`flex-1 px-3 py-2 rounded-lg bg-white/5 text-sm font-mono uppercase ${
                  inviteStatus === 'valid' ? 'border border-green-500/50 text-green-400' : inviteStatus === 'invalid' ? 'border border-red-500/50' : 'border border-white/10'
                }`}
              />
              <button onClick={validateInviteCode} disabled={!inviteCode.trim()} className="px-3 py-2 rounded-lg bg-white/10 text-sm font-medium disabled:opacity-40">
                Apply
              </button>
            </div>
            {inviteMessage && <p className={`mt-1 text-xs ${inviteStatus === 'valid' ? 'text-green-400' : 'text-red-400'}`}>{inviteMessage}</p>}
          </details>
        </div>
      )}
    </div>
  );
}
