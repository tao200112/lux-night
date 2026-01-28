/**
 * Stripe Event Week Sync
 * Stripe 同步逻辑：为每个 ticket_types_v2 创建/更新 Stripe Product/Price
 */

import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-02-24.acacia',
});

/**
 * 同步单个 ticket_type 的 Stripe Product/Price
 * 
 * 规则：
 * - 若没有 stripe_product_id：创建 product
 * - 若 price_cents 变化或 stripe_price_id 为空：创建新 price，更新 stripe_price_id
 * - 价格改变 => 创建新 Price（不要更新旧 price）
 */
export async function syncTicketTypeStripe(
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
): Promise<{ productId: string; priceId: string }> {
  const supabase = createAdminClient();

  // 1. 获取当前 ticket_type
  const { data: ticketType, error: fetchError } = await supabase
    .from('ticket_types_v2')
    .select('*')
    .eq('id', ticketTypeId)
    .single();

  if (fetchError || !ticketType) {
    throw new Error(`Ticket type not found: ${ticketTypeId}`);
  }

  let productId = ticketType.stripe_product_id;
  let priceId = ticketType.stripe_price_id;
  const currentPriceCents = ticketType.price_cents;

  // 2. 创建或获取 Stripe Product
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

  // 3. 检查是否需要创建新 Price
  // 规则：价格改变 => 创建新 Price
  let needsNewPrice = false;
  if (!priceId) {
    needsNewPrice = true;
  } else {
    // 检查当前 price 的价格是否匹配
    try {
      const existingPrice = await stripe.prices.retrieve(priceId);
      if (existingPrice.unit_amount !== priceCents) {
        needsNewPrice = true;
      }
    } catch (error) {
      // Price 不存在或已失效，需要创建新的
      needsNewPrice = true;
    }
  }

  // 4. 创建新 Price（如果需要）
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

    // 可选：将旧 price 设为 inactive（如果存在）
    if (ticketType.stripe_price_id) {
      try {
        await stripe.prices.update(ticketType.stripe_price_id, {
          active: false,
        });
      } catch (error) {
        // 忽略错误（price 可能已不存在）
      }
    }
  }

  // 5. 更新 ticket_type 的 stripe_product_id 和 stripe_price_id
  const { error: updateError } = await supabase
    .from('ticket_types_v2')
    .update({
      stripe_product_id: productId,
      stripe_price_id: priceId,
    })
    .eq('id', ticketTypeId);

  if (updateError) {
    throw new Error(`Failed to update ticket type: ${updateError.message}`);
  }

  return { productId, priceId };
}

/**
 * 批量同步 event_week 的所有 active ticket_types
 */
export async function syncEventWeekStripe(
  eventWeekId: string
): Promise<void> {
  const supabase = createAdminClient();

  // 1. 获取 event_week 和关联数据
  const { data: eventWeek, error: weekError } = await supabase
    .from('event_weeks')
    .select(`
      id,
      event_id,
      week_start_date,
      timezone,
      events_v2 (
        id,
        title,
        merchant_id
      )
    `)
    .eq('id', eventWeekId)
    .single();

  if (weekError || !eventWeek) {
    throw new Error(`Event week not found: ${eventWeekId}`);
  }

  // 2. 获取所有 days 和 tickets
  const { data: days, error: daysError } = await supabase
    .from('event_week_days')
    .select(`
      id,
      dow,
      ticket_types_v2!inner (
        id,
        name,
        price_cents,
        status,
        stripe_product_id,
        stripe_price_id
      )
    `)
    .eq('event_week_id', eventWeekId);

  if (daysError) {
    throw new Error(`Failed to fetch days: ${daysError.message}`);
  }

  // 3. 同步每个 active ticket_type
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  for (const day of days || []) {
    const dayName = dayNames[day.dow] || `Day ${day.dow}`;
    
    for (const ticket of day.ticket_types_v2 || []) {
      if (ticket.status === 'active') {
        try {
          await syncTicketTypeStripe(
            ticket.id,
            (eventWeek.events_v2 as any).title,
            eventWeek.week_start_date,
            dayName,
            ticket.name,
            ticket.price_cents,
            (eventWeek.events_v2 as any).merchant_id,
            eventWeek.event_id,
            eventWeekId,
            day.id
          );
        } catch (error) {
          console.error(`Failed to sync ticket type ${ticket.id}:`, error);
          // 继续处理其他 ticket_types，不中断整个流程
        }
      }
    }
  }
}
