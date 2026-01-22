/**
 * POST /api/admin/event-change-requests/[id]/approve
 * 管理员批准活动修改请求并应用到 events 表
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// 检查是否为管理员
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('UNAUTHORIZED');
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SERVER_CONFIG_ERROR');
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { data: adminUser } = await adminClient
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!adminUser) {
    throw new Error('FORBIDDEN');
  }

  return { user, adminClient };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, adminClient } = await requireAdmin();
    const { id } = await params;

    // 获取请求详情
    const { data: request, error: fetchError } = await adminClient
      .from('event_change_requests')
      .select('id, event_id, merchant_id, request_type, status, payload_json')
      .eq('id', id)
      .single();

    if (fetchError || !request) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Change request not found',
          },
        },
        { status: 404 }
      );
    }

    if (request.status !== 'pending') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: `Request is already ${request.status}`,
          },
        },
        { status: 400 }
      );
    }

    const payload = request.payload_json as any;
    const requestType = request.request_type;

    // 根据 request_type 应用不同的更新逻辑
    if (requestType === 'poster') {
      // 更新 events.poster_url
      const { error: updateError } = await adminClient
        .from('events')
        .update({
          poster_url: payload.poster_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.event_id)
        .eq('merchant_id', request.merchant_id);

      if (updateError) {
        console.error('[ADMIN EVENT CHANGE REQUEST] Update poster error:', updateError);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'UPDATE_FAILED',
              message: 'Failed to update event poster',
            },
          },
          { status: 500 }
        );
      }
    } else if (requestType === 'price') {
      // 更新 ticket_types.price_cents
      if (!payload.ticket_type_id || payload.new_price === undefined) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'ticket_type_id and new_price are required for price change',
            },
          },
          { status: 400 }
        );
      }

      const { error: updateError } = await adminClient
        .from('ticket_types')
        .update({
          price_cents: payload.new_price,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.ticket_type_id)
        .eq('event_id', request.event_id);

      if (updateError) {
        console.error('[ADMIN EVENT CHANGE REQUEST] Update price error:', updateError);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'UPDATE_FAILED',
              message: 'Failed to update ticket price',
            },
          },
          { status: 500 }
        );
      }
    } else if (requestType === 'inventory') {
      // 更新 ticket_types.quantity_available
      if (!payload.ticket_type_id || payload.new_capacity === undefined) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'ticket_type_id and new_capacity are required for inventory change',
            },
          },
          { status: 400 }
        );
      }

      // 计算新的 quantity_available
      // 需要先获取当前的 quantity_sold
      const { data: ticketType, error: fetchTicketError } = await adminClient
        .from('ticket_types')
        .select('quantity_sold, quantity_available')
        .eq('id', payload.ticket_type_id)
        .eq('event_id', request.event_id)
        .single();

      if (fetchTicketError || !ticketType) {
        console.error('[ADMIN EVENT CHANGE REQUEST] Fetch ticket type error:', fetchTicketError);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Ticket type not found',
            },
          },
          { status: 404 }
        );
      }

      // 新的 quantity_available = new_capacity - quantity_sold
      const newQuantityAvailable = Math.max(0, payload.new_capacity - (ticketType.quantity_sold || 0));

      const { error: updateError } = await adminClient
        .from('ticket_types')
        .update({
          quantity_available: newQuantityAvailable,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.ticket_type_id)
        .eq('event_id', request.event_id);

      if (updateError) {
        console.error('[ADMIN EVENT CHANGE REQUEST] Update inventory error:', updateError);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'UPDATE_FAILED',
              message: 'Failed to update ticket inventory',
            },
          },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST_TYPE',
            message: `Unknown request_type: ${requestType}`,
          },
        },
        { status: 400 }
      );
    }

    // 更新请求状态为 approved
    const { error: approveError } = await adminClient
      .from('event_change_requests')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (approveError) {
      console.error('[ADMIN EVENT CHANGE REQUEST] Approve error:', approveError);
      // 注意：这里数据已经更新了，但请求状态更新失败
      // 可以考虑回滚或记录日志
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'APPROVE_FAILED',
            message: 'Data updated but failed to update request status',
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Change request approved and applied successfully',
    });

  } catch (error: any) {
    console.error('[ADMIN EVENT CHANGE REQUEST] Unexpected error:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Unauthorized',
          },
        },
        { status: 401 }
      );
    }

    if (error.message === 'FORBIDDEN') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
          },
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error.message || 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}
