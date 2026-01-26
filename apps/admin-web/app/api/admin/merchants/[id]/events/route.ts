/**
 * POST /api/admin/merchants/[id]/events
 * Admin Create Event for Merchant API (Enhanced)
 * 管理员为商家创建活动（完整版：支持海报、票种、核销窗口等）
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: merchantId } = await params;
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
    const {
      title,
      subtitle,
      description,
      poster_url,
      venue_id,
      region_id: body_region_id,
      start_at,
      end_at,
      redeem_start_at,
      redeem_end_at,
      refund_policy,
      ticket_types,
      published_status = 'PUBLISHED', // 管理员创建默认直接发布
    } = body;
    
    // 根据published_status决定校验规则
    const isDraft = published_status === 'DRAFT';
    
    // Draft: 允许大部分字段为空
    // Publish: 严格校验
    if (!isDraft) {
      // 发布时：严格校验
      if (!title || !title.trim()) {
        return NextResponse.json(
          { success: false, code: 'VALIDATION_ERROR', message: 'Title is required for publishing' },
          { status: 400 }
        );
      }
      
      if (!venue_id) {
        return NextResponse.json(
          { success: false, code: 'VALIDATION_ERROR', message: 'Venue is required for publishing. Please bind a venue to this merchant first.' },
          { status: 400 }
        );
      }
      
      if (!start_at || !end_at) {
        return NextResponse.json(
          { success: false, code: 'VALIDATION_ERROR', message: 'Start and end times are required for publishing' },
          { status: 400 }
        );
      }
      
      // 验证日期
      const startDate = new Date(start_at);
      const endDate = new Date(end_at);
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
      if (!ticket_types || !Array.isArray(ticket_types) || ticket_types.length === 0) {
        return NextResponse.json(
          { success: false, code: 'VALIDATION_ERROR', message: 'At least one ticket type is required for publishing' },
          { status: 400 }
        );
      }
      
      const activeTickets = ticket_types.filter((tt: any) => tt.status === 'ACTIVE');
      if (activeTickets.length === 0) {
        return NextResponse.json(
          { success: false, code: 'VALIDATION_ERROR', message: 'At least one active ticket type is required for publishing' },
          { status: 400 }
        );
      }
    } else {
      // 草稿时：只做最小校验
      // 如果提供了时间，验证时间格式和逻辑
      if (start_at && end_at) {
        const startDate = new Date(start_at);
        const endDate = new Date(end_at);
        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && endDate <= startDate) {
          return NextResponse.json(
            { success: false, code: 'INVALID_DATE', message: 'End date must be after start date' },
            { status: 400 }
          );
        }
      }
    }
    
    // 验证核销时间窗口
    let redeemStart = redeem_start_at ? new Date(redeem_start_at) : null;
    let redeemEnd = redeem_end_at ? new Date(redeem_end_at) : null;
    
    if (redeemStart && redeemEnd && redeemEnd <= redeemStart) {
      return NextResponse.json(
        { success: false, code: 'INVALID_REDEEM_WINDOW', message: 'Redeem end time must be after redeem start time' },
        { status: 400 }
      );
    }
    
    // 验证 merchant 存在
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('id, region_id, default_venue_id')
      .eq('id', merchantId)
      .single();
    
    if (merchantError || !merchant) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Merchant not found' },
        { status: 404 }
      );
    }
    
    // 确定最终使用的venue_id和region_id
    // 优先级：1. 传入的venue_id 2. merchant.default_venue_id 3. 该merchant的第一个active venue
    let finalVenueId = venue_id || merchant.default_venue_id || null;
    let finalRegionId = merchant.region_id || null;
    
    // 如果还没有venue_id，尝试获取merchant的第一个active venue
    if (!finalVenueId) {
      const { data: firstVenue, error: firstVenueError } = await supabase
        .from('venues')
        .select('id, region_id')
        .eq('merchant_id', merchantId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      
      if (!firstVenueError && firstVenue) {
        finalVenueId = firstVenue.id;
        finalRegionId = firstVenue.region_id || merchant.region_id || null;
      }
    }
    
    // Publish时：必须要有venue_id和region_id
    if (!isDraft) {
      if (!finalVenueId) {
        return NextResponse.json(
          { 
            success: false, 
            code: 'MERCHANT_VENUE_NOT_BOUND', 
            message: 'Venue is required for publishing. This merchant has no venue bound. Please bind a venue to this merchant first.' 
          },
          { status: 400 }
        );
      }
      if (!finalRegionId) {
        return NextResponse.json(
          { 
            success: false, 
            code: 'MERCHANT_REGION_NOT_BOUND', 
            message: 'Region is required for publishing. This merchant has no region bound. Please bind a region to this merchant first.' 
          },
          { status: 400 }
        );
      }
    }
    
    // 验证 venue（如果提供了venue_id）
    let venue = null;
    if (finalVenueId) {
      const { data: venueData, error: venueError } = await supabase
        .from('venues')
        .select('id, merchant_id, region_id')
        .eq('id', finalVenueId)
        .eq('merchant_id', merchantId)
        .single();
      
      if (venueError || !venueData) {
        return NextResponse.json(
          { success: false, code: 'INVALID_VENUE', message: 'Venue not found or does not belong to this merchant' },
          { status: 404 }
        );
      }
      venue = venueData;
      // 若 body 显式传了 region_id，须与 venue.region_id 一致
      if (body_region_id && venue.region_id !== body_region_id) {
        return NextResponse.json(
          { success: false, code: 'VALIDATION_ERROR', message: 'Venue must belong to the selected region' },
          { status: 400 }
        );
      }
      if (body_region_id) {
        finalRegionId = body_region_id;
      } else if (venue.region_id) {
        finalRegionId = venue.region_id;
      }
    } else if (body_region_id) {
      finalRegionId = body_region_id;
    }
    
    // 构建event数据
    const eventData: any = {
      region_id: finalRegionId,
      merchant_id: merchantId,
      venue_id: finalVenueId,
      title: title?.trim() || null,
      subtitle: subtitle?.trim() || null,
      description: description?.trim() || null,
      poster_url: poster_url || null,
      refund_policy: refund_policy || 'no_refund',
      status: published_status === 'PUBLISHED' ? 'published' : 'draft',
      published_status: published_status,
    };
    
    // 时间字段（如果提供）
    if (start_at) {
      const startDate = new Date(start_at);
      if (!isNaN(startDate.getTime())) {
        eventData.start_at = startDate.toISOString();
      }
    }
    
    if (end_at) {
      const endDate = new Date(end_at);
      if (!isNaN(endDate.getTime())) {
        eventData.end_at = endDate.toISOString();
      }
    }
    
    if (redeem_start_at) {
      const redeemStart = new Date(redeem_start_at);
      if (!isNaN(redeemStart.getTime())) {
        eventData.redeem_start_at = redeemStart.toISOString();
      }
    }
    
    if (redeem_end_at) {
      const redeemEnd = new Date(redeem_end_at);
      if (!isNaN(redeemEnd.getTime())) {
        eventData.redeem_end_at = redeemEnd.toISOString();
      }
    }
    
    // 创建活动
    const { data: event, error: createError } = await supabase
      .from('events')
      .insert(eventData)
      .select()
      .single();
    
    if (createError || !event) {
      console.error('[ADMIN CREATE EVENT] Error:', createError);
      
      // 检查是否是触发器抛出的 check_violation（region 不一致）
      if (createError?.code === '23514' || createError?.message?.includes('Consistency violation')) {
        return NextResponse.json(
          { success: false, code: 'REGION_MISMATCH', message: 'Venue region does not match merchant region. Please use a venue in the same region.' },
          { status: 400 }
        );
      }
      
      // 检查是否是 venue/region 相关的触发器错误
      if (createError?.message?.includes('region_id') || createError?.message?.includes('venue')) {
        return NextResponse.json(
          { success: false, code: 'VENUE_REGION_ERROR', message: createError.message || 'Venue or region configuration error' },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { success: false, code: 'CREATE_FAILED', message: createError?.message || 'Failed to create event' },
        { status: 500 }
      );
    }
    
    // 创建票种（如果有）
    if (ticket_types && Array.isArray(ticket_types) && ticket_types.length > 0) {
      const ticketTypesData = ticket_types.map((tt: any, index: number) => ({
        event_id: event.id,
        name: tt.name.trim(),
        description: tt.description?.trim() || null,
        category: tt.category || 'ENTRY',
        price_cents: Math.round((tt.price_cents || 0) * 100), // 前端传美元，转换为分
        currency: 'usd',
        quantity_total: tt.quantity_total || null,
        max_per_order: tt.max_per_order || 4,
        age_requirement: tt.age_requirement || 'NONE',
        sales_start_at: tt.sales_start_at ? new Date(tt.sales_start_at).toISOString() : null,
        sales_end_at: tt.sales_end_at ? new Date(tt.sales_end_at).toISOString() : null,
        status: tt.status || (published_status === 'PUBLISHED' ? 'ACTIVE' : 'DRAFT'),
        sort_order: tt.sort_order !== undefined ? tt.sort_order : index,
        redeem_limit: tt.redeem_limit || 1,
        redeem_start_at_override: tt.redeem_start_at_override ? new Date(tt.redeem_start_at_override).toISOString() : null,
        redeem_end_at_override: tt.redeem_end_at_override ? new Date(tt.redeem_end_at_override).toISOString() : null,
      }));
      
      const { error: ticketTypesError } = await supabase
        .from('ticket_types')
        .insert(ticketTypesData);
      
      if (ticketTypesError) {
        console.error('[CREATE TICKET TYPES] Error:', ticketTypesError);
        // 不失败整个请求，只记录错误
      }
    }
    
    // 写 audit log
    await supabase.rpc('log_audit', {
      p_action: 'admin_create_event',
      p_entity_type: 'event',
      p_entity_id: event.id,
      p_before_state: null,
      p_after_state: { title: event.title, status: event.status, published_status, merchant_id: merchantId },
      p_metadata: { venue_id, created_by_admin: true },
    });
    
    return NextResponse.json({
      success: true,
      data: {
        id: event.id,
        title: event.title,
        status: event.status,
        published_status: event.published_status,
        startAt: event.start_at,
        endAt: event.end_at,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN CREATE EVENT] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
