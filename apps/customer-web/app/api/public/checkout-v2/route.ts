/**
 * Public Checkout V2 API
 * POST /api/public/checkout-v2 - 创建 Stripe checkout session (v2 events)
 * 
 * Critical Update:
 * - Writes event_v2_id to orders (MANDATORY).
 * - Writes region_id to orders (via merchant).
 * - Writes ticket_type_v2_id to order_items.
 * - Asserts Linkage or fails hard.
 * - SUPPORT AMBASSADOR INVITES (Atomic decrement & Attribution).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { stripe, isStripeConfigured } from '@/lib/stripe/server';
import {
  rateLimitOrResponse,
  rateLimitPolicies,
  withRateLimitHeaders,
} from '@lux-night/security';

// Service Role Client for Invite Logic
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Zod schemas
const CheckoutItemV2Schema = z.object({
  ticketTypeId: z.string().uuid(),
  eventWeekDayId: z.string().uuid(),
  quantity: z.number().int().positive().max(100),
  valid_start_at: z.string().optional(),
  valid_end_at: z.string().optional(),
});

const CheckoutRequestV2Schema = z.object({
  eventId: z.string().uuid(),
  eventWeekId: z.string().uuid(),
  items: z.array(CheckoutItemV2Schema).min(1),
  inviteCode: z.string().optional(),
  idempotencyKey: z.string().uuid().optional(),
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
  const debugId = Math.random().toString(36).substring(7);

  try {
    // Layer 1: anonymous IP burst gate
    const rl1 = await rateLimitOrResponse(req, rateLimitPolicies.publicBurst, { userId: 'anon' });
    if ('response' in rl1) return rl1.response;

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
      return withRateLimitHeaders(
        NextResponse.json<ApiResponse<never>>(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Must be logged in' } },
          { status: 401 },
        ),
        rl1.headers,
      );
    }

    // Layer 2: authenticated checkout rate limit
    const rl2 = await rateLimitOrResponse(req, rateLimitPolicies.checkout, { userId: user.id });
    if ('response' in rl2) return rl2.response;

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

    const { eventId, eventWeekId, items, inviteCode, idempotencyKey } = validationResult.data;

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

    // ---------------------------------------------------------
    // INVITE CODE LOGIC (Atomic Update)
    // ---------------------------------------------------------
    let validatedInvite: any = null;
    let finalInviteCode: string | null = null;
    
    // Validate Invite Code (if provided) - DO NOT increment usage yet
    // Usage will be incremented in webhook after successful payment
    if (inviteCode && inviteCode.trim()) {
        const normalizedCode = inviteCode.trim().toUpperCase();
        
        // 1. Fetch & Check
        const { data: existingInvite } = await supabaseAdmin
            .from('ambassador_invites')
            .select('*')
            .eq('code', normalizedCode)
            .eq('status', 'active')
            .eq('merchant_id', event.merchant_id)
            .single();
            
        if (!existingInvite) {
             return NextResponse.json<ApiResponse<never>>(
                { success: false, error: { code: 'INVALID_INVITE', message: 'Invite code is invalid or not for this merchant' } },
                { status: 400 }
            );
        }
        
        if (existingInvite.max_uses !== null && existingInvite.uses_count >= existingInvite.max_uses) {
             return NextResponse.json<ApiResponse<never>>(
                { success: false, error: { code: 'INVITE_EXHAUSTED', message: 'Invite code usage limit reached' } },
                { status: 400 }
            );
        }
        
        // Store validated invite info (will be used in webhook)
        validatedInvite = existingInvite;
        finalInviteCode = normalizedCode;
    }

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

    // 7. Calculate Totals & Validate inventory (sold_count vs inventory_limit)
    let totalAmount = 0;
    for (const item of items) {
      const ticketType = ticketTypes.find((tt) => tt.id === item.ticketTypeId);
      if (!ticketType) throw new Error('Ticket type missing');
      if (!ticketType.stripe_price_id) {
        throw new Error(`Ticket type ${ticketType.name} is missing Stripe Price ID`);
      }
      const soldCount = ticketType.sold_count ?? 0;
      if (ticketType.inventory_limit != null) {
        const available = ticketType.inventory_limit - soldCount;
        if (available < item.quantity) {
          return NextResponse.json<ApiResponse<never>>(
            {
              success: false,
              error: {
                code: 'INSUFFICIENT_INVENTORY',
                message: `Insufficient inventory for ${ticketType.name} (${available} left)`,
              },
            },
            { status: 400 }
          );
        }
      }
      totalAmount += ticketType.price_cents * item.quantity;
    }

    // 8. Idempotency: if key provided and order exists with session, return existing session
    const orderIdempotencyKey = idempotencyKey ?? `${user.id}-${eventId}-${Date.now()}`;
    if (idempotencyKey) {
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, stripe_checkout_session_id, status')
        .eq('idempotency_key', idempotencyKey)
        .eq('user_id', user.id)
        .maybeSingle();
      if (existingOrder?.stripe_checkout_session_id && existingOrder.status !== 'expired') {
        return NextResponse.json<ApiResponse<{ sessionId: string }>>({
          success: true,
          data: { sessionId: existingOrder.stripe_checkout_session_id },
        });
      }
      if (existingOrder && !existingOrder.stripe_checkout_session_id) {
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: { code: 'ORDER_PENDING', message: 'Order is being created, please retry in a moment' } },
          { status: 409 }
        );
      }
    }

    // 9. 创建订单 (CRITICAL WRITE STEP)
    const orderPayload = {
        user_id: user.id,
        status: 'pending_payment', // Initial status
        amount_cents: totalAmount,
        idempotency_key: orderIdempotencyKey,
        event_id: eventId,        // LEGACY
        event_v2_id: eventId,     // NEW (Required)
        merchant_id: event.merchant_id,
        region_id: regionId,       // NEW (Optional but good)
        currency: 'usd',            // Default
        
        // Invite Attribution
        invite_code: finalInviteCode,
        invite_id: validatedInvite?.id || null,
        ambassador_id: validatedInvite?.ambassador_id || null
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

    // 10. 创建 order_items (with validity snapshot to avoid config drift before webhook)
    const orderItems = items.map((item) => {
        const ticketType = ticketTypes.find((tt) => tt.id === item.ticketTypeId)!;
        return {
            order_id: order.id,
            event_id: eventId,
            ticket_type_id: item.ticketTypeId,
            ticket_type_v2_id: item.ticketTypeId,
            quantity: item.quantity,
            unit_price_cents: ticketType.price_cents,
            event_week_day_id: item.eventWeekDayId,
            valid_start_at: item.valid_start_at ?? null,
            valid_end_at: item.valid_end_at ?? null,
        };
    });

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
    
    if (itemsError) {
        console.error('[CHECKOUT V2] Order Items insert failed', itemsError);
        // Clean up order
        await supabase.from('orders').delete().eq('id', order.id);
        throw new Error(`Order items creation failed: ${itemsError.message}`);
    }

    // 11. Create Stripe Session
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
        event_week_id: eventWeekId,
        merchant_id: event.merchant_id,
        ...(finalInviteCode ? { invite_code: finalInviteCode } : {}),
        version: 'v2'
      },
    });

    // 12. Update Order with Session ID
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
