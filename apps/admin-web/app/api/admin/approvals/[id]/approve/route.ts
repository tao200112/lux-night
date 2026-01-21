/**
 * POST /api/admin/approvals/[id]/approve
 * Admin Approve Request API
 * 审批通过：把 payload_after 落地到真实表，写 audit_logs
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { note } = body;
    
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
    
    // 获取审批请求详情
    const { data: requestData, error: requestError } = await supabase
      .from('requests')
      .select('*')
      .eq('id', id)
      .single();
    
    if (requestError || !requestData) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Request not found' },
        { status: 404 }
      );
    }
    
    if (requestData.status !== 'pending') {
      return NextResponse.json(
        { success: false, code: 'INVALID_STATUS', message: 'Request is not pending' },
        { status: 400 }
      );
    }
    
    // 根据 type 落地到真实表
    const payloadAfter = requestData.payload_after || {};
    let updateResult: any;
    
    switch (requestData.type) {
      case 'price_change':
      case 'PRICE_CHANGE': {
        // 更新 ticket_types 价格
        if (payloadAfter.ticket_type_id && payloadAfter.price_cents) {
          const { data: ticketType } = await supabase
            .from('ticket_types')
            .select('price_cents, event_id')
            .eq('id', payloadAfter.ticket_type_id)
            .single();
          
          if (ticketType) {
            // 记录 before state
            const beforeState = { price_cents: ticketType.price_cents };
            
            // 更新价格
            const { error: updateError } = await supabase
              .from('ticket_types')
              .update({ price_cents: payloadAfter.price_cents })
              .eq('id', payloadAfter.ticket_type_id);
            
            if (updateError) {
              throw updateError;
            }
            
            // 写 audit log
            await supabase.rpc('log_audit', {
              p_action: 'approve_price_change',
              p_entity_type: 'ticket_type',
              p_entity_id: payloadAfter.ticket_type_id,
              p_before_state: beforeState,
              p_after_state: { price_cents: payloadAfter.price_cents },
              p_metadata: { request_id: id, note },
            });
          }
        }
        break;
      }
      
      case 'new_event':
      case 'EVENT_EDIT': {
        // 更新 event
        if (payloadAfter.event_id) {
          const updateData: any = {};
          if (payloadAfter.title) updateData.title = payloadAfter.title;
          if (payloadAfter.description) updateData.description = payloadAfter.description;
          if (payloadAfter.start_at) updateData.start_at = payloadAfter.start_at;
          if (payloadAfter.end_at) updateData.end_at = payloadAfter.end_at;
          
          if (Object.keys(updateData).length > 0) {
            // 获取 before state
            const { data: event } = await supabase
              .from('events')
              .select('*')
              .eq('id', payloadAfter.event_id)
              .single();
            
            if (event) {
              // 更新 event
              const { error: updateError } = await supabase
                .from('events')
                .update(updateData)
                .eq('id', payloadAfter.event_id);
              
              if (updateError) {
                throw updateError;
              }
              
              // 写 audit log
              await supabase.rpc('log_audit', {
                p_action: 'approve_event_edit',
                p_entity_type: 'event',
                p_entity_id: payloadAfter.event_id,
                p_before_state: event,
                p_after_state: { ...event, ...updateData },
                p_metadata: { request_id: id, note },
              });
            }
          }
        }
        break;
      }
      
      default:
        // 其他类型暂不支持，但标记为已审批
        break;
    }
    
    // 更新 request 状态
    const { error: updateRequestError } = await supabase
      .from('requests')
      .update({
        status: 'approved',
        admin_note: note,
        decided_by: user.id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', id);
    
    if (updateRequestError) {
      throw updateRequestError;
    }
    
    // 写 audit log for request
    await supabase.rpc('log_audit', {
      p_action: 'approve',
      p_entity_type: 'request',
      p_entity_id: id,
      p_before_state: { status: 'pending' },
      p_after_state: { status: 'approved', admin_note: note },
      p_metadata: { note },
    });
    
    return NextResponse.json({
      success: true,
      data: {
        id,
        status: 'approved',
        message: 'Request approved successfully',
      },
    });
  } catch (error: any) {
    console.error('[ADMIN APPROVE API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
