/**
 * POST /api/admin/events/[eventId]/pricing
 * Admin Override Event Pricing API
 * 管理员直接修改票价/库存（必须写 audit_logs 和 reason）
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const body = await request.json();
    const { ticketTypeId, priceCents, inventoryLimit, reason } = body;
    
    if (!ticketTypeId || !reason || !reason.trim()) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: 'Ticket type ID and reason are required' },
        { status: 400 }
      );
    }
    
    if (priceCents === undefined && inventoryLimit === undefined) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: 'Must provide price or inventory to update' },
        { status: 400 }
      );
    }
    
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
    
    // 获取当前票务类型状态
    const { data: ticketType, error: ticketTypeError } = await supabase
      .from('ticket_types')
      .select('*')
      .eq('id', ticketTypeId)
      .eq('event_id', eventId)
      .single();
    
    if (ticketTypeError || !ticketType) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Ticket type not found' },
        { status: 404 }
      );
    }
    
    const beforeState = {
      price_cents: ticketType.price_cents,
      inventory_limit: ticketType.inventory_limit,
    };
    
    const updateData: any = {};
    if (priceCents !== undefined) {
      updateData.price_cents = priceCents;
    }
    if (inventoryLimit !== undefined) {
      updateData.inventory_limit = inventoryLimit;
    }
    
    const afterState = {
      ...beforeState,
      ...updateData,
    };
    
    // 更新票务类型
    const { error: updateError } = await supabase
      .from('ticket_types')
      .update(updateData)
      .eq('id', ticketTypeId);
    
    if (updateError) {
      throw updateError;
    }
    
    // 写 audit log
    await supabase.rpc('log_audit', {
      p_action: 'admin_override_pricing',
      p_entity_type: 'ticket_type',
      p_entity_id: ticketTypeId,
      p_before_state: beforeState,
      p_after_state: afterState,
      p_metadata: {
        event_id: eventId,
        reason,
        admin_user_id: user.id,
      },
    });
    
    return NextResponse.json({
      success: true,
      data: {
        ticketTypeId,
        ...updateData,
        message: 'Pricing updated successfully',
      },
    });
  } catch (error: any) {
    console.error('[ADMIN EVENT PRICING API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
