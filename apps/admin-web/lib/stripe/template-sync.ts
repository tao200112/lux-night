/**
 * Stripe Template Sync
 *
 * Creates/updates Stripe Products and Prices for ticket_type_templates.
 * Product names use event title + day name + ticket name (no week date).
 * Called from admin template save endpoint.
 *
 * Existing syncEventWeekStripe and syncEventWeekStripeIfNeeded are NOT
 * modified — they continue to operate on instance rows and correctly
 * skip when IDs are already present.
 */

import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday',
];

export interface TemplateSyncResult {
  synced: number;
  skipped: number;
  errors: string[];
}

export async function syncTemplateStripe(
  eventId: string
): Promise<TemplateSyncResult> {
  const result: TemplateSyncResult = { synced: 0, skipped: 0, errors: [] };

  if (!process.env.STRIPE_SECRET_KEY) {
    result.errors.push('STRIPE_SECRET_KEY not configured');
    return result;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
  });
  const supabase = createAdminClient();

  const { data: event, error: eventErr } = await supabase
    .from('events_v2')
    .select('id, title, merchant_id')
    .eq('id', eventId)
    .single();

  if (eventErr || !event) {
    result.errors.push('Event not found');
    return result;
  }

  const { data: templateDays, error: daysErr } = await supabase
    .from('event_day_templates')
    .select(`
      id, dow,
      ticket_type_templates (
        id, name, category, price_cents, status,
        stripe_product_id, stripe_price_id
      )
    `)
    .eq('event_id', eventId)
    .order('dow');

  if (daysErr || !templateDays) {
    result.errors.push('No template days found');
    return result;
  }

  for (const day of templateDays) {
    const dayName = DAY_NAMES[day.dow] ?? `Day ${day.dow}`;

    for (const ticket of (day as any).ticket_type_templates ?? []) {
      if (ticket.status !== 'active') {
        result.skipped++;
        continue;
      }

      try {
        let productId: string | null = ticket.stripe_product_id;
        let priceId: string | null = ticket.stripe_price_id;

        // Create Product if missing
        if (!productId) {
          const product = await stripe.products.create({
            name: `${event.title} – ${dayName} – ${ticket.name}`,
            description: ticket.name,
            metadata: {
              event_id: eventId,
              ticket_type_template_id: ticket.id,
              merchant_id: event.merchant_id,
            },
          });
          productId = product.id;
        }

        // Create Price if missing or price changed
        let needsNewPrice = !priceId;
        if (priceId) {
          try {
            const existing = await stripe.prices.retrieve(priceId);
            if (existing.unit_amount !== ticket.price_cents) {
              try {
                await stripe.prices.update(priceId, { active: false });
              } catch { /* old price may already be inactive */ }
              needsNewPrice = true;
            }
          } catch {
            needsNewPrice = true;
          }
        }

        if (needsNewPrice) {
          const price = await stripe.prices.create({
            product: productId,
            unit_amount: ticket.price_cents,
            currency: 'usd',
            metadata: {
              event_id: eventId,
              ticket_type_template_id: ticket.id,
              merchant_id: event.merchant_id,
            },
          });
          priceId = price.id;
        }

        // Update template row with IDs
        await supabase
          .from('ticket_type_templates')
          .update({
            stripe_product_id: productId,
            stripe_price_id: priceId,
          })
          .eq('id', ticket.id);

        result.synced++;
      } catch (e: any) {
        result.errors.push(`${ticket.name}: ${e.message || String(e)}`);
      }
    }
  }

  return result;
}
