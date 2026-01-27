/**
 * GET /api/admin/events/[eventId]
 * Admin Event Detail API
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const supabase = await createClient();
    
    // 检查 Admin 权限
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' },
        { status: 401 }
      );
    }
    
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', message: 'Must be admin' },
        { status: 403 }
      );
    }
    
    // 获取事件详情（包含所有字段）
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(`
        *,
        merchants!inner(
          id,
          name
        ),
        regions!inner(
          id,
          name,
          state,
          country
        ),
        venues(
          id,
          name,
          address,
          region_id
        ),
        event_weekly_rules(*)
      `)
      .eq('id', eventId)
      .single();
    
    if (eventError || !event) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Event not found' },
        { status: 404 }
      );
    }
    
    // 获取票务类型（包含所有字段和已售出数量）
    const { data: ticketTypes, error: ticketTypesError } = await supabase
      .from('ticket_types')
      .select(`
        *,
        ticket_type_prices(*)
      `)
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true });
    
    // 获取订单统计
    const { count: totalOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);
    
    const { data: revenueOrders } = await supabase
      .from('orders')
      .select('total_cents')
      .eq('event_id', eventId)
      .eq('status', 'completed');
    
    const totalRevenue = (revenueOrders || []).reduce((sum, order) => sum + (order.total_cents || 0), 0);
    
    // 获取已核销票数
    const { count: redeemedTickets } = await supabase
      .from('checkins')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);
    
    return NextResponse.json({
      success: true,
      data: {
        id: event.id,
        title: event.title,
        subtitle: event.subtitle,
        description: event.description,
        status: event.status,
        startAt: event.start_at,
        endAt: event.end_at,
        posterUrl: event.poster_url,
        agePolicy: event.age_policy,
        refundPolicy: event.refund_policy,
        redeemStartAt: event.redeem_start_at,
        redeemEndAt: event.redeem_end_at,
        merchant: (() => {
          if (!event.merchants) return null;
          const merchantData = Array.isArray(event.merchants) ? event.merchants[0] : event.merchants;
          return merchantData ? {
            id: merchantData.id,
            name: merchantData.name,
          } : null;
        })(),
        region: (() => {
          if (!event.regions) return null;
          const regionData = Array.isArray(event.regions) ? event.regions[0] : event.regions;
          return regionData ? {
            id: regionData.id,
            name: regionData.name,
            state: regionData.state,
            country: regionData.country,
          } : null;
        })(),
        venue: (() => {
          if (!event.venues) return null;
          const venueData = Array.isArray(event.venues) ? event.venues[0] : event.venues;
          return venueData ? {
            id: venueData.id,
            name: venueData.name,
            address: venueData.address,
            region_id: venueData.region_id,
          } : null;
        })(),
        weeklyRules: event.event_weekly_rules || [],
        ticketTypes: (ticketTypes || []).map((tt: any) => ({
          id: tt.id,
          name: tt.name,
          description: tt.description || '',
          category: tt.category,
          priceCents: tt.price_cents,
          price: tt.price_cents / 100,
          priceFormatted: `$${(tt.price_cents / 100).toFixed(2)}`,
          inventoryLimit: tt.inventory_limit,
          inventory: tt.inventory_limit,
          soldCount: tt.sold_count || 0,
          remaining: (tt.inventory_limit || 0) - (tt.sold_count || 0),
          status: tt.status || (tt.is_active ? 'ACTIVE' : 'INACTIVE'),
          maxPerOrder: tt.max_per_order || 10,
          ageRequirement: tt.age_requirement || 'NONE',
          salesStartAt: tt.sales_start_at,
          salesEndAt: tt.sales_end_at,
          sortOrder: tt.sort_order || 0,
          redeemLimit: tt.redeem_limit || 1,
          redeemStartAtOverride: tt.redeem_start_at_override,
          redeemEndAtOverride: tt.redeem_end_at_override,
          dayPrices: tt.ticket_type_prices || [],
        })),
        stats: {
          totalOrders: totalOrders || 0,
          totalRevenue: totalRevenue,
          totalRevenueFormatted: `$${(totalRevenue / 100).toLocaleString()}`,
          redeemedTickets: redeemedTickets || 0,
        },
        createdAt: event.created_at,
        updatedAt: event.updated_at,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN EVENT DETAIL API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}

// Zod schema for event update
const UpdateEventSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  poster_url: z.string().nullable().optional(),
  venue_id: z.string().uuid().nullable().optional(),
  region_id: z.string().uuid().optional(),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().optional(),
  redeem_start_at: z.string().datetime().nullable().optional(),
  redeem_end_at: z.string().datetime().nullable().optional(),
  refund_policy: z.string().optional(),
  published_status: z.enum(['DRAFT', 'PUBLISHED', 'PAUSED', 'CANCELLED']).optional(),
  weekly_schedule_rules: z.array(z.object({
    day_of_week: z.number().min(0).max(6),
    is_on_sale: z.boolean(),
    valid_from_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    valid_to_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    timezone: z.string().optional(),
  })).nullable().optional(),
  ticket_types: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string(),
    description: z.string().nullable().optional(),
    category: z.enum(['ENTRY', 'DRINK', 'VIP', 'SKIP_LINE']),
    price_cents: z.number().int().min(0),
    quantity_total: z.number().int().min(0).nullable().optional(), // 前端使用 quantity_total
    inventory_limit: z.number().int().min(0).nullable().optional(), // 兼容字段
    max_per_order: z.number().int().min(1).optional(),
    age_requirement: z.enum(['NONE', '18_PLUS', '21_PLUS']).optional(),
    sales_start_at: z.string().datetime().nullable().optional(),
    sales_end_at: z.string().datetime().nullable().optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'HIDDEN']).optional(),
    sort_order: z.number().int().optional(),
    redeem_limit: z.number().int().min(0).optional(),
    redeem_start_at_override: z.string().datetime().nullable().optional(),
    redeem_end_at_override: z.string().datetime().nullable().optional(),
    day_prices: z.array(z.object({
        day_of_week: z.number().min(0).max(6),
        is_enabled: z.boolean(),
        price_cents: z.number().int().min(0),
        quantity_limit: z.number().int().min(0).nullable().optional(),
    })).optional(),
  })).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const supabase = await createClient();
    
    // 检查 Admin 权限
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' },
        { status: 401 }
      );
    }
    
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', message: 'Must be admin' },
        { status: 403 }
      );
    }
    
    const body = await request.json();
    const validationResult = UpdateEventSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ') },
        { status: 400 }
      );
    }
    
    const data = validationResult.data;
    const isDraft = data.published_status === 'DRAFT';
    
    // Publish时：严格校验
    if (!isDraft && data.published_status === 'PUBLISHED') {
      if (!data.title || !data.title.trim()) {
        return NextResponse.json(
          { success: false, code: 'VALIDATION_ERROR', message: 'Title is required for publishing' },
          { status: 400 }
        );
      }
      
      if (!data.venue_id) {
        return NextResponse.json(
          { success: false, code: 'VALIDATION_ERROR', message: 'Venue is required for publishing' },
          { status: 400 }
        );
      }
      if (data.region_id && data.venue_id) {
        const { data: v } = await supabase.from('venues').select('region_id').eq('id', data.venue_id).single();
        if (v && v.region_id !== data.region_id) {
          return NextResponse.json(
            { success: false, code: 'VALIDATION_ERROR', message: 'Venue must belong to the selected region' },
            { status: 400 }
          );
        }
      }
      if (!data.start_at || !data.end_at) {
        return NextResponse.json(
          { success: false, code: 'VALIDATION_ERROR', message: 'Start and end times are required for publishing' },
          { status: 400 }
        );
      }
      
      // 验证日期
      const startDate = new Date(data.start_at);
      const endDate = new Date(data.end_at);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json(
          { success: false, code: 'INVALID_DATE', message: 'Invalid date format' },
          { status: 400 }
        );
      }
      if (endDate <= startDate) {
        return NextResponse.json(
          { success: false, code: 'INVALID_DATE', message: 'End date must be after start date' },
          { status: 400 }
        );
      }
      
      // 发布时：至少需要一个ACTIVE票种
      if (data.ticket_types && data.ticket_types.length > 0) {
        const activeTickets = data.ticket_types.filter((tt: any) => tt.status === 'ACTIVE');
        if (activeTickets.length === 0) {
          return NextResponse.json(
            { success: false, code: 'VALIDATION_ERROR', message: 'At least one active ticket type is required for publishing' },
            { status: 400 }
          );
        }
      }
    }
    
    // Pause时：不需要严格校验，只是暂停销售
    // 允许暂停已发布的活动
    
    // 使用admin client更新事件
    const adminClient = createAdminClient();
    
    // 构建更新数据
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title.trim() || null;
    if (data.subtitle !== undefined) updateData.subtitle = data.subtitle?.trim() || null;
    if (data.description !== undefined) updateData.description = data.description?.trim() || null;
    if (data.poster_url !== undefined) updateData.poster_url = data.poster_url;
    if (data.venue_id !== undefined) updateData.venue_id = data.venue_id;
    if (data.region_id !== undefined) updateData.region_id = data.region_id;
    if (data.start_at !== undefined) updateData.start_at = data.start_at;
    if (data.end_at !== undefined) updateData.end_at = data.end_at;
    if (data.redeem_start_at !== undefined) updateData.redeem_start_at = data.redeem_start_at;
    if (data.redeem_end_at !== undefined) updateData.redeem_end_at = data.redeem_end_at;
    if (data.refund_policy !== undefined) updateData.refund_policy = data.refund_policy;
    if (data.published_status !== undefined) {
      // Map published_status to status
      if (data.published_status === 'PUBLISHED') {
        updateData.status = 'published';
      } else if (data.published_status === 'PAUSED') {
        updateData.status = 'paused';
      } else if (data.published_status === 'CANCELLED') {
        updateData.status = 'cancelled';
      } else {
        updateData.status = 'draft';
      }
    } else {
      // 如果没有指定published_status，保持当前状态不变
      // 但允许其他字段更新
    }
    
    // 更新事件
    const { data: updatedEvent, error: updateError } = await adminClient
      .from('events')
      .update(updateData)
      .eq('id', eventId)
      .select()
      .single();
    
    if (updateError || !updatedEvent) {
      console.error('[ADMIN EVENT UPDATE API] Update error:', updateError);
      return NextResponse.json(
        { success: false, code: 'DB_ERROR', message: updateError?.message || 'Failed to update event' },
        { status: 500 }
      );
    }
    
    // 更新Weekly Schedule Rules
    if (data.weekly_schedule_rules !== undefined) {
         // 先删除旧规则
         await adminClient.from('event_weekly_rules').delete().eq('event_id', eventId);
         
         if (data.weekly_schedule_rules && data.weekly_schedule_rules.length > 0) {
             const rulesToInsert = data.weekly_schedule_rules.map(rule => ({
                 event_id: eventId,
                 day_of_week: rule.day_of_week,
                 is_on_sale: rule.is_on_sale,
                 valid_from_time: rule.valid_from_time,
                 valid_to_time: rule.valid_to_time,
                 timezone: rule.timezone || 'America/Los_Angeles'
             }));
             await adminClient.from('event_weekly_rules').insert(rulesToInsert);
         }
    }
    
    // 更新票种
    if (data.ticket_types && Array.isArray(data.ticket_types)) {
      // 获取现有票种（检查已售出数量）
      const { data: existingTicketTypes } = await adminClient
        .from('ticket_types')
        .select('id, sold_count')
        .eq('event_id', eventId);
      
      const existingIds = new Set((existingTicketTypes || []).map((tt: any) => tt.id));
      const existingSoldCounts = new Map((existingTicketTypes || []).map((tt: any) => [tt.id, tt.sold_count || 0]));
      const newTicketTypes = data.ticket_types;
      const newIds = new Set(newTicketTypes.filter((tt: any) => tt.id).map((tt: any) => tt.id));
      
      // 找出需要删除的票种（只删除未售出的）
      const toDelete = Array.from(existingIds).filter(id => !newIds.has(id));
      for (const id of toDelete) {
        const soldCount = existingSoldCounts.get(id) || 0;
        if (soldCount > 0) {
          // 已售出，不能删除，改为停用
          await adminClient
            .from('ticket_types')
            .update({ status: 'HIDDEN', is_active: false })
            .eq('id', id);
        } else {
          // 未售出，可以删除
          // Note: cascading delete might handle ticket_type_prices if configured, but let's be safe
          await adminClient.from('ticket_type_prices').delete().eq('ticket_type_id', id);
          await adminClient
            .from('ticket_types')
            .delete()
            .eq('id', id);
        }
      }
      
      // 更新或插入票种
      for (const tt of newTicketTypes) {
        const ticketData: any = {
          event_id: eventId,
          name: tt.name,
          description: tt.description || null,
          category: tt.category,
          price_cents: Math.round(tt.price_cents * 100), // 前端传美元，转换为分
          inventory_limit: tt.quantity_total ?? tt.inventory_limit ?? null, // 支持 quantity_total 和 inventory_limit
          max_per_order: tt.max_per_order || 10,
          age_requirement: tt.age_requirement || 'NONE',
          sales_start_at: tt.sales_start_at || null,
          sales_end_at: tt.sales_end_at || null,
          status: tt.status || 'DRAFT',
          sort_order: tt.sort_order !== undefined ? tt.sort_order : 0,
          redeem_limit: tt.redeem_limit || 1,
          redeem_start_at_override: tt.redeem_start_at_override || null,
          redeem_end_at_override: tt.redeem_end_at_override || null,
        };
        
        let currentTicketId = tt.id;

        if (tt.id && existingIds.has(tt.id)) {
          // 更新现有票种
          const soldCount = existingSoldCounts.get(tt.id) || 0;
          if (soldCount > 0) {
            console.warn(`[ADMIN EVENT UPDATE] Ticket type ${tt.id} has ${soldCount} sold tickets. Price change will only affect new orders.`);
          }
          
          await adminClient
            .from('ticket_types')
            .update(ticketData)
            .eq('id', tt.id);
        } else {
          // 插入新票种
          const { data: newTicket, error: insertError } = await adminClient
            .from('ticket_types')
            .insert(ticketData)
            .select('id')
            .single();
            
          if (newTicket) {
              currentTicketId = newTicket.id;
          }
        }
        
        // Handle day prices
        if (currentTicketId && tt.day_prices) {
             // Delete existing prices for this ticket
             await adminClient.from('ticket_type_prices').delete().eq('ticket_type_id', currentTicketId);
             
             if (tt.day_prices.length > 0) {
                 const pricesToInsert = tt.day_prices.map(p => ({
                     ticket_type_id: currentTicketId,
                     day_of_week: p.day_of_week,
                     is_enabled: p.is_enabled,
                     price_cents: p.price_cents,
                     quantity_limit: p.quantity_limit
                 }));
                 await adminClient.from('ticket_type_prices').insert(pricesToInsert);
             }
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      data: {
        id: updatedEvent.id,
        message: 'Event updated successfully',
      },
    });
  } catch (error: any) {
    console.error('[ADMIN EVENT UPDATE API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
