import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { stripe, isStripeConfigured } from '@/lib/stripe/server';

// Zod schemas
const CheckoutItemSchema = z.object({
  ticketTypeId: z.string().uuid(),
  quantity: z.number().int().positive().max(100),
});

const CheckoutRequestSchema = z.object({
  eventId: z.string().uuid(),
  items: z.array(CheckoutItemSchema).min(1),
});

// Response type
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    // 1. 检查 Stripe 配置
    if (!isStripeConfigured || !stripe) {
      console.warn('[CHECKOUT API] Stripe not configured');
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'STRIPE_NOT_CONFIGURED',
            message: 'Stripe is not configured. Please set STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY environment variables.',
          },
        },
        { status: 503 }
      );
    }

    // 2. 权限检查
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[CHECKOUT API] Auth error:', authError);
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Must be logged in',
          },
        },
        { status: 401 }
      );
    }

    // 3. 验证请求体
    const body = await req.json();
    const validationResult = CheckoutRequestSchema.safeParse(body);

    if (!validationResult.success) {
      console.error('[CHECKOUT API] Validation error:', validationResult.error);
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validationResult.error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', '),
          },
        },
        { status: 400 }
      );
    }

    const { eventId, items } = validationResult.data;

    // Fetch event (region_id is optional and only used for merchant/admin organization)
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
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'EVENT_NOT_FOUND',
            message: 'Event not found or not published',
          },
        },
        { status: 404 }
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
    // region_id is optional: use event.region_id if available, otherwise null
    // Region is only used for merchant/admin organization, not required for payment
    const orderIdempotencyKey = `${user.id}-${eventId}-${Date.now()}`;
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        region_id: event.region_id || null, // Use event's region_id if available, otherwise null
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

    // 6. 创建 Stripe checkout session
    // Use environment variable for base URL, fallback to request origin
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

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
      success_url: `${baseUrl}/wallet?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/events/${eventId}`,
      client_reference_id: order.id,
      metadata: {
        order_id: order.id,
        user_id: user.id,
        event_id: eventId,
        // Add ticket type IDs and quantities for reference
        ticket_type_ids: items.map((item: any) => item.ticketTypeId).join(','),
        quantities: items.map((item: any) => `${item.ticketTypeId}:${item.quantity}`).join(','),
      },
    });

    // Update order with Stripe session ID (stripe_checkout_session_id in new schema)
    await supabase
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', order.id);

    const duration = Date.now() - startTime;
    console.log(`[CHECKOUT API] Success: Session ${session.id} created in ${duration}ms`);

    return NextResponse.json<ApiResponse<{ sessionId: string }>>({
      success: true,
      data: { sessionId: session.id },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[CHECKOUT API] Error (${duration}ms):`, error);
    
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Failed to create checkout session',
        },
      },
      { status: 500 }
    );
  }
}
