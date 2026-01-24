/**
 * POST /api/stripe/webhook
 * Stripe Webhook Handler
 * 
 * Handles Stripe webhook events with:
 * - Signature verification (raw body)
 * - Event idempotency (using event.id)
 * - Event logging (stripe_webhook_events table)
 * - Multiple event types support
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripe, isStripeConfigured } from '@/lib/stripe/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import Stripe from 'stripe';

// Use service role key for webhook to bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Disable body parsing for webhook (must use raw body for signature verification)
export const runtime = 'nodejs';

/**
 * Record webhook event to database for idempotency and debugging
 */
async function recordWebhookEvent(
  eventId: string,
  eventType: string,
  rawEvent: any,
  orderId?: string
): Promise<{ id: string; alreadyProcessed: boolean }> {
  // Check if event already exists
  const { data: existingEvent } = await supabaseAdmin
    .from('stripe_webhook_events')
    .select('id, processed')
    .eq('event_id', eventId)
    .maybeSingle();

  if (existingEvent) {
    return {
      id: existingEvent.id,
      alreadyProcessed: existingEvent.processed === true,
    };
  }

  // Insert new event record
  const { data: newEvent, error } = await supabaseAdmin
    .from('stripe_webhook_events')
    .insert({
      event_id: eventId,
      event_type: eventType,
      processed: false,
      order_id: orderId || null,
      raw_event: rawEvent,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[STRIPE WEBHOOK] Failed to record event:', error);
    throw new Error('Failed to record webhook event');
  }

  return {
    id: newEvent!.id,
    alreadyProcessed: false,
  };
}

/**
 * Mark webhook event as processed
 */
async function markEventProcessed(
  eventId: string,
  orderId?: string,
  errorMessage?: string
): Promise<void> {
  await supabaseAdmin
    .from('stripe_webhook_events')
    .update({
      processed: true,
      processed_at: new Date().toISOString(),
      order_id: orderId || null,
      error_message: errorMessage || null,
    })
    .eq('event_id', eventId);
}

/**
 * Handle checkout.session.completed event
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const orderId = session.client_reference_id || session.metadata?.order_id;

  if (!orderId) {
    throw new Error('Missing order_id in session metadata or client_reference_id');
  }

  // Fetch order
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, user_id, status')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // Check if already processed
  if (order.status === 'paid' || order.status === 'fulfilled') {
    console.log('[STRIPE WEBHOOK] Order already processed:', orderId);
    return { orderId, skipped: true };
  }

  // Update order with Stripe data
  const updateData: {
    status: string;
    stripe_payment_intent_id?: string;
    stripe_customer_id?: string;
  } = {
    status: 'paid',
  };

  if (session.payment_intent) {
    updateData.stripe_payment_intent_id =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent.id;
  }

  if (session.customer) {
    updateData.stripe_customer_id =
      typeof session.customer === 'string' ? session.customer : session.customer.id;
  }

  const { error: orderUpdateError } = await supabaseAdmin
    .from('orders')
    .update(updateData)
    .eq('id', orderId);

  if (orderUpdateError) {
    throw new Error(`Failed to update order: ${orderUpdateError.message}`);
  }

  // Fetch order items
  const { data: orderItems, error: orderItemsError } = await supabaseAdmin
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  if (orderItemsError || !orderItems || orderItems.length === 0) {
    throw new Error('Failed to fetch order items');
  }

  // Generate tickets for each order item
  const tickets = [];
  for (const orderItem of orderItems) {
    // Fetch ticket type and event/venue details
    const { data: ticketType } = await supabaseAdmin
      .from('ticket_types')
      .select('event_id, inventory_limit, sold_count, redeem_limit')
      .eq('id', orderItem.ticket_type_id)
      .single();

    if (!ticketType) {
      console.error('[STRIPE WEBHOOK] Ticket type not found:', orderItem.ticket_type_id);
      continue;
    }

    // Validate availability
    const available =
      ticketType.inventory_limit === null
        ? Infinity
        : ticketType.inventory_limit - ticketType.sold_count;

    if (available < orderItem.quantity) {
      console.error(
        '[STRIPE WEBHOOK] Insufficient availability for ticket type:',
        orderItem.ticket_type_id
      );
      continue;
    }

    // Fetch event to get venue_id
    const { data: event } = await supabaseAdmin
      .from('events')
      .select('venue_id')
      .eq('id', ticketType.event_id)
      .single();

    if (!event) {
      console.error('[STRIPE WEBHOOK] Event not found:', ticketType.event_id);
      continue;
    }

    // Generate tickets
    for (let i = 0; i < orderItem.quantity; i++) {
      const qrSeed = randomBytes(16).toString('hex');

      tickets.push({
        order_id: orderId,
        order_item_id: orderItem.id,
        user_id: order.user_id,
        event_id: ticketType.event_id,
        venue_id: event.venue_id,
        ticket_type_id: orderItem.ticket_type_id,
        qr_seed: qrSeed,
        status: 'active',
        redeem_limit: ticketType.redeem_limit,
        redeemed_count: 0,
      });
    }

    // Update ticket type sold_count atomically
    const { error: updateError } = await supabaseAdmin
      .from('ticket_types')
      .update({
        sold_count: ticketType.sold_count + orderItem.quantity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderItem.ticket_type_id);

    if (updateError) {
      throw new Error(`Failed to update ticket type sold_count: ${updateError.message}`);
    }
  }

  // Insert all tickets
  if (tickets.length > 0) {
    const { error: ticketsError } = await supabaseAdmin.from('tickets').insert(tickets);

    if (ticketsError) {
      throw new Error(`Failed to create tickets: ${ticketsError.message}`);
    }

    // Update order to fulfilled after tickets created
    await supabaseAdmin.from('orders').update({ status: 'fulfilled' }).eq('id', orderId);
  } else {
    throw new Error('No tickets generated');
  }

  return { orderId, skipped: false };
}

/**
 * Handle payment_intent.succeeded event (redundant check)
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  // Find order by payment_intent_id
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, status')
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .maybeSingle();

  if (!order) {
    console.warn('[STRIPE WEBHOOK] Order not found for payment_intent:', paymentIntent.id);
    return;
  }

  // If order is not yet paid, update it (redundant check)
  if (order.status === 'pending_payment') {
    await supabaseAdmin
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', order.id);
    console.log('[STRIPE WEBHOOK] Updated order status from payment_intent.succeeded:', order.id);
  }
}

/**
 * Handle payment_intent.payment_failed event
 */
async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  // Find order by payment_intent_id
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, status')
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .maybeSingle();

  if (!order) {
    console.warn('[STRIPE WEBHOOK] Order not found for payment_intent:', paymentIntent.id);
    return;
  }

  // Update order status to expired if still pending
  if (order.status === 'pending_payment') {
    await supabaseAdmin
      .from('orders')
      .update({ status: 'expired' })
      .eq('id', order.id);
    console.log('[STRIPE WEBHOOK] Updated order status to expired:', order.id);
  }
}

