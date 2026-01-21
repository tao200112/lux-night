import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { eventId, items } = body; // items: [{ ticketTypeId, quantity }]

    if (!eventId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Get user profile to check region (last_region_id in new schema)
    const { data: profile } = await supabase
      .from('profiles')
      .select('last_region_id')
      .eq('id', user.id)
      .single();

    if (!profile?.last_region_id) {
      return NextResponse.json(
        { error: 'Region not selected. Please select a region first.' },
        { status: 400 }
      );
    }

    // Fetch event (has region_id directly in new schema)
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(`
        id,
        title,
        region_id,
        venue_id,
        venues!inner(id, name, address)
      `)
      .eq('id', eventId)
      .eq('status', 'published')
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Verify event is in user's region (check event.region_id in new schema)
    if (event.region_id !== profile.last_region_id) {
      return NextResponse.json(
        { error: 'Event is not available in your selected region' },
        { status: 403 }
      );
    }

    // Fetch ticket types and validate inventory
    const ticketTypeIds = items.map((item: any) => item.ticketTypeId);
    const { data: ticketTypes, error: ticketTypesError } = await supabase
      .from('ticket_types')
      .select('*')
      .eq('event_id', eventId)
      .in('id', ticketTypeIds);

    if (ticketTypesError || !ticketTypes || ticketTypes.length !== ticketTypeIds.length) {
      return NextResponse.json({ error: 'Invalid ticket types' }, { status: 400 });
    }

    // Validate inventory and calculate total
    let totalAmount = 0;
    for (const item of items) {
      const ticketType = ticketTypes.find((tt: any) => tt.id === item.ticketTypeId);
      if (!ticketType) {
        return NextResponse.json(
          { error: `Ticket type ${item.ticketTypeId} not found` },
          { status: 400 }
        );
      }
      // Check inventory: sold_count vs inventory_limit (null = unlimited)
      if (ticketType.inventory_limit !== null && 
          (ticketType.inventory_limit - ticketType.sold_count) < item.quantity) {
        return NextResponse.json(
          { error: `Insufficient inventory for ${ticketType.name}` },
          { status: 400 }
        );
      }
      totalAmount += (ticketType.price_cents / 100) * item.quantity; // Convert cents to dollars
    }

    // Create order in database (pending_payment status, amount_cents in new schema)
    const orderIdempotencyKey = `${user.id}-${eventId}-${Date.now()}`;
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        region_id: profile.last_region_id,
        status: 'pending_payment',
        amount_cents: Math.round(totalAmount * 100), // Convert to cents
        idempotency_key: orderIdempotencyKey,
      })
      .select()
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    // Create order items (unit_price_cents in new schema)
    const orderItems = items.map((item: any) => {
      const ticketType = ticketTypes.find((tt: any) => tt.id === item.ticketTypeId);
      return {
        order_id: order.id,
        event_id: eventId,
        ticket_type_id: item.ticketTypeId,
        quantity: item.quantity,
        unit_price_cents: ticketType!.price_cents,
      };
    });

    const { error: orderItemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (orderItemsError) {
      // Clean up order
      await supabase.from('orders').delete().eq('id', order.id);
      return NextResponse.json({ error: 'Failed to create order items' }, { status: 500 });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: items.map((item: any) => {
        const ticketType = ticketTypes.find((tt: any) => tt.id === item.ticketTypeId);
        return {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${ticketType!.name} - ${event.title}`,
              description: ticketType!.name || '',
            },
            unit_amount: ticketType!.price_cents, // Already in cents
          },
          quantity: item.quantity,
        };
      }),
      mode: 'payment',
      success_url: `${req.nextUrl.origin}/wallet?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.nextUrl.origin}/events/${eventId}`,
      client_reference_id: order.id,
      metadata: {
        order_id: order.id,
        user_id: user.id,
        event_id: eventId,
      },
    });

    // Update order with Stripe session ID (stripe_checkout_session_id in new schema)
    await supabase
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', order.id);

    return NextResponse.json({ sessionId: session.id });
  } catch (error: any) {
    console.error('Checkout session creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
