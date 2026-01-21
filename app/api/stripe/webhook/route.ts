import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

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

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  // Handle checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const orderId = session.client_reference_id;

    if (!orderId) {
      console.error('Missing order_id in session metadata');
      return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });
    }

    // Check if order is already processed (idempotency) - status is 'paid' or 'fulfilled' in new schema
    const { data: existingOrder } = await supabaseAdmin
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single();

    if (existingOrder?.status === 'paid' || existingOrder?.status === 'fulfilled') {
      console.log('Order already processed:', orderId);
      return NextResponse.json({ received: true, message: 'Already processed' });
    }

    // Update order status to paid
    const { error: orderUpdateError } = await supabaseAdmin
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', orderId);

    if (orderUpdateError) {
      console.error('Failed to update order:', orderUpdateError);
      return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }

    // Fetch order details once
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('user_id')
      .eq('id', orderId)
      .single();

    if (!order) {
      console.error('Order not found:', orderId);
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Fetch order items
    const { data: orderItems, error: orderItemsError } = await supabaseAdmin
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    if (orderItemsError || !orderItems) {
      console.error('Failed to fetch order items:', orderItemsError);
      return NextResponse.json({ error: 'Failed to fetch order items' }, { status: 500 });
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
            console.error('Ticket type not found:', orderItem.ticket_type_id);
            continue;
          }

          // Validate availability: check sold_count vs inventory_limit
          const available = ticketType.inventory_limit === null 
            ? Infinity 
            : ticketType.inventory_limit - ticketType.sold_count;
          
          if (available < orderItem.quantity) {
            console.error('Insufficient availability for ticket type:', orderItem.ticket_type_id);
            continue;
          }

          // Fetch event to get venue_id
          const { data: event } = await supabaseAdmin
            .from('events')
            .select('venue_id')
            .eq('id', ticketType.event_id)
            .single();

          if (!event) {
            console.error('Event not found:', ticketType.event_id);
            continue;
          }

          // Generate tickets for quantity (qr_seed in new schema, status='active')
          for (let i = 0; i < orderItem.quantity; i++) {
            // Generate unique QR seed
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
              updated_at: new Date().toISOString()
            })
            .eq('id', orderItem.ticket_type_id);

          if (updateError) {
            console.error('Failed to update ticket type sold_count:', updateError);
            // Rollback order status
            await supabaseAdmin
              .from('orders')
              .update({ status: 'canceled' })
              .eq('id', orderId);
            return NextResponse.json({ error: 'Failed to update sold_count' }, { status: 500 });
          }
        }

    // Insert all tickets
    if (tickets.length > 0) {
      const { error: ticketsError } = await supabaseAdmin
        .from('tickets')
        .insert(tickets);

      if (ticketsError) {
        console.error('Failed to create tickets:', ticketsError);
        // Rollback order status
        await supabaseAdmin
          .from('orders')
          .update({ status: 'canceled' })
          .eq('id', orderId);
        return NextResponse.json({ error: 'Failed to create tickets' }, { status: 500 });
      }

      // Update order to fulfilled after tickets created
      await supabaseAdmin
        .from('orders')
        .update({ status: 'fulfilled' })
        .eq('id', orderId);
    } else {
      // No tickets generated, mark order as canceled
      await supabaseAdmin
        .from('orders')
        .update({ status: 'canceled' })
        .eq('id', orderId);
      return NextResponse.json({ error: 'No tickets generated' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}

// Disable body parsing for webhook
export const runtime = 'nodejs';
