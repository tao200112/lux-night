/**
 * POST /api/admin/approvals/[id]/approve
 * Approve a request
 * 
 * 强制修复版：确保所有分支都返回响应，绝不 pending
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  handlerWrapper,
  requireAdmin,
  withTimeout,
  type ApiResponse,
} from '@/lib/admin/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 10000;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = handlerWrapper(async (
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse> => {
  let step = 'init';

  try {
    // STEP 1: 权限检查
    step = 'auth_check';
    const authResult = await withTimeout(
      requireAdmin(request),
      TIMEOUT_MS,
      'requireAdmin'
    );

    if ('status' in authResult) {
      return authResult.response;
    }

    const { user, adminClient } = authResult;
    step = 'auth_ok';

    // STEP 2: 获取 request ID
    step = 'get_params';
    const { id } = await context.params;
    const requestId = id;
    const adminUserId = user.id;
    step = 'params_ok';

    console.log('[ADMIN APPROVE] ===== DEBUG START =====');
    console.log('[ADMIN APPROVE] requestId:', requestId);
    console.log('[ADMIN APPROVE] adminUserId:', adminUserId);
    console.log('[ADMIN APPROVE] ===== DEBUG END =====');

    // STEP 3: 读取 change request
    step = 'fetch_change_request';
    const { data: changeRequest, error: fetchError } = await adminClient
      .from('event_change_requests')
      .select('id, event_id, merchant_id, status, payload_json, request_type')
      .eq('id', requestId)
      .single();

    if (fetchError || !changeRequest) {
      console.error('[ADMIN APPROVE] Fetch error:', {
        code: fetchError?.code,
        message: fetchError?.message,
        details: fetchError?.details,
        hint: fetchError?.hint,
      });
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Not Found',
          code: 'NOT_FOUND',
          message: 'Change request not found',
          step,
          debug: {
            requestId,
            fetchError: fetchError ? {
              code: fetchError.code,
              message: fetchError.message,
              details: fetchError.details,
              hint: fetchError.hint,
            } : null,
          },
        },
        { status: 404 }
      );
    }

    console.log('[ADMIN APPROVE] Fetched change request:', {
      id: changeRequest.id,
      event_id: changeRequest.event_id,
      status: changeRequest.status,
      request_type: changeRequest.request_type,
      payload_keys: changeRequest.payload_json ? Object.keys(changeRequest.payload_json) : [],
    });

    // STEP 4: 检查状态（幂等处理）
    step = 'check_status';
    if (changeRequest.status === 'approved') {
      // 已批准：返回 200（幂等）
      console.log('[ADMIN APPROVE] Request already approved:', requestId);
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: {
          message: 'Request was already approved',
          already: true,
        },
        step,
        debug: {
          requestId,
          currentStatus: changeRequest.status,
        },
      });
    }
    
    if (changeRequest.status === 'rejected') {
      // 已拒绝：返回 409
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Conflict',
          code: 'INVALID_STATUS',
          message: `Request is already ${changeRequest.status}`,
          step,
          debug: {
            requestId,
            currentStatus: changeRequest.status,
          },
        },
        { status: 409 }
      );
    }
    
    if (changeRequest.status !== 'pending') {
      // 其他未知状态：返回 409
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Conflict',
          code: 'INVALID_STATUS',
          message: `Request is already ${changeRequest.status}`,
          step,
          debug: {
            requestId,
            currentStatus: changeRequest.status,
          },
        },
        { status: 409 }
      );
    }

    // STEP 5: 根据 request_type 应用变更
    step = 'apply_changes';
    const payload = changeRequest.payload_json as any;
    const requestType = changeRequest.request_type;

    // 兼容旧值映射
    let normalizedRequestType = requestType;
    if (requestType === 'poster') normalizedRequestType = 'poster_change';
    if (requestType === 'price') normalizedRequestType = 'price_change';
    if (requestType === 'inventory') normalizedRequestType = 'inventory_change';

    if (normalizedRequestType === 'poster_change' || normalizedRequestType === 'poster') {
      // 更新 events.poster_url
      if (payload.poster_url) {
        const { error: updateEventError } = await adminClient
          .from('events')
          .update({
            poster_url: payload.poster_url,
            updated_at: new Date().toISOString(),
          })
          .eq('id', changeRequest.event_id)
          .eq('merchant_id', changeRequest.merchant_id);

        if (updateEventError) {
          console.error('[ADMIN APPROVE] Update poster error:', {
            code: updateEventError.code,
            message: updateEventError.message,
            details: updateEventError.details,
            hint: updateEventError.hint,
          });
          return NextResponse.json<ApiResponse>(
            {
              ok: false,
              error: 'Database Error',
              code: 'UPDATE_EVENTS_ERROR',
              message: 'Failed to update event poster',
              step,
              debug: {
                requestId,
                eventId: changeRequest.event_id,
                requestType: normalizedRequestType,
                supabaseError: {
                  code: updateEventError.code,
                  message: updateEventError.message,
                  details: updateEventError.details,
                  hint: updateEventError.hint,
                },
              },
            },
            { status: 500 }
          );
        }
      }
    } else if (normalizedRequestType === 'price_change' || normalizedRequestType === 'price') {
      // 更新 ticket_types.price_cents
      if (payload.ticket_type_id && payload.new_price !== undefined) {
        const newPrice = typeof payload.new_price === 'number' ? payload.new_price : Math.round(parseFloat(payload.new_price) * 100);
        
        const { error: updatePriceError } = await adminClient
          .from('ticket_types')
          .update({
            price_cents: newPrice,
            updated_at: new Date().toISOString(),
          })
          .eq('id', payload.ticket_type_id)
          .eq('event_id', changeRequest.event_id);

        if (updatePriceError) {
          console.error('[ADMIN APPROVE] Update price error:', {
            code: updatePriceError.code,
            message: updatePriceError.message,
            details: updatePriceError.details,
            hint: updatePriceError.hint,
          });
          return NextResponse.json<ApiResponse>(
            {
              ok: false,
              error: 'Database Error',
              code: 'UPDATE_TICKET_PRICE_ERROR',
              message: 'Failed to update ticket price',
              step,
              debug: {
                requestId,
                ticketTypeId: payload.ticket_type_id,
                newPrice,
                supabaseError: {
                  code: updatePriceError.code,
                  message: updatePriceError.message,
                  details: updatePriceError.details,
                  hint: updatePriceError.hint,
                },
              },
            },
            { status: 500 }
          );
        }
      }
    } else if (normalizedRequestType === 'inventory_change' || normalizedRequestType === 'inventory') {
      // 更新 ticket_types.quantity_available
      if (payload.ticket_type_id && (payload.new_capacity !== undefined || payload.new_inventory !== undefined)) {
        const newCapacity = payload.new_capacity !== undefined ? payload.new_capacity : payload.new_inventory;
        
        // 先获取当前的 quantity_sold
        const { data: ticketType, error: fetchTicketError } = await adminClient
          .from('ticket_types')
          .select('quantity_sold, quantity_available')
          .eq('id', payload.ticket_type_id)
          .eq('event_id', changeRequest.event_id)
          .single();

        if (fetchTicketError || !ticketType) {
          console.error('[ADMIN APPROVE] Fetch ticket type error:', {
            code: fetchTicketError?.code,
            message: fetchTicketError?.message,
          });
          return NextResponse.json<ApiResponse>(
            {
              ok: false,
              error: 'Not Found',
              code: 'TICKET_TYPE_NOT_FOUND',
              message: 'Ticket type not found',
              step,
              debug: {
                requestId,
                ticketTypeId: payload.ticket_type_id,
              },
            },
            { status: 404 }
          );
        }

        // 新的 quantity_available = new_capacity - quantity_sold
        const newQuantityAvailable = Math.max(0, newCapacity - (ticketType.quantity_sold || 0));

        const { error: updateInventoryError } = await adminClient
          .from('ticket_types')
          .update({
            quantity_available: newQuantityAvailable,
            updated_at: new Date().toISOString(),
          })
          .eq('id', payload.ticket_type_id)
          .eq('event_id', changeRequest.event_id);

        if (updateInventoryError) {
          console.error('[ADMIN APPROVE] Update inventory error:', {
            code: updateInventoryError.code,
            message: updateInventoryError.message,
            details: updateInventoryError.details,
            hint: updateInventoryError.hint,
          });
          return NextResponse.json<ApiResponse>(
            {
              ok: false,
              error: 'Database Error',
              code: 'UPDATE_TICKET_INVENTORY_ERROR',
              message: 'Failed to update ticket inventory',
              step,
              debug: {
                requestId,
                ticketTypeId: payload.ticket_type_id,
                newQuantityAvailable,
                supabaseError: {
                  code: updateInventoryError.code,
                  message: updateInventoryError.message,
                  details: updateInventoryError.details,
                  hint: updateInventoryError.hint,
                },
              },
            },
            { status: 500 }
          );
        }
      }
    } else if (normalizedRequestType === 'event_edit' || normalizedRequestType === 'general') {
      // 通用事件编辑：更新 events 表字段
      const allowedFields = ['title', 'description', 'start_at', 'end_at', 'poster_url', 'age_policy', 'refund_policy'];
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      // 只更新 payload 中允许的字段，且不为 null 的字段
      for (const field of allowedFields) {
        if (payload[field] !== undefined && payload[field] !== null) {
          updateData[field] = payload[field];
        }
      }

      // 如果有可更新的字段，更新 events 表
      if (Object.keys(updateData).length > 1) {
        const { error: updateEventError } = await adminClient
          .from('events')
          .update(updateData)
          .eq('id', changeRequest.event_id)
          .eq('merchant_id', changeRequest.merchant_id);

        if (updateEventError) {
          console.error('[ADMIN APPROVE] Update events error:', {
            code: updateEventError.code,
            message: updateEventError.message,
            details: updateEventError.details,
            hint: updateEventError.hint,
          });
          return NextResponse.json<ApiResponse>(
            {
              ok: false,
              error: 'Database Error',
              code: 'UPDATE_EVENTS_ERROR',
              message: 'Failed to update event',
              step,
              debug: {
                requestId,
                eventId: changeRequest.event_id,
                updateKeys: Object.keys(updateData),
                supabaseError: {
                  code: updateEventError.code,
                  message: updateEventError.message,
                  details: updateEventError.details,
                  hint: updateEventError.hint,
                },
              },
            },
            { status: 500 }
          );
        }
      }
    }

    console.log('[ADMIN APPROVE] Applied changes:', {
      requestType: normalizedRequestType,
      eventId: changeRequest.event_id,
    });

    // STEP 6: 更新 event_change_requests 状态
    step = 'update_change_request';
    const { error: updateRequestError } = await adminClient
      .from('event_change_requests')
      .update({
        status: 'approved',
        approved_by: adminUserId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'pending'); // 确保只更新 pending 状态的记录

    if (updateRequestError) {
      console.error('[ADMIN APPROVE] Update change request error:', {
        code: updateRequestError.code,
        message: updateRequestError.message,
        details: updateRequestError.details,
        hint: updateRequestError.hint,
      });
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Database Error',
          code: 'UPDATE_CHANGE_REQUEST_ERROR',
          message: 'Failed to update change request status',
          step,
          debug: {
            requestId,
            supabaseError: {
              code: updateRequestError.code,
              message: updateRequestError.message,
              details: updateRequestError.details,
              hint: updateRequestError.hint,
            },
          },
        },
        { status: 500 }
      );
    }

    console.log('[ADMIN APPROVE] Successfully approved change request:', requestId);

    step = 'success';
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        message: 'Request approved successfully',
      },
      step,
      debug: {
        requestId,
        eventId: changeRequest.event_id,
      },
    });

  } catch (error: any) {
    console.error('[ADMIN APPROVE] Error:', {
      step,
      error: error.message,
      stack: error.stack,
    });

    if (error.message?.includes('[TIMEOUT]')) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Request Timeout',
          code: 'TIMEOUT',
          message: error.message,
          step,
        },
        { status: 504 }
      );
    }

    return NextResponse.json<ApiResponse>(
      {
        ok: false,
        error: 'Internal Server Error',
        code: 'INTERNAL_ERROR',
        message: error.message || 'Unexpected error',
        step,
      },
      { status: 500 }
    );
  }
});
