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
 * Returns: { id, alreadyProcessed }
 * If event_id already exists (unique constraint), returns existing record
 */
async function recordWebhookEvent(
  eventId: string,
  eventType: string,
  rawEvent: any,
  orderId?: string
): Promise<{ id: string; alreadyProcessed: boolean }> {
  // Check if event already exists
  const { data: existingEvent, error: fetchError } = await supabaseAdmin
    .from('stripe_webhook_events')
    .select('id, processed')
    .eq('event_id', eventId)
    .maybeSingle();

  if (fetchError && fetchError.code !== 'PGRST116') {
    // PGRST116 = not found, which is fine
    console.error('[STRIPE WEBHOOK] Error checking existing event:', {
      eventId,
      error: fetchError.message,
      code: fetchError.code,
    });
    throw new Error(`Failed to check existing event: ${fetchError.message}`);
  }

  if (existingEvent) {
    return {
      id: existingEvent.id,
      alreadyProcessed: existingEvent.processed === true,
    };
  }

  // Insert new event record
  const { data: newEvent, error: insertError } = await supabaseAdmin
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

  if (insertError) {
    // If unique constraint violation (event_id already exists), fetch existing record
    if (insertError.code === '23505' || insertError.message?.includes('duplicate key')) {
      console.log('[STRIPE WEBHOOK] Event already exists (race condition), fetching:', eventId);
      const { data: existingEventAfterRace } = await supabaseAdmin
        .from('stripe_webhook_events')
        .select('id, processed')
        .eq('event_id', eventId)
        .maybeSingle();

      if (existingEventAfterRace) {
        return {
          id: existingEventAfterRace.id,
          alreadyProcessed: existingEventAfterRace.processed === true,
        };
      }
    }

    console.error('[STRIPE WEBHOOK] Failed to record event:', {
      eventId,
      error: insertError.message,
      code: insertError.code,
      details: insertError.details,
      hint: insertError.hint,
    });
    throw new Error(`Failed to record webhook event: ${insertError.message}`);
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
 * Handle checkout.session.completed event (V2 - Event Week Ticketing)
 * 
 * Execution order (critical for data consistency):
 * 1. Check idempotency (query existing tickets by order_id)
 * 2. Fetch order and order_items
 * 3. Generate tickets payload with snapshot fields
 * 4. Insert tickets (if fails, nothing is updated - return 500 for Stripe retry)
 * 5. Update ticket_types_v2 inventory (if applicable)
 * 6. Update order status to 'paid' and write Stripe fields
 * 7. Update order status to 'fulfilled'
 */
async function handleCheckoutSessionCompletedV2(session: Stripe.Checkout.Session) {
  const debugId = `webhook-v2-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  // Extract metadata with detailed logging
  const orderId = session.client_reference_id || session.metadata?.order_id;
  const userId = session.metadata?.user_id;
  const eventId = session.metadata?.event_id;
  const eventWeekId = session.metadata?.event_week_id;
  const paymentIntentId = typeof session.payment_intent === 'string' 
    ? session.payment_intent 
    : session.payment_intent?.id;

  console.log('[STRIPE WEBHOOK V2]', {
    debugId,
    step: 'checkout.session.completed.v2.start',
    sessionId: session.id,
    orderId,
    userId,
    eventId,
    eventWeekId,
    paymentIntentId,
    metadata: session.metadata,
  });

  if (!orderId) {
    const error = new Error('Missing order_id in session metadata or client_reference_id');
    console.error('[STRIPE WEBHOOK V2]', {
      debugId,
      step: 'checkout.session.completed.v2.error',
      error: error.message,
      sessionId: session.id,
      metadata: session.metadata,
      stack: error.stack,
    });
    throw error;
  }

  // Step 1: Check idempotency
  const { data: existingTickets, error: existingTicketsError } = await supabaseAdmin
    .from('tickets')
    .select('id, order_id, ticket_type_id_v2')
    .eq('order_id', orderId);

  if (existingTicketsError) {
    console.error('[STRIPE WEBHOOK V2]', {
      debugId,
      step: 'idempotency.check.error',
      orderId,
      error: existingTicketsError.message,
    });
  } else if (existingTickets && existingTickets.length > 0) {
    console.log('[STRIPE WEBHOOK V2]', {
      debugId,
      step: 'idempotency.check.found',
      orderId,
      existingTicketCount: existingTickets.length,
    });
    // Update order status if needed (idempotent)
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, status')
      .eq('id', orderId)
      .single();
    
    if (order && order.status !== 'fulfilled') {
      await supabaseAdmin
        .from('orders')
        .update({ status: 'fulfilled' })
        .eq('id', orderId);
    }
    return { orderId, skipped: true };
  }

  // Step 2: Fetch order and order_items
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, user_id, status, amount_cents')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // Amount consistency check (session vs order)
  const sessionAmount = session.amount_total ?? null;
  const orderAmount = order.amount_cents ?? null;
  if (sessionAmount != null && orderAmount != null) {
    const diff = Math.abs(sessionAmount - orderAmount);
    if (diff > 1) {
      throw new Error(`Amount mismatch: session=${sessionAmount} order=${orderAmount}`);
    }
  }

  if (order.status === 'fulfilled') {
    return { orderId, skipped: true };
  }

  // Fetch order items
  const { data: orderItems, error: orderItemsError } = await supabaseAdmin
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  if (orderItemsError || !orderItems || orderItems.length === 0) {
    throw new Error('Failed to fetch order items');
  }

  // Step 3: Generate tickets with snapshot fields
  const tickets = [];
  
  // Get event_week info
  const { data: eventWeek, error: weekError } = await supabaseAdmin
    .from('event_weeks')
    .select('id, week_start_date, timezone')
    .eq('id', eventWeekId)
    .single();

  if (weekError || !eventWeek) {
    throw new Error(`Event week not found: ${eventWeekId}`);
  }

  for (const orderItem of orderItems) {
    // Fetch ticket_type_v2 with day info
    const { data: ticketType, error: ticketTypeError } = await supabaseAdmin
      .from('ticket_types_v2')
      .select(`
        *,
        event_week_days!inner (
          id,
          dow,
          enabled,
          start_time,
          end_time,
          end_next_day
        )
      `)
      .eq('id', orderItem.ticket_type_id)
      .single();

    if (ticketTypeError || !ticketType) {
      console.error('[STRIPE WEBHOOK V2]', {
        debugId,
        step: 'ticket_type_v2.fetch.error',
        ticketTypeId: orderItem.ticket_type_id,
        error: ticketTypeError?.message,
      });
      continue;
    }

    const day = ticketType.event_week_days;
    if (!day) {
      console.error('[STRIPE WEBHOOK V2]', {
        debugId,
        step: 'day.not_found',
        ticketTypeId: orderItem.ticket_type_id,
      });
      continue;
    }

    // Determine Validity Window: Prioritize Snapshot
    let valid_start_at: string;
    let valid_end_at: string;
    let dayId = day.id;

    if (orderItem.valid_start_at && orderItem.valid_end_at) {
        valid_start_at = orderItem.valid_start_at;
        valid_end_at = orderItem.valid_end_at;
        if (orderItem.event_week_day_id) {
           dayId = orderItem.event_week_day_id;
        }
        console.log('[STRIPE WEBHOOK V2] Using Snapshot Validity:', {
           debugId,
           valid_start_at,
           valid_end_at,
           dayId
        });
    } else {
        // Fallback: Calculate validity window using RPC function
        const { data: validityWindow, error: validityError } = await supabaseAdmin.rpc(
          'calculate_day_validity_window',
          {
            p_week_start_date: eventWeek.week_start_date,
            p_dow: day.dow,
            p_start_time: day.start_time,
            p_end_time: day.end_time,
            p_end_next_day: day.end_next_day,
            p_timezone: eventWeek.timezone,
          }
        );
    
        if (validityError || !validityWindow || validityWindow.length === 0) {
          console.error('[STRIPE WEBHOOK V2]', {
            debugId,
            step: 'validity_window.calc.error',
            error: validityError?.message,
          });
          continue;
        }
        valid_start_at = validityWindow[0].valid_start_at;
        valid_end_at = validityWindow[0].valid_end_at;

        console.log('[STRIPE WEBHOOK V2] Calculated Validity (Fallback):', {
           debugId,
           weekStartDate: eventWeek.week_start_date,
           resultStart: valid_start_at,
           resultEnd: valid_end_at
        });
    }

    // Get event_v2 and merchant info for venue_id
    const { data: eventV2, error: eventV2Error } = await supabaseAdmin
      .from('events_v2')
      .select('id, merchant_id')
      .eq('id', eventId)
      .single();

    if (eventV2Error || !eventV2) {
      console.error('[STRIPE WEBHOOK V2]', {
        debugId,
        step: 'event_v2.fetch.error',
        eventId,
        error: eventV2Error?.message,
      });
      continue;
    }

    // Get venue_id from merchant (first venue)
    const { data: venue, error: venueError } = await supabaseAdmin
      .from('venues')
      .select('id')
      .eq('merchant_id', eventV2.merchant_id)
      .limit(1)
      .single();

    const venueId = venue?.id || null;

    // Generate tickets with snapshot fields
    for (let i = 0; i < orderItem.quantity; i++) {
      const qrSeed = randomBytes(16).toString('hex');
      const publicToken = randomBytes(16).toString('hex') + randomBytes(4).toString('hex');

      tickets.push({
        order_id: orderId,
        user_id: order.user_id,
        event_id: eventId, // Keep for compatibility, but also set event_id_v2
        event_id_v2: eventId,
        venue_id: venueId,
        ticket_type_id: orderItem.ticket_type_id, // Keep for compatibility
        ticket_type_id_v2: orderItem.ticket_type_id,
        event_week_id: eventWeekId,
        event_week_day_id: dayId, // Use snapshot day ID
        valid_start_at: valid_start_at,
        valid_end_at: valid_end_at,
        ticket_name_snapshot: ticketType.name,
        price_paid_cents_snapshot: ticketType.price_cents,
        currency_snapshot: ticketType.currency || 'usd',
        min_age_snapshot: ticketType.min_age,
        policy_snapshot: {
          category: ticketType.category,
          inventory_limit: ticketType.inventory_limit,
        },
        qr_seed: qrSeed,
        public_token: publicToken,
        status: 'active',
        redeem_limit: 1, // Default for v2
        redeemed_count: 0,
      });
    }
  }

  if (tickets.length === 0) {
    throw new Error('No tickets generated');
  }

  // Step 4: Insert tickets
  const { data: insertedTickets, error: ticketsError } = await supabaseAdmin
    .from('tickets')
    .insert(tickets)
    .select('id');

  if (ticketsError) {
    throw new Error(`Failed to create tickets: ${ticketsError.message}`);
  }

  // Step 5: Update ticket_types_v2.sold_count atomically
  const v2TicketTypeUpdates = new Map<string, number>();
  for (const orderItem of orderItems) {
    const tid = orderItem.ticket_type_id;
    v2TicketTypeUpdates.set(tid, (v2TicketTypeUpdates.get(tid) || 0) + orderItem.quantity);
  }
  for (const [tid, qty] of v2TicketTypeUpdates.entries()) {
    const { error: incErr } = await supabaseAdmin.rpc('increment_ticket_type_v2_sold', {
      p_ticket_type_id: tid,
      p_quantity: qty,
    });
    if (incErr) console.warn('[STRIPE WEBHOOK V2] sold_count increment error:', tid, incErr.message);
  }

  // Step 6: Update order status to 'paid'
  const updateData: any = {
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

  await supabaseAdmin
    .from('orders')
    .update(updateData)
    .eq('id', orderId);

  // Step 6.5: Increment invite code usage atomically (if applicable)
  try {
    const { data: orderWithInvite, error: orderFetchError } = await supabaseAdmin
      .from('orders')
      .select('invite_id')
      .eq('id', orderId)
      .single();

    if (orderFetchError || !orderWithInvite?.invite_id) return;

    const { data: incremented, error: rpcError } = await supabaseAdmin.rpc('increment_ambassador_invite_usage', {
      p_invite_id: orderWithInvite.invite_id,
    });
    if (rpcError) {
      console.warn('[STRIPE WEBHOOK V2] Invite increment RPC error:', rpcError.message);
      return;
    }
    if (!incremented) {
      console.warn('[STRIPE WEBHOOK V2] Invite usage limit reached (race):', orderWithInvite.invite_id);
      return;
    }
    console.log('[STRIPE WEBHOOK V2]', { debugId, step: 'invite.increment.success', inviteId: orderWithInvite.invite_id });
  } catch (inviteError: any) {
    console.error('[STRIPE WEBHOOK V2] Invite processing failed (non-blocking):', { debugId, error: inviteError.message });
  }

  // Step 7: Update order status to 'fulfilled'
  await supabaseAdmin
    .from('orders')
    .update({ status: 'fulfilled' })
    .eq('id', orderId);

  console.log('[STRIPE WEBHOOK V2]', {
    debugId,
    step: 'checkout.session.completed.v2.success',
    orderId,
    ticketCount: tickets.length,
  });

  return { orderId, skipped: false };
}

/**
 * Handle checkout.session.completed event (V1 - Legacy)
 * 
 * Execution order (critical for data consistency):
 * 1. Check idempotency (query existing tickets by order_id)
 * 2. Fetch order and order_items
 * 3. Generate tickets payload (without order_item_id)
 * 4. Insert tickets (if fails, nothing is updated - return 500 for Stripe retry)
 * 5. Update ticket_types.sold_count atomically
 * 6. Update order status to 'paid' and write Stripe fields
 * 7. Update order status to 'fulfilled'
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const debugId = `webhook-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  // Extract metadata with detailed logging
  const orderId = session.client_reference_id || session.metadata?.order_id;
  const userId = session.metadata?.user_id;
  const eventId = session.metadata?.event_id;
  const ticketTypeIds = session.metadata?.ticket_type_ids?.split(',') || [];
  const quantities = session.metadata?.quantities?.split(',') || [];
  const paymentIntentId = typeof session.payment_intent === 'string' 
    ? session.payment_intent 
    : session.payment_intent?.id;

  console.log('[STRIPE WEBHOOK]', {
    debugId,
    step: 'checkout.session.completed.start',
    sessionId: session.id,
    orderId,
    userId,
    eventId,
    ticketTypeIds,
    quantities,
    paymentIntentId,
    metadata: session.metadata,
  });

  if (!orderId) {
    const error = new Error('Missing order_id in session metadata or client_reference_id');
    console.error('[STRIPE WEBHOOK]', {
      debugId,
      step: 'checkout.session.completed.error',
      error: error.message,
      sessionId: session.id,
      clientReferenceId: session.client_reference_id,
      metadata: session.metadata,
      stack: error.stack,
    });
    throw error;
  }

  // Step 1: Check idempotency - query existing tickets by order_id
  const { data: existingTickets, error: existingTicketsError } = await supabaseAdmin
    .from('tickets')
    .select('id, order_id, ticket_type_id')
    .eq('order_id', orderId);

  if (existingTicketsError) {
    console.error('[STRIPE WEBHOOK]', {
      debugId,
      step: 'idempotency.check.error',
      orderId,
      error: existingTicketsError.message,
      code: existingTicketsError.code,
    });
    // Continue processing (non-blocking error)
  } else if (existingTickets && existingTickets.length > 0) {
    console.log('[STRIPE WEBHOOK]', {
      debugId,
      step: 'idempotency.check.found',
      orderId,
      existingTicketCount: existingTickets.length,
      ticketIds: existingTickets.map((t: any) => t.id),
    });
    // Tickets already exist for this order - skip processing
    // Update order status if needed (idempotent)
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, status')
      .eq('id', orderId)
      .single();
    
    if (order && order.status !== 'fulfilled') {
      // Update order status to fulfilled (idempotent)
      await supabaseAdmin
        .from('orders')
        .update({ status: 'fulfilled' })
        .eq('id', orderId);
    }

    return { orderId, skipped: true };
  }

  console.log('[STRIPE WEBHOOK]', {
    debugId,
    step: 'idempotency.check.passed',
    orderId,
    existingTicketCount: 0,
  });

  // Step 2: Fetch order and order_items
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, user_id, status, amount_cents')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    const error = new Error(`Order not found: ${orderId}`);
    console.error('[STRIPE WEBHOOK]', {
      debugId,
      step: 'order.fetch.error',
      orderId,
      error: orderError?.message || 'Order not found',
      supabaseError: orderError,
      stack: error.stack,
    });
    throw error;
  }

  // Amount consistency check (session vs order)
  const sessionAmount = session.amount_total ?? null;
  const orderAmount = order.amount_cents ?? null;
  if (sessionAmount != null && orderAmount != null) {
    const diff = Math.abs(sessionAmount - orderAmount);
    if (diff > 1) {
      throw new Error(`Amount mismatch: session=${sessionAmount} order=${orderAmount}`);
    }
  }

  console.log('[STRIPE WEBHOOK]', {
    debugId,
    step: 'order.fetched',
    orderId: order.id,
    userId: order.user_id,
    status: order.status,
  });

  // Check if order is already in final state (additional check)
  if (order.status === 'fulfilled') {
    console.log('[STRIPE WEBHOOK]', {
      debugId,
      step: 'order.already_fulfilled',
      orderId,
      status: order.status,
    });
    return { orderId, skipped: true };
  }

  // Fetch order items
  const { data: orderItems, error: orderItemsError } = await supabaseAdmin
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  if (orderItemsError || !orderItems || orderItems.length === 0) {
    const error = new Error('Failed to fetch order items');
    console.error('[STRIPE WEBHOOK]', {
      debugId,
      step: 'order_items.fetch.error',
      orderId,
      error: orderItemsError?.message || 'No order items found',
      supabaseError: orderItemsError,
      stack: error.stack,
    });
    throw error;
  }

  console.log('[STRIPE WEBHOOK]', {
    debugId,
    step: 'order_items.fetched',
    orderId,
    itemCount: orderItems.length,
    items: orderItems.map((item: any) => ({
      id: item.id,
      ticket_type_id: item.ticket_type_id,
      quantity: item.quantity,
    })),
  });

  // Generate tickets for each order item
  const tickets = [];
  for (const orderItem of orderItems) {
    console.log('[STRIPE WEBHOOK]', {
      debugId,
      step: 'ticket_generation.start',
      orderItemId: orderItem.id,
      ticketTypeId: orderItem.ticket_type_id,
      quantity: orderItem.quantity,
    });
    // Fetch ticket type and event/venue details
    const { data: ticketType, error: ticketTypeError } = await supabaseAdmin
      .from('ticket_types')
      .select('event_id, inventory_limit, sold_count, redeem_limit')
      .eq('id', orderItem.ticket_type_id)
      .single();

    if (ticketTypeError || !ticketType) {
      console.error('[STRIPE WEBHOOK]', {
        debugId,
        step: 'ticket_type.fetch.error',
        ticketTypeId: orderItem.ticket_type_id,
        error: ticketTypeError?.message || 'Ticket type not found',
        supabaseError: ticketTypeError,
      });
      continue;
    }

    console.log('[STRIPE WEBHOOK]', {
      debugId,
      step: 'ticket_type.fetched',
      ticketTypeId: orderItem.ticket_type_id,
      eventId: ticketType.event_id,
      inventoryLimit: ticketType.inventory_limit,
      soldCount: ticketType.sold_count,
      redeemLimit: ticketType.redeem_limit,
    });

    // Validate availability
    const available =
      ticketType.inventory_limit === null
        ? Infinity
        : ticketType.inventory_limit - ticketType.sold_count;

    if (available < orderItem.quantity) {
      console.error('[STRIPE WEBHOOK]', {
        debugId,
        step: 'ticket_type.insufficient_availability',
        ticketTypeId: orderItem.ticket_type_id,
        requested: orderItem.quantity,
        available,
        inventoryLimit: ticketType.inventory_limit,
        soldCount: ticketType.sold_count,
      });
      continue;
    }

    // Fetch event to get venue_id
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('venue_id')
      .eq('id', ticketType.event_id)
      .single();

    if (eventError || !event) {
      console.error('[STRIPE WEBHOOK]', {
        debugId,
        step: 'event.fetch.error',
        eventId: ticketType.event_id,
        error: eventError?.message || 'Event not found',
        supabaseError: eventError,
      });
      continue;
    }

    console.log('[STRIPE WEBHOOK]', {
      debugId,
      step: 'event.fetched',
      eventId: ticketType.event_id,
      venueId: event.venue_id,
    });

    // Generate tickets
    for (let i = 0; i < orderItem.quantity; i++) {
      const qrSeed = randomBytes(16).toString('hex');
      // 128-bit+ token for /t/[token] and QR; not guessable, never use short id
      const publicToken = randomBytes(16).toString('hex') + randomBytes(4).toString('hex');

      tickets.push({
        order_id: orderId,
        // NOTE: Removed order_item_id - tickets table does not have this column
        user_id: order.user_id,
        event_id: ticketType.event_id,
        venue_id: event.venue_id,
        ticket_type_id: orderItem.ticket_type_id,
        qr_seed: qrSeed,
        public_token: publicToken,
        status: 'active',
        redeem_limit: ticketType.redeem_limit,
        redeemed_count: 0,
      });
    }
  }

  // Step 3: Generate tickets payload (already done in loop above)
  if (tickets.length === 0) {
    const error = new Error('No tickets generated');
    console.error('[STRIPE WEBHOOK]', {
      debugId,
      step: 'tickets.generation.failed',
      orderId,
      orderItemCount: orderItems.length,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }

  // Step 4: Insert tickets FIRST (if this fails, nothing is updated - return 500 for Stripe retry)
  console.log('[STRIPE WEBHOOK]', {
    debugId,
    step: 'tickets.insert.before',
    orderId,
    ticketCount: tickets.length,
  });

  const { data: insertedTickets, error: ticketsError } = await supabaseAdmin
    .from('tickets')
    .insert(tickets)
    .select('id');

  if (ticketsError) {
    const error = new Error(`Failed to create tickets: ${ticketsError.message}`);
    console.error('[STRIPE WEBHOOK]', {
      debugId,
      step: 'tickets.insert.error',
      orderId,
      ticketCount: tickets.length,
      error: ticketsError.message,
      code: ticketsError.code,
      details: ticketsError.details,
      hint: ticketsError.hint,
      stack: error.stack,
    });
    // Return 500 to trigger Stripe retry - no data has been modified yet
    throw error;
  }

  console.log('[STRIPE WEBHOOK]', {
    debugId,
    step: 'tickets.inserted',
    orderId,
    ticketCount: insertedTickets?.length || tickets.length,
    ticketIds: insertedTickets?.map((t: any) => t.id) || [],
  });

  // Step 5: Update ticket_types.sold_count atomically via RPC (avoids race)
  const ticketTypeUpdates = new Map<string, number>();
  for (const orderItem of orderItems) {
    const currentCount = ticketTypeUpdates.get(orderItem.ticket_type_id) || 0;
    ticketTypeUpdates.set(orderItem.ticket_type_id, currentCount + orderItem.quantity);
  }

  for (const [ticketTypeId, quantity] of ticketTypeUpdates.entries()) {
    const { error: rpcError } = await supabaseAdmin.rpc('increment_ticket_type_sold', {
      p_ticket_type_id: ticketTypeId,
      p_quantity: quantity,
    });
    if (rpcError) {
      console.error('[STRIPE WEBHOOK]', {
        debugId,
        step: 'ticket_type.increment.error',
        ticketTypeId,
        quantity,
        error: rpcError.message,
      });
      // Non-fatal: tickets already inserted; reconciliation job can fix sold_count
    }
  }

  // Step 6: Update order status to 'paid' and write Stripe fields (after tickets are inserted)
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

  console.log('[STRIPE WEBHOOK]', {
    debugId,
    step: 'order.update.before',
    orderId,
    updateData,
  });

  const { error: orderUpdateError } = await supabaseAdmin
    .from('orders')
    .update(updateData)
    .eq('id', orderId);

  if (orderUpdateError) {
    const error = new Error(`Failed to update order: ${orderUpdateError.message}`);
    console.error('[STRIPE WEBHOOK]', {
      debugId,
      step: 'order.update.error',
      orderId,
      error: orderUpdateError.message,
      code: orderUpdateError.code,
      details: orderUpdateError.details,
      stack: error.stack,
    });
    // Tickets are already inserted, but order update failed
    // Log error but don't throw (tickets are the critical data)
  } else {
    console.log('[STRIPE WEBHOOK]', {
      debugId,
      step: 'order.updated',
      orderId,
      status: 'paid',
    });
  }

  // Step 7: Update order status to 'fulfilled' (after all operations succeed)
  const { error: fulfillError } = await supabaseAdmin
    .from('orders')
    .update({ status: 'fulfilled' })
    .eq('id', orderId);

  if (fulfillError) {
    console.error('[STRIPE WEBHOOK]', {
      debugId,
      step: 'order.fulfill.error',
      orderId,
      error: fulfillError.message,
      code: fulfillError.code,
    });
    // Non-critical error, log but don't throw (tickets are already created)
  } else {
    console.log('[STRIPE WEBHOOK]', {
      debugId,
      step: 'order.fulfilled',
      orderId,
    });
  }

  console.log('[STRIPE WEBHOOK]', {
    debugId,
    step: 'checkout.session.completed.success',
    orderId,
    ticketCount: tickets.length,
  });

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

  // Mark all tickets for this order as refunded (prevent redemption after refund)
  const { data: ticketsUpdated, error: ticketsErr } = await supabaseAdmin
    .from('tickets')
    .update({
      status: 'refunded',
      updated_at: new Date().toISOString(),
    })
    .eq('order_id', order.id)
    .in('status', ['active', 'issued'])
    .select('id');

  if (ticketsErr) {
    console.error('[STRIPE WEBHOOK] Failed to mark tickets as refunded:', order.id, ticketsErr);
  } else if (ticketsUpdated && ticketsUpdated.length > 0) {
    console.log('[STRIPE WEBHOOK] Marked', ticketsUpdated.length, 'tickets as refunded for order:', order.id);
  }

  console.log('[STRIPE WEBHOOK] Updated order status to refunded:', order.id);
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const debugId = `webhook-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  // Check Stripe configuration
  if (!isStripeConfigured || !stripe) {
    console.warn('[STRIPE WEBHOOK]', {
      debugId,
      step: 'config.check.failed',
      error: 'Stripe not configured',
    });
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  // Check service role key
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[STRIPE WEBHOOK]', {
      debugId,
      step: 'config.check.failed',
      error: 'SUPABASE_SERVICE_ROLE_KEY not configured',
    });
    return NextResponse.json(
      { error: 'Service role key not configured' },
      { status: 500 }
    );
  }

  // Get raw body (required for signature verification)
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[STRIPE WEBHOOK]', {
      debugId,
      step: 'signature.check.failed',
      error: 'Missing signature or webhook secret',
      hasSignature: !!signature,
      hasSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    });
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
    console.error('[STRIPE WEBHOOK]', {
      debugId,
      step: 'signature.verification.failed',
      error: err.message,
      stack: err.stack,
    });
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  console.log('[STRIPE WEBHOOK]', {
    debugId,
    step: 'event.received',
    eventId: event.id,
    eventType: event.type,
    livemode: event.livemode,
  });

  // Record event and check idempotency
  let eventRecord: { id: string; alreadyProcessed: boolean } | null = null;
  let orderId: string | undefined;

  try {
    // Extract order_id from event data if available
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      orderId = session.client_reference_id || session.metadata?.order_id;
      console.log('[STRIPE WEBHOOK]', {
        debugId,
        step: 'order_id.extracted',
        eventType: event.type,
        orderId,
        sessionId: session.id,
        clientReferenceId: session.client_reference_id,
        metadata: session.metadata,
      });
    } else if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      // Try to find order by payment_intent_id
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntent.id)
        .maybeSingle();
      orderId = order?.id;
      console.log('[STRIPE WEBHOOK]', {
        debugId,
        step: 'order_id.looked_up',
        eventType: event.type,
        paymentIntentId: paymentIntent.id,
        orderId,
      });
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
        console.log('[STRIPE WEBHOOK]', {
          debugId,
          step: 'order_id.looked_up',
          eventType: event.type,
          chargeId: charge.id,
          paymentIntentId,
          orderId,
        });
      }
    }

    eventRecord = await recordWebhookEvent(event.id, event.type, event, orderId);

    console.log('[STRIPE WEBHOOK]', {
      debugId,
      step: 'event.recorded',
      eventId: event.id,
      eventRecordId: eventRecord.id,
      alreadyProcessed: eventRecord.alreadyProcessed,
    });

    // If already processed, return early
    if (eventRecord.alreadyProcessed) {
      console.log('[STRIPE WEBHOOK]', {
        debugId,
        step: 'event.already_processed',
        eventId: event.id,
        eventRecordId: eventRecord.id,
      });
      return NextResponse.json({ received: true, message: 'Already processed' });
    }
  } catch (error: any) {
    console.error('[STRIPE WEBHOOK]', {
      debugId,
      step: 'event.record.failed',
      eventId: event.id,
      error: error.message,
      stack: error.stack,
    });
    // Continue processing even if event recording fails (non-blocking)
    // But log the error for debugging
  }

  // Handle different event types
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const isV2 = session.metadata?.version === 'v2';
        
        console.log('[STRIPE WEBHOOK]', {
          debugId,
          step: 'event.handler.start',
          eventType: event.type,
          sessionId: session.id,
          orderId: session.client_reference_id || session.metadata?.order_id,
          version: isV2 ? 'v2' : 'v1',
          paymentIntent: typeof session.payment_intent === 'string' 
            ? session.payment_intent 
            : session.payment_intent?.id,
        });
        
        // Route to v2 or v1 handler based on metadata.version
        const result = isV2
          ? await handleCheckoutSessionCompletedV2(session)
          : await handleCheckoutSessionCompleted(session);
        
        if (result && !result.skipped) {
          await markEventProcessed(event.id, result.orderId);
          console.log('[STRIPE WEBHOOK]', {
            debugId,
            step: 'event.marked_processed',
            eventId: event.id,
            orderId: result.orderId,
            version: isV2 ? 'v2' : 'v1',
          });
        } else {
          console.log('[STRIPE WEBHOOK]', {
            debugId,
            step: 'event.skipped',
            eventId: event.id,
            orderId: result?.orderId,
            reason: 'Order already processed',
            version: isV2 ? 'v2' : 'v1',
          });
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
        const session = event.data.object as Stripe.Checkout.Session;
        const asyncOrderId = session.client_reference_id || session.metadata?.order_id;
        if (event.type === 'checkout.session.async_payment_succeeded') {
          const isV2 = session.metadata?.version === 'v2';
          const result = isV2
            ? await handleCheckoutSessionCompletedV2(session)
            : await handleCheckoutSessionCompleted(session);
          if (result && !result.skipped) {
            await markEventProcessed(event.id, result.orderId);
          }
        } else {
          if (asyncOrderId) {
            await supabaseAdmin
              .from('orders')
              .update({ status: 'expired' })
              .eq('id', asyncOrderId);
          }
          await markEventProcessed(event.id, asyncOrderId);
        }
        break;
      }

      default:
        console.log(`[STRIPE WEBHOOK] Unhandled event type: ${event.type}`);
        await markEventProcessed(event.id, orderId);
        return NextResponse.json({ received: true, message: 'Event type not handled' });
    }

    const duration = Date.now() - startTime;
    console.log('[STRIPE WEBHOOK]', {
      debugId,
      step: 'event.processed.success',
      eventId: event.id,
      eventType: event.type,
      orderId,
      duration,
    });

    return NextResponse.json({ received: true });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[STRIPE WEBHOOK]', {
      debugId,
      step: 'event.processed.error',
      eventId: event.id,
      eventType: event.type,
      orderId,
      error: error.message,
      errorName: error.name,
      errorCode: (error as any).code,
      stack: error.stack,
      duration,
    });

    // Only mark as processed for non-retryable errors (so Stripe won't retry)
    const msg = (error?.message || '').toLowerCase();
    const isNonRetryable =
      msg.includes('order not found') ||
      msg.includes('amount mismatch') ||
      msg.includes('missing order_id') ||
      msg.includes('no tickets generated') ||
      msg.includes('failed to fetch order items') ||
      msg.includes('event week not found');
    if (eventRecord && isNonRetryable) {
      try {
        await markEventProcessed(event.id, orderId, error.message);
      } catch (markError: any) {
        console.error('[STRIPE WEBHOOK]', {
          debugId,
          step: 'event.mark_processed.error',
          eventId: event.id,
          error: markError.message,
        });
      }
    }

    // Return 500 to trigger Stripe retry (idempotency prevents duplicate processing on retry)
    return NextResponse.json(
      { 
        error: `Failed to process event: ${error.message}`,
        debugId,
        eventId: event.id,
      },
      { status: 500 }
    );
  }
}
