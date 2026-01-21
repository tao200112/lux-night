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
    
    // 获取事件详情
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
          address
        )
      `)
      .eq('id', eventId)
      .single();
    
    if (eventError || !event) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Event not found' },
        { status: 404 }
      );
    }
    
    // 获取票务类型
    const { data: ticketTypes, error: ticketTypesError } = await supabase
      .from('ticket_types')
      .select('*')
      .eq('event_id', eventId)
      .order('price_cents', { ascending: false });
    
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
        merchant: event.merchants && Array.isArray(event.merchants) && event.merchants.length > 0 ? {
          id: event.merchants[0].id,
          name: event.merchants[0].name,
        } : null,
        region: event.regions && Array.isArray(event.regions) && event.regions.length > 0 ? {
          id: event.regions[0].id,
          name: event.regions[0].name,
          state: event.regions[0].state,
          country: event.regions[0].country,
        } : null,
        venue: event.venues && (Array.isArray(event.venues) ? event.venues[0] : event.venues) ? {
          id: Array.isArray(event.venues) ? event.venues[0].id : event.venues.id,
          name: Array.isArray(event.venues) ? event.venues[0].name : event.venues.name,
          address: Array.isArray(event.venues) ? event.venues[0].address : event.venues.address,
        } : null,
        ticketTypes: (ticketTypes || []).map((tt: any) => ({
          id: tt.id,
          name: tt.name,
          description: tt.description,
          category: tt.category,
          priceCents: tt.price_cents,
          price: tt.price_cents / 100,
          priceFormatted: `$${(tt.price_cents / 100).toFixed(2)}`,
          inventoryLimit: tt.inventory_limit,
          inventory: tt.inventory_limit,
          soldCount: tt.sold_count,
          remaining: (tt.inventory_limit || 0) - tt.sold_count,
          status: tt.status || (tt.is_active ? 'ACTIVE' : 'INACTIVE'),
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
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().optional(),
  redeem_start_at: z.string().datetime().nullable().optional(),
  redeem_end_at: z.string().datetime().nullable().optional(),
  refund_policy: z.string().optional(),
  published_status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  ticket_types: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string(),
    description: z.string().nullable().optional(),
    category: z.enum(['ENTRY', 'DRINK', 'VIP', 'SKIP_LINE']),
    price_cents: z.number().int().min(0),
    inventory_limit: z.number().int().min(0).nullable().optional(),
    max_per_order: z.number().int().min(1).optional(),
    age_requirement: z.enum(['NONE', '18_PLUS', '21_PLUS']).optional(),
    sales_start_at: z.string().datetime().nullable().optional(),
    sales_end_at: z.string().datetime().nullable().optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'HIDDEN']).optional(),
    sort_order: z.number().int().optional(),
    redeem_limit: z.number().int().min(0).optional(),
    redeem_start_at_override: z.string().datetime().nullable().optional(),
    redeem_end_at_override: z.string().datetime().nullable().optional(),
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
    
    // 使用admin client更新事件
    const adminClient = createAdminClient();
    
    // 构建更新数据
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title.trim() || null;
    if (data.subtitle !== undefined) updateData.subtitle = data.subtitle?.trim() || null;
    if (data.description !== undefined) updateData.description = data.description?.trim() || null;
    if (data.poster_url !== undefined) updateData.poster_url = data.poster_url;
    if (data.venue_id !== undefined) updateData.venue_id = data.venue_id;
    if (data.start_at !== undefined) updateData.start_at = data.start_at;
    if (data.end_at !== undefined) updateData.end_at = data.end_at;
    if (data.redeem_start_at !== undefined) updateData.redeem_start_at = data.redeem_start_at;
    if (data.redeem_end_at !== undefined) updateData.redeem_end_at = data.redeem_end_at;
    if (data.refund_policy !== undefined) updateData.refund_policy = data.refund_policy;
    if (data.published_status !== undefined) {
      updateData.status = data.published_status === 'PUBLISHED' ? 'published' : 'draft';
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
    
    // 更新票种（如果提供了）
    if (data.ticket_types && Array.isArray(data.ticket_types)) {
      // 删除现有票种（简化处理：删除所有后重新插入）
      await adminClient
        .from('ticket_types')
        .delete()
        .eq('event_id', eventId);
      
      // 插入新票种
      if (data.ticket_types.length > 0) {
        const ticketTypesToInsert = data.ticket_types.map((tt: any) => ({
          event_id: eventId,
          name: tt.name,
          description: tt.description || null,
          category: tt.category,
          price_cents: tt.price_cents,
          inventory_limit: tt.inventory_limit || null,
          max_per_order: tt.max_per_order || 10,
          age_requirement: tt.age_requirement || 'NONE',
          sales_start_at: tt.sales_start_at || null,
          sales_end_at: tt.sales_end_at || null,
          status: tt.status || 'DRAFT',
          sort_order: tt.sort_order || 0,
          redeem_limit: tt.redeem_limit || 1,
          redeem_start_at_override: tt.redeem_start_at_override || null,
          redeem_end_at_override: tt.redeem_end_at_override || null,
        }));
        
        const { error: ticketTypesError } = await adminClient
          .from('ticket_types')
          .insert(ticketTypesToInsert);
        
        if (ticketTypesError) {
          console.error('[ADMIN EVENT UPDATE API] Ticket types error:', ticketTypesError);
          // 不阻断，继续返回事件更新结果
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
