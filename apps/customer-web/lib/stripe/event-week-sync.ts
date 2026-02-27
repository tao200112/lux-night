/**
 * Stripe Event Week Sync (customer-web)
 * 当 RPC 创建新周时自动同步，确保 stripe_price_id 存在
 * 仅当 STRIPE_SECRET_KEY 配置时执行
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' });
}

export async function syncEventWeekStripeIfNeeded(eventWeekId: string): Promise<void> {
  const stripe = getStripe();
  const supabase = getAdminClient();
  if (!stripe || !supabase) return;

  try {
    const { data: eventWeek, error: weekError } = await supabase
      .from('event_weeks')
      .select(`
        id,
        event_id,
        week_start_date,
        timezone,
        events_v2!inner (id, title, merchant_id)
      `)
      .eq('id', eventWeekId)
      .single();

    if (weekError || !eventWeek) return;
    const event = Array.isArray(eventWeek.events_v2) ? eventWeek.events_v2[0] : eventWeek.events_v2;
    if (!event) return;

    const { data: days, error: daysError } = await supabase
      .from('event_week_days')
      .select(`
        id,
        dow,
        ticket_types_v2!inner (id, name, price_cents, status, stripe_product_id, stripe_price_id)
      `)
      .eq('event_week_id', eventWeekId);

    if (daysError || !days) return;

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const day of days) {
      for (const ticket of day.ticket_types_v2 || []) {
        if (ticket.status !== 'active') continue;
        if (ticket.stripe_price_id) continue;

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await syncOneTicketType(supabase as any,
            stripe,
            ticket.id,
            event.title,
            eventWeek.week_start_date,
            dayNames[day.dow] || `Day ${day.dow}`,
            ticket.name,
            ticket.price_cents,
            event.merchant_id,
            eventWeek.event_id,
            eventWeekId,
            day.id
          );
        } catch (e) {
          console.error('[syncEventWeekStripeIfNeeded] Failed for ticket', ticket.id, e);
        }
      }
    }
  } catch (e) {
    console.error('[syncEventWeekStripeIfNeeded] Error:', e);
  }
}

async function syncOneTicketType(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  stripe: Stripe,
  ticketTypeId: string,
  eventTitle: string,
  weekStartDate: string,
  dayName: string,
  ticketName: string,
  priceCents: number,
  merchantId: string,
  eventId: string,
  eventWeekId: string,
  eventWeekDayId: string
): Promise<void> {
  const { data: ticketType, error: fetchError } = await supabase
    .from('ticket_types_v2')
    .select('*')
    .eq('id', ticketTypeId)
    .single();

  if (fetchError || !ticketType) return;

  let productId = ticketType.stripe_product_id;
  let priceId = ticketType.stripe_price_id;

  if (!productId) {
    const product = await stripe.products.create({
      name: `${eventTitle} - ${weekStartDate} - ${dayName} - ${ticketName}`,
      description: ticketName,
      metadata: {
        event_id: eventId,
        event_week_id: eventWeekId,
        event_week_day_id: eventWeekDayId,
        ticket_type_id: ticketTypeId,
        merchant_id: merchantId,
      },
    });
    productId = product.id;
  }

  let needsNewPrice = !priceId;
  if (priceId) {
    try {
      const existing = await stripe.prices.retrieve(priceId);
      if (existing.unit_amount !== priceCents) needsNewPrice = true;
    } catch {
      needsNewPrice = true;
    }
  }

  if (needsNewPrice) {
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: priceCents,
      currency: 'usd',
      metadata: {
        event_id: eventId,
        event_week_id: eventWeekId,
        event_week_day_id: eventWeekDayId,
        ticket_type_id: ticketTypeId,
        merchant_id: merchantId,
      },
    });
    priceId = price.id;
  }

  await supabase
    .from('ticket_types_v2')
    .update({ stripe_product_id: productId, stripe_price_id: priceId })
    .eq('id', ticketTypeId);
}
