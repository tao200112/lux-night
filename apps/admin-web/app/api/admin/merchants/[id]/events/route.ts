/**
 * POST /api/admin/merchants/[id]/events
 * Admin Create Event for Merchant API (Refactored for Validity Window Model)
 * 管理员为商家创建活动（重构版：支持长期有效期 + 周期性售票）
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rl = await rateLimitOrResponse(request, rateLimitPolicies.sensitivePost, { userId: 'anon' });
    if ('response' in rl) return rl.response;

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
      description,
      poster_url,
      // NEW FIELDS for validity window model
      validity_start_date,
      validity_end_date,
      schedule_mode = 'weekly', // 'single' | 'weekly'
      timezone,
      // OPTIONAL fields (for single mode backwards compatibility)
      start_at,
      end_at,
      venue_id, // Optional - can be null
      // WEEKLY SCHEDULE
      weekly_schedule_rules,
      // TICKET TYPES
      ticket_types,
      // STATUS
      published_status = 'DRAFT',
      refund_policy = 'no_refund',
      age_policy = '21+',
    } = body;
    
    const isDraft = published_status === 'DRAFT';
    
    // ========================================
    // VALIDATION: NEW BUSINESS MODEL
    // ========================================
    
    // 验证 merchant 存在且有 region
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('id, region_id, default_venue_id, timezone')
      .eq('id', merchantId)
      .single();
    
    if (merchantError || !merchant) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Merchant not found' },
        { status: 404 }
      );
    }
    
    if (!merchant.region_id) {
      return NextResponse.json(
        { 
          success: false, 
          code: 'MERCHANT_NO_REGION', 
          message: 'Merchant must have a region configured before creating events' 
        },
        { status: 400 }
      );
    }
    
    // Publish validation (CHANGED: no venue/times required)
    if (!isDraft) {
      if (!title || !title.trim()) {
        return NextResponse.json(
          { success: false, code: 'VALIDATION_ERROR', message: 'Title is required for publishing' },
          { status: 400 }
        );
      }
      
      // Weekly mode: validate validity dates
      if (schedule_mode === 'weekly') {
        if (!validity_start_date || !validity_end_date) {
          return NextResponse.json(
            { 
              success: false, 
              code: 'VALIDATION_ERROR', 
              message: 'Validity start and end dates are required for weekly mode' 
            },
            { status: 400 }
          );
        }
        
        const startDate = new Date(validity_start_date);
        const endDate = new Date(validity_end_date);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return NextResponse.json(
            { success: false, code: 'INVALID_DATE', message: 'Invalid validity date format' },
            { status: 400 }
          );
        }
        
        if (endDate < startDate) {
          return NextResponse.json(
            { success: false, code: 'INVALID_DATE', message: 'Validity end date must be after start date' },
            { status: 400 }
          );
        }
        
        // Validate at least one enabled weekday
        if (!weekly_schedule_rules || !Array.isArray(weekly_schedule_rules)) {
          return NextResponse.json(
            { 
              success: false, 
              code: 'VALIDATION_ERROR', 
              message: 'Weekly schedule rules are required for weekly mode' 
            },
            { status: 400 }
          );
        }
        
        const enabledDays = weekly_schedule_rules.filter((r: any) => r.is_on_sale);
        if (enabledDays.length === 0) {
          return NextResponse.json(
            { 
              success: false, 
              code: 'VALIDATION_ERROR', 
              message: 'At least one weekday must be enabled for weekly mode' 
            },
            { status: 400 }
          );
        }
      }
      
      // Single mode: validate start_at/end_at (backwards compatibility)
      if (schedule_mode === 'single') {
        if (!start_at || !end_at) {
          return NextResponse.json(
            { success: false, code: 'VALIDATION_ERROR', message: 'Start and end times are required for single mode' },
            { status: 400 }
          );
        }
        
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
      }
      
      // Validate tickets (at least one active for publish)
      if (ticket_types && Array.isArray(ticket_types)) {
        const activeTickets = ticket_types.filter((tt: any) => tt.status === 'ACTIVE');
        if (activeTickets.length === 0) {
          return NextResponse.json(
            { success: false, code: 'VALIDATION_ERROR', message: 'At least one active ticket type is required for publishing' },
            { status: 400 }
          );
        }
      }
    }
    
    // ========================================
    // CONSTRUCT EVENT DATA
    // ========================================
    
    const eventData: any = {
      merchant_id: merchantId,
      // region_id will be set automatically by trigger from merchant.region_id
      title: title?.trim() || null,
      description: description?.trim() || null,
      poster_url: poster_url || null,
      refund_policy: refund_policy,
      age_policy: age_policy,
      status: published_status === 'PUBLISHED' ? 'published' : 'draft',
      schedule_mode: schedule_mode,
      timezone: timezone || merchant.timezone || 'America/New_York',
      venue_id: venue_id || null, // OPTIONAL - can be null
    };
    
    // Weekly mode: set validity dates
    if (schedule_mode === 'weekly' && validity_start_date && validity_end_date) {
      eventData.validity_start_date = validity_start_date; // DATE type
      eventData.validity_end_date = validity_end_date; // DATE type
    }
    
    // Single mode: set start_at/end_at (backwards compatibility)
    if (schedule_mode === 'single' && start_at && end_at) {
      eventData.start_at = new Date(start_at).toISOString();
      eventData.end_at = new Date(end_at).toISOString();
    }
    
    // ========================================
    // CREATE EVENT
    // ========================================
    
    const { data: event, error: createError } = await supabase
      .from('events')
      .insert(eventData)
      .select()
      .single();
    
    if (createError || !event) {
      console.error('[ADMIN CREATE EVENT] Error:', createError);
      
      // User-friendly error handling
      if (createError?.code === '23502') {
        const column = createError.message.match(/column "(\w+)"/)?.[1];
        return NextResponse.json(
          { 
            success: false, 
            code: 'MISSING_REQUIRED_FIELD', 
            message: `Required field ${column} is missing. This may indicate a database schema issue.` 
          },
          { status: 400 }
        );
      }
      
      if (createError?.code === '23514' || createError?.message?.includes('events_validity_ok')) {
        return NextResponse.json(
          { 
            success: false, 
            code: 'VALIDATION_ERROR', 
            message: 'Invalid event configuration. Please check validity dates and schedule mode.' 
          },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { success: false, code: 'CREATE_FAILED', message: createError?.message || 'Failed to create event' },
        { status: 500 }
      );
    }
    
    // ========================================
    // CREATE WEEKLY SCHEDULE RULES
    // ========================================
    
    if (weekly_schedule_rules && Array.isArray(weekly_schedule_rules) && weekly_schedule_rules.length > 0) {
      const rulesData = weekly_schedule_rules.map((rule: any) => ({
        event_id: event.id,
        day_of_week: rule.day_of_week,
        is_on_sale: rule.is_on_sale !== undefined ? rule.is_on_sale : false,
        valid_from_time: rule.valid_from_time || '22:00:00',
        valid_to_time: rule.valid_to_time || '04:00:00',
        timezone: rule.timezone || timezone || 'America/New_York',
      }));
      
      const { error: rulesError } = await supabase
        .from('event_weekly_rules')
        .insert(rulesData);
      
      if (rulesError) {
        console.error('[CREATE WEEKLY RULES] Error:', rulesError);
        // Don't fail the entire request, just log it
      }
    }
    
    // ========================================
    // CREATE TICKET TYPES
    // ========================================
    
    if (ticket_types && Array.isArray(ticket_types) && ticket_types.length > 0) {
      const ticketTypesData = ticket_types.map((tt: any, index: number) => ({
        event_id: event.id,
        name: tt.name.trim(),
        category: tt.category || 'ENTRY',
        price_cents: Math.round(parseFloat(tt.price_cents || '0')),
        currency: 'usd',
        inventory_limit: tt.inventory_limit || null,
        is_active: tt.status === 'ACTIVE',
      }));
      
      const { data: createdTickets, error: ticketTypesError } = await supabase
        .from('ticket_types')
        .insert(ticketTypesData)
        .select('id, name');
      
      if (ticketTypesError) {
        console.error('[CREATE TICKET TYPES] Error:', ticketTypesError);
      }
    }
    
    // ========================================
    // AUDIT LOG
    // ========================================
    
    const { error: auditError } = await supabase.rpc('log_audit', {
      p_action: 'admin_create_event',
      p_entity_type: 'event',
      p_entity_id: event.id,
      p_before_state: null,
      p_after_state: { 
        title: event.title, 
        status: event.status, 
        schedule_mode: event.schedule_mode,
        merchant_id: merchantId 
      },
      p_metadata: { created_by_admin: true },
    });
    
    if (auditError) console.error('[AUDIT LOG] Error:', auditError);
    
    return NextResponse.json({
      success: true,
      data: {
        id: event.id,
        title: event.title,
        status: event.status,
        schedule_mode: event.schedule_mode,
        validity_start_date: event.validity_start_date,
        validity_end_date: event.validity_end_date,
        start_at: event.start_at,
        end_at: event.end_at,
        merchant_id: event.merchant_id,
        region_id: event.region_id,
      },
    });
    
  } catch (error: any) {
    console.error('[ADMIN CREATE EVENT] Unexpected error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
