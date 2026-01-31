/**
 * Public Checkout V2 API
 * POST /api/public/checkout-v2 - 创建 Stripe checkout session (v2 events)
 * 
 * Critical Update:
 * - Writes event_v2_id to orders (MANDATORY).
 * - Writes region_id to orders (via merchant).
 * - Writes ticket_type_v2_id to order_items.
 * - Asserts Linkage or fails hard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { stripe, isStripeConfigured } from '@/lib/stripe/server';

// Zod schemas
const CheckoutItemV2Schema = z.object({
  ticketTypeId: z.string().uuid(),
  eventWeekDayId: z.string().uuid(),
  quantity: z.number().int().positive().max(100),
});

const CheckoutRequestV2Schema = z.object({
  eventId: z.string().uuid(),
  eventWeekId: z.string().uuid(),
  items: z.array(CheckoutItemV2Schema).min(1),
});

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // 1. 检查 Stripe 配置
    if (!isStripeConfigured || !stripe) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Stripe is not configured' } },
        { status: 503 }
      );
    }

    // 2. 权限检查
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Must be logged in' } },
        { status: 401 }
      );
    }

    // 3. 验证请求体
    const body = await req.json();
    const validationResult = CheckoutRequestV2Schema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validationResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
          },
        },
        { status: 400 }
      );
    }

    const { eventId, eventWeekId, items } = validationResult.data;

    if (!eventId) {
        throw new Error('Critical: Event ID is missing from payload');
    }

    // 4. 获取活动 + Merchant Region Info
    // Join merchants to get region_id
    const { data: event, error: eventError } = await supabase
      .from('events_v2')
      .select(`
        id, title, status, merchant_id,
        merchants (
            id, region_id
        )
      `)
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      console.error('[CHECKOUT V2] Event lookup failed', { eventId, error: eventError });
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: { code: 'EVENT_NOT_FOUND', message: 'Event not found' } },
        { status: 404 }
      );
    }

    if (event.status !== 'active') {
        const reason = event.status === 'temp_closed' ? 'temporarily closed' : 'not available';
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: { code: 'EVENT_NOT_ACTIVE', message: `Event is ${reason}` } },
          { status: 403 }
        );
    }

    // Extract region_id
    // @ts-ignore
    const regionId = event.merchants?.region_id || null;

    // 5. 获取 event_week
    const { data: eventWeek, error: weekError } = await supabase
      .from('event_weeks')
      .select('id, week_start_date, timezone')
      .eq('id', eventWeekId)
      .single();

    if (weekError || !eventWeek) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: { code: 'WEEK_NOT_FOUND', message: 'Event week not found' } },
        { status: 404 }
      );
    }

    // 6. 获取 ticket_types 并验证
    const ticketTypeIds = items.map((item) => item.ticketTypeId);
    const { data: ticketTypes, error: ticketTypesError } = await supabase
      .from('ticket_types_v2')
      .select(`
        *,
        event_week_days!inner (
          id, dow, enabled, start_time, end_time, end_next_day
        )
      `)
      .in('id', ticketTypeIds);

    if (ticketTypesError || !ticketTypes || ticketTypes.length !== ticketTypeIds.length) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: { code: 'INVALID_TICKET_TYPES', message: 'Invalid ticket types' } },
        { status: 400 }
      );
    }

    // 7. Calculate Totals & Validations
    let totalAmount = 0;
    for (const item of items) {
      const ticketType = ticketTypes.find((tt) => tt.id === item.ticketTypeId);
      if (!ticketType) throw new Error('Ticket type missing');
      
      if (!ticketType.stripe_price_id) {
          throw new Error(`Ticket type ${ticketType.name} is missing Stripe Price ID`);
      }
      totalAmount += ticketType.price_cents * item.quantity;
    }

    // 8. 创建订单 (CRITICAL WRITE STEP)
    const orderIdempotencyKey = `${user.id}-${eventId}-${Date.now()}`;
    
    // Explicitly construct insert payload
    const orderPayload = {
        user_id: user.id,
        status: 'pending_payment', // Initial status
        amount_cents: totalAmount,
        idempotency_key: orderIdempotencyKey,
        event_id: eventId,        // LEGACY
        event_v2_id: eventId,     // NEW (Required)
        merchant_id: event.merchant_id,
        region_id: regionId,       // NEW (Optional but good)
        currency: 'usd'            // Default
    };

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select()
      .single();

    if (orderError) {
        console.error('[CHECKOUT V2] Order insert failed', { payload: orderPayload, error: orderError });
        throw new Error(`Order creation failed: ${orderError.message}`);
    }

    if (!order) {
        throw new Error('Order creation returned no data');
    }

    // 9. 创建 order_items
    const orderItems = items.map((item) => {
        const ticketType = ticketTypes.find((tt) => tt.id === item.ticketTypeId)!;
        const dayConfig = ticketType.event_week_days!;

        // Validity Logic (Simplified for brevity, assuming standard offsets)
        // Ideally we should reuse a shared utility but here we inline to ensure self-contained fix
        const tzOffset = '-05:00'; 
        // Note: We use null fallback for detailed validity calculation to avoid blockers, 
        // relying on Ticket Service later, but we MUST write IDs.
        
        return {
            order_id: order.id,
            event_id: eventId,
            ticket_type_id: item.ticketTypeId,         // Legacy?
            ticket_type_v2_id: item.ticketTypeId,      // NEW (Required)
            quantity: item.quantity,
            unit_price_cents: ticketType.price_cents,
            // Snapshot IDs
            event_week_day_id: item.eventWeekDayId
        };
    });

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
    
    if (itemsError) {
        console.error('[CHECKOUT V2] Order Items insert failed', itemsError);
        // Clean up order
        await supabase.from('orders').delete().eq('id', order.id);
        throw new Error(`Order items creation failed: ${itemsError.message}`);
    }

    // 10. Create Stripe Session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: items.map((item) => {
        const ticketType = ticketTypes.find((tt) => tt.id === item.ticketTypeId)!;
        return {
          price: ticketType.stripe_price_id,
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
        event_v2_id: eventId, // Add to metadata too
        version: 'v2'
      },
    });

    // 11. Update Order with Session ID
    const { error: updateError } = await supabase
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', order.id);
      
    if (updateError) {
        console.error('[CHECKOUT V2] Failed to update session ID', updateError);
        // Non-blocking, but bad.
    }

    return NextResponse.json<ApiResponse<{ sessionId: string }>>({
      success: true,
      data: { sessionId: session.id },
    });

  } catch (error: any) {
    console.error('Error in POST /api/public/checkout-v2:', error);
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