/**
 * Handle charge.refunded event
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  // Find order by payment_intent_id (charge.payment_intent)
  if (!charge.payment_intent) {
    return;
  }

  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent.id;

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, status')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();

  if (!order) {
    console.warn('[STRIPE WEBHOOK] Order not found for charge:', charge.id);
    return;
  }

  // Update order status to refunded
  await supabaseAdmin.from('orders').update({ status: 'refunded' }).eq('id', order.id);
  console.log('[STRIPE WEBHOOK] Updated order status to refunded:', order.id);
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  // Check Stripe configuration
  if (!isStripeConfigured || !stripe) {
    console.warn('[STRIPE WEBHOOK] Stripe not configured, rejecting webhook');
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  // Get raw body (required for signature verification)
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[STRIPE WEBHOOK] Missing signature or webhook secret');
    return NextResponse.json(
      { error: 'Missing signature or webhook secret' },
      { status: 400 }
    );
  }

  // Verify signature
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error('[STRIPE WEBHOOK] Signature verification failed:', err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  console.log(`[STRIPE WEBHOOK] Received event: ${event.type} (${event.id})`);

  // Record event and check idempotency
  let eventRecord: { id: string; alreadyProcessed: boolean };
  let orderId: string | undefined;

  try {
    // Extract order_id from event data if available
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      orderId = session.client_reference_id || session.metadata?.order_id;
    } else if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      // Try to find order by payment_intent_id
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntent.id)
        .maybeSingle();
      orderId = order?.id;
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      if (charge.payment_intent) {
        const paymentIntentId =
          typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent.id;
        const { data: order } = await supabaseAdmin
          .from('orders')
          .select('id')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .maybeSingle();
        orderId = order?.id;
      }
    }

    eventRecord = await recordWebhookEvent(event.id, event.type, event, orderId);

    // If already processed, return early
    if (eventRecord.alreadyProcessed) {
      console.log(`[STRIPE WEBHOOK] Event already processed: ${event.id}`);
      return NextResponse.json({ received: true, message: 'Already processed' });
    }
  } catch (error: any) {
    console.error('[STRIPE WEBHOOK] Failed to record event:', error);
    // Continue processing even if event recording fails (non-blocking)
  }

  // Handle different event types
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const result = await handleCheckoutSessionCompleted(session);
        if (!result.skipped) {
          await markEventProcessed(event.id, result.orderId);
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentSucceeded(paymentIntent);
        await markEventProcessed(event.id, orderId);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentFailed(paymentIntent);
        await markEventProcessed(event.id, orderId);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefunded(charge);
        await markEventProcessed(event.id, orderId);
        break;
      }

      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.async_payment_failed': {
        // Handle async payment events (similar to checkout.session.completed)
        const session = event.data.object as Stripe.Checkout.Session;
        if (event.type === 'checkout.session.async_payment_succeeded') {
          await handleCheckoutSessionCompleted(session);
        } else {
          // Handle async payment failed
          const orderId = session.client_reference_id || session.metadata?.order_id;
          if (orderId) {
            await supabaseAdmin
              .from('orders')
              .update({ status: 'expired' })
              .eq('id', orderId);
          }
        }
        await markEventProcessed(event.id, orderId);
        break;
      }

      default:
        console.log(`[STRIPE WEBHOOK] Unhandled event type: ${event.type}`);
        await markEventProcessed(event.id, orderId);
        return NextResponse.json({ received: true, message: 'Event type not handled' });
    }

    const duration = Date.now() - startTime;
    console.log(
      `[STRIPE WEBHOOK] Successfully processed ${event.type} (${event.id}) in ${duration}ms`
    );

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error(`[STRIPE WEBHOOK] Error processing ${event.type}:`, error);
    await markEventProcessed(event.id, orderId, error.message);
    return NextResponse.json(
      { error: `Failed to process event: ${error.message}` },
      { status: 500 }
    );
  }
}
