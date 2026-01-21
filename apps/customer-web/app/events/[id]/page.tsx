'use client';

import React, { useState, useEffect } from 'react';
import { getEvent } from '@/lib/data/events';
import { getTicketTypes } from '@/lib/data/ticket-types';
import { EventWithVenue } from '@/lib/data/events';
import { TicketType } from '@/lib/data/ticket-types';
import Button from '../../../components/ui/Button';
import BackButton from '../../../components/ui/BackButton';
import { useRouter } from 'next/navigation';

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [eventId, setEventId] = useState<string>('');
  const [event, setEvent] = useState<EventWithVenue | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, number>>({});

  // Resolve params (Next.js 15 always provides Promise)
  useEffect(() => {
    async function resolveParams() {
      const resolved = await params;
      setEventId(resolved.id);
    }
    resolveParams();
  }, [params]);

  useEffect(() => {
    if (!eventId) {
      console.log('[EventDetailPage] No eventId, waiting...');
      return;
    }

    console.log('[EventDetailPage] eventId resolved:', eventId);

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        console.log('[EventDetailPage] Fetching data for event:', eventId);

        // Fetch event and ticket types in parallel
        const [eventData, ticketTypesData] = await Promise.all([
          getEvent(eventId).catch((err) => {
            console.error('[EventDetailPage] getEvent failed:', err);
            throw err;
          }),
          getTicketTypes(eventId).catch((err) => {
            console.error('[EventDetailPage] getTicketTypes failed:', err);
            throw err;
          }),
        ]);

        console.log('[EventDetailPage] Fetch results:', {
          hasEvent: !!eventData,
          ticketTypesCount: ticketTypesData?.length || 0,
        });

        if (!eventData) {
          throw new Error('Event not found');
        }

        setEvent(eventData);
        setTicketTypes(ticketTypesData || []);
        console.log('[EventDetailPage] Data set successfully');
      } catch (err: any) {
        console.error('[EventDetailPage] Error in fetchData:', {
          message: err.message,
          stack: err.stack,
          error: err,
        });
        setError(err.message || 'Failed to load event');
        setEvent(null);
        setTicketTypes([]);
      } finally {
        setLoading(false);
        console.log('[EventDetailPage] Loading complete');
      }
    }

    fetchData();
  }, [eventId]);

  const updateQuantity = (tierId: string, delta: number, max: number) => {
    setSelections((prev: Record<string, number>) => {
      const current = prev[tierId] || 0;
      const next = Math.max(0, Math.min(max, current + delta));
      return { ...prev, [tierId]: next };
    });
  };

  const totalQuantity = Object.values(selections).reduce((a: number, b: number) => a + b, 0);
  const totalPrice = ticketTypes.reduce((sum, tier) => {
    return sum + ((tier.price_cents / 100) * (selections[tier.id] || 0));
  }, 0);

  const handleCheckout = async () => {
    if (!event) return;

    // Build items array from selections
    const items = Object.entries(selections)
      .filter(([_, qty]) => qty > 0)
      .map(([tierId, quantity]) => ({
        ticketTypeId: tierId,
        quantity: quantity,
      }));

    if (items.length === 0) {
      return;
    }

    // Store selections in localStorage for checkout page
    localStorage.setItem('checkout_items', JSON.stringify(items));
    localStorage.setItem('checkout_eventId', event.id);
    localStorage.setItem('checkout_total', totalPrice.toString());

    router.push(`/checkout?eventId=${event.id}&total=${totalPrice}`);
  };

  // Loading state
  if (loading) {
    return (
      <div className="relative w-full min-h-screen flex flex-col pb-32 bg-background-dark text-white max-w-md mx-auto shadow-2xl overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !event) {
    return (
      <div className="relative w-full min-h-screen flex flex-col pb-32 bg-background-dark text-white max-w-md mx-auto shadow-2xl overflow-hidden">
        <header className="absolute top-0 left-0 w-full flex items-center justify-between p-4 pt-12 z-20">
          <BackButton />
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <span className="material-symbols-outlined text-4xl text-alert-red mb-4">error</span>
          <h3 className="text-lg font-bold text-white mb-2">Error loading event</h3>
          <p className="text-sm text-gray-500 mb-6">{error || 'Event not found'}</p>
          <Button onClick={() => router.back()}>Go Back</Button>
        </div>
      </div>
    );
  }

  // Format date and time
  const eventDate = new Date(event.start_at);
  const formattedDate = eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const formattedTime = eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  // Age policy tags
  const ageTag = event.age_policy === '21+' ? '21+' : event.age_policy === 'UNDER21' ? '18+' : 'ALL AGES';

  return (
    <div className="relative w-full min-h-screen flex flex-col pb-32 bg-background-dark text-white max-w-md mx-auto shadow-2xl overflow-hidden">
      {/* Hero Image */}
      <div className="relative w-full h-[55vh] shrink-0">
        {event.poster_url ? (
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${event.poster_url}')` }}></div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5"></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-background-dark"></div>
        <div className="absolute top-0 left-0 w-full flex items-center justify-between p-4 pt-12 z-20">
          <BackButton />
        </div>
      </div>

      {/* Content */}
      <div className="px-5 -mt-16 relative z-10 flex flex-col gap-8 w-full">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-white drop-shadow-xl">
              {event.title.split(':')[0]}<br/>
              <span className="text-primary drop-shadow-[0_0_15px_rgba(225,191,107,0.5)]">{event.title.split(':')[1]?.trim() || 'Live'}</span>
            </h1>
            <div className="flex flex-wrap gap-2.5">
              <div className="px-3 py-1.5 rounded-full border border-white/20 bg-lux-card/80 backdrop-blur-md text-white text-xs font-bold tracking-wide flex items-center gap-1.5 shadow-md">
                <span className="material-symbols-outlined text-[16px] text-primary">verified_user</span> {ageTag}
              </div>
              {event.refund_policy !== 'no_refund' && (
                <div className="px-3 py-1.5 rounded-full border border-white/20 bg-lux-card/80 backdrop-blur-md text-white text-xs font-bold tracking-wide flex items-center gap-1.5 shadow-md">
                  <span className="material-symbols-outlined text-[16px] text-primary">receipt_long</span> {event.refund_policy.toUpperCase()}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-col gap-3.5 pt-1">
            <div className="flex items-start gap-4">
              <div className="mt-0.5 size-10 rounded-xl bg-lux-card border border-white/5 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-[20px]">calendar_month</span>
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold text-white leading-tight">{formattedDate}, {formattedTime}</span>
                <span className="text-sm text-gray-400">Doors open 30m prior</span>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="mt-0.5 size-10 rounded-xl bg-lux-card border border-white/5 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-[20px]">location_on</span>
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold text-white leading-tight">{event.venue?.name || 'Venue TBA'}</span>
                <span className="text-sm text-gray-400">{event.venue?.address || 'Location details coming soon'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

        {/* Ticket Selection */}
        <div className="flex flex-col gap-6">
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-bold text-white tracking-tight">Select Tickets</h2>
            <span className="text-xs text-primary font-medium uppercase tracking-widest mb-1">{ticketTypes.length} Tiers Available</span>
          </div>
          
          {event.description && (
            <div className="flex flex-col gap-3 pb-8">
              <h2 className="text-xl font-bold text-white">About the Event</h2>
              <p className="text-lux-gray leading-relaxed text-sm">
                {event.description}
              </p>
              <div className="flex items-center gap-1 text-primary text-sm font-bold mt-1 cursor-pointer hover:underline">
                Read More <span className="material-symbols-outlined text-sm">arrow_outward</span>
              </div>
            </div>
          )}
          
          {event.venue?.address && (
            <div className="w-full h-40 rounded-2xl overflow-hidden relative mb-6">
              <div className="absolute inset-0 bg-cover bg-center grayscale opacity-60" style={{ backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuDsNxATJ4mD3Ch3nrsQS-t2_doKpPmP_sfPlUem600ZZq4g409IWenyzBAlvF5gkJk8wk0lDU6Qd4BZH8aTxUddGh352oVSdogADRuwP3u87_gu9oA4B--eCU1-WXxJZGVItzFEmvQRiu1iubkwji54JxI0_ybXxzJYqM_hC2ywT4BCzUcLIIvrkZOsMGSJg1td6nI8H1sCiDg0oum5L_lE7YXKDwliCbd8bBEvtccGiof3cksPOvcwkM2A6TN2XQDuxmSM_ZQ9gWbv')` }}></div>
              <div className="absolute inset-0 bg-lux-black/30"></div>
              <div className="absolute bottom-3 right-3 bg-lux-card/90 backdrop-blur border border-white/10 px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1">
                Get Directions <span className="material-symbols-outlined text-xs">near_me</span>
              </div>
            </div>
          )}
          
          {ticketTypes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-white/10 bg-white/5">
              <span className="material-symbols-outlined text-4xl text-gray-500 mb-4">confirmation_number</span>
              <h3 className="text-lg font-bold text-white mb-2">No tickets available</h3>
              <p className="text-sm text-gray-500">Tickets will be available soon</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {ticketTypes.map(tier => {
                const quantity = selections[tier.id] || 0;
                // 使用 quantity_total 如果存在，否则使用 inventory_limit（向后兼容）
                const totalQuantity: number = tier.quantity_total ?? tier.inventory_limit ?? Infinity;
                const available = totalQuantity === Infinity ? Infinity : totalQuantity - (tier.sold_count || 0);
                const isSoldOut = available === 0;
                const maxPerOrder = tier.max_per_order || tier.redeem_limit || 4;
                const maxQuantity = Math.min(maxPerOrder, available === Infinity ? 10 : available, 10); // Limit to 10 per order

                return (
                  <div key={tier.id} className={`group relative overflow-hidden rounded-2xl bg-lux-card border border-white/10 transition-all duration-300 hover:border-primary/40 hover:bg-lux-card/80 p-5 ${(typeof totalQuantity === 'number' && totalQuantity !== Infinity && available < 10) ? '' : ''}`}>
                    {(typeof totalQuantity === 'number' && totalQuantity !== Infinity && available < 10 && !isSoldOut) && (
                      <div className="absolute -top-10 -right-10 w-24 h-24 bg-primary/20 blur-3xl rounded-full pointer-events-none"></div>
                    )}
                    {isSoldOut && (
                      <div className="absolute inset-0 bg-black/60 z-20 flex items-center justify-center backdrop-blur-[1px]">
                        <span className="text-red-500 font-bold uppercase tracking-widest border-2 border-red-500 px-4 py-2 rounded -rotate-12">Sold Out</span>
                      </div>
                    )}
                    
                    <div className="flex flex-col gap-5 relative z-10">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                          {tier.age_requirement && tier.age_requirement !== 'NONE' && (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              {tier.age_requirement === '18_PLUS' ? '18+' : '21+'}
                            </span>
                          )}
                          {totalQuantity !== Infinity && available < 10 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary text-black uppercase tracking-wide">Limited</span>
                          )}
                        </div>
                        <p className="text-sm text-lux-gray mt-1.5 leading-relaxed">
                          {tier.description || (tier.category === 'ENTRY' ? 'Entry to the main floor, live DJ set access, and open bar until midnight.' : tier.category === 'DRINK' ? 'One free drink included.' : tier.category === 'SKIP_LINE' ? 'Skip the line and enter faster.' : 'Private booth for 4, 2 premium bottles, personal server, and skip-the-line.')}
                        </p>
                      </div>
                      <div className="flex items-center justify-between border-t border-white/5 pt-4">
                        <span className="text-2xl font-bold text-primary tracking-tight">${(tier.price_cents / 100).toFixed(0)}</span>
                        <div className="flex items-center gap-4 bg-black/40 rounded-full px-2 py-1.5 border border-white/10">
                          <button
                            onClick={() => updateQuantity(tier.id, -1, maxQuantity)}
                            disabled={quantity === 0 || isSoldOut}
                            className={`size-9 rounded-full flex items-center justify-center transition active:scale-90 ${
                              quantity === 0 || isSoldOut 
                                ? 'bg-transparent text-white/50 cursor-not-allowed' 
                                : 'bg-white/5 text-white hover:bg-white/10'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[20px]">remove</span>
                          </button>
                          <span className={`text-lg font-bold w-4 text-center tabular-nums ${quantity === 0 ? 'text-white/50' : 'text-white'}`}>{quantity}</span>
                          <button
                            onClick={() => updateQuantity(tier.id, 1, maxQuantity)}
                            disabled={quantity >= maxQuantity || isSoldOut}
                            className={`size-9 rounded-full flex items-center justify-center transition active:scale-90 ${
                              quantity >= maxQuantity || isSoldOut
                                ? 'bg-lux-card border border-white/20 text-white hover:border-primary hover:text-primary'
                                : 'bg-primary text-lux-black hover:brightness-110 shadow-glow'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[20px]">add</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Bar */}
      {totalQuantity > 0 && (
        <div className="fixed bottom-0 left-0 w-full z-50">
          <div className="absolute inset-0 bg-lux-black/80 backdrop-blur-xl border-t border-white/5"></div>
          <div className="relative w-full max-w-lg mx-auto px-5 pt-4 pb-8">
            <div className="flex items-center justify-between gap-6">
              <div className="flex flex-col">
                <span className="text-[10px] text-lux-gray font-bold uppercase tracking-widest mb-0.5">Total</span>
                <span className="text-3xl font-extrabold text-white tracking-tight">${totalPrice.toFixed(2)}</span>
              </div>
              <button 
                onClick={handleCheckout} 
                className="flex-1 h-14 bg-primary text-lux-black rounded-xl font-bold text-lg shadow-glow-lg flex items-center justify-center gap-2 hover:brightness-110 transition active:scale-[0.98] group"
              >
                Checkout
                <span className="material-symbols-outlined text-2xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
