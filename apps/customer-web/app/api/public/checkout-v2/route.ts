/**
 * Public Checkout V2 API
 * POST /api/public/checkout-v2 - 创建 Stripe checkout session (v2 events)
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

export async function POST(req: NextRequest) {
  try {
    // 1. 检查 Stripe 配置
    if (!isStripeConfigured || !stripe) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'STRIPE_NOT_CONFIGURED',
            message: 'Stripe is not configured',
          },
        },
        { status: 503 }
      );
    }

    // 2. 权限检查
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
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

    // 4. 获取活动（验证 status == 'active'，paused 不允许购买）
    // 4. 获取活动（验证 status）
    const { data: event, error: eventError } = await supabase
      .from('events_v2')
      .select('id, title, status, merchant_id')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: { code: 'EVENT_NOT_FOUND', message: 'Event not found' },
        },
        { status: 404 }
      );
    }

    if (event.status !== 'active') {
        const reason = event.status === 'temp_closed' ? 'temporarily closed' : 'not available';
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: 'EVENT_NOT_ACTIVE',
              message: `Event is ${reason} and cannot accept orders.`,
            },
          },
          { status: 403 }
        );
    }

    // 5. 获取 event_week 和 days
    const { data: eventWeek, error: weekError } = await supabase
      .from('event_weeks')
      .select('id, week_start_date, timezone')
      .eq('id', eventWeekId)
      .single();

    if (weekError || !eventWeek) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'WEEK_NOT_FOUND',
            message: 'Event week not found',
          },
        },
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
          id,
          dow,
          enabled,
          start_time,
          end_time,
          end_next_day
        )
      `)
      .in('id', ticketTypeIds);

    if (ticketTypesError || !ticketTypes || ticketTypes.length !== ticketTypeIds.length) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'INVALID_TICKET_TYPES',
            message: 'Invalid ticket types',
          },
        },
        { status: 400 }
      );
    }

    // 7. 验证每个 ticket_type
    let totalAmount = 0;
    for (const item of items) {
      const ticketType = ticketTypes.find((tt) => tt.id === item.ticketTypeId);
      if (!ticketType) {
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: 'TICKET_TYPE_NOT_FOUND',
              message: `Ticket type ${item.ticketTypeId} not found`,
            },
          },
          { status: 400 }
        );
      }

      // 验证 day enabled
      const day = ticketType.event_week_days;
      if (!day || !day.enabled) {
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: 'DAY_NOT_ENABLED',
              message: `Day ${day?.dow} is not enabled`,
            },
          },
          { status: 400 }
        );
      }

      // 验证 ticket status
      if (ticketType.status !== 'active') {
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: 'TICKET_NOT_ACTIVE',
              message: `Ticket type ${ticketType.name} is not active`,
            },
          },
          { status: 400 }
        );
      }

      // 验证库存
      if (ticketType.inventory_limit !== null) {
        // TODO: 需要原子扣减或事务检查库存
        // 这里简化处理，实际应该使用数据库锁或事务
      }

      // 验证 stripe_price_id 存在
      if (!ticketType.stripe_price_id) {
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: 'STRIPE_PRICE_MISSING',
              message: `Ticket type ${ticketType.name} has no Stripe price configured`,
            },
          },
          { status: 500 }
        );
      }

      totalAmount += ticketType.price_cents * item.quantity;
    }

    // 8. 创建订单
    const orderIdempotencyKey = `${user.id}-${eventId}-${Date.now()}`;
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        status: 'pending_payment',
        amount_cents: totalAmount,
        idempotency_key: orderIdempotencyKey,
      })
      .select()
      .single();

    if (orderError || !order) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'ORDER_CREATE_FAILED',
            message: 'Failed to create order',
          },
        },
        { status: 500 }
      );
    }

    // 9. 创建 order_items
    const orderItems = items.map((item) => {
      const ticketType = ticketTypes.find((tt) => tt.id === item.ticketTypeId);
      return {
        order_id: order.id,
        event_id: eventId, // 使用旧 events 表的 id（兼容）或新增 event_id_v2 字段
        ticket_type_id: item.ticketTypeId,
        quantity: item.quantity,
        unit_price_cents: ticketType!.price_cents,
      };
    });

    const { error: orderItemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (orderItemsError) {
      await supabase.from('orders').delete().eq('id', order.id);
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'ORDER_ITEMS_CREATE_FAILED',
            message: 'Failed to create order items',
          },
        },
        { status: 500 }
      );
    }

    // 10. 创建 Stripe checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: items.map((item) => {
        const ticketType = ticketTypes.find((tt) => tt.id === item.ticketTypeId);
        return {
          price: ticketType!.stripe_price_id, // 使用已创建的 Stripe Price ID
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
        event_week_id: eventWeekId,
        version: 'v2', // 标记为 v2 订单
      },
    });

    // 11. 更新订单的 Stripe session ID
    await supabase
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', order.id);

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
