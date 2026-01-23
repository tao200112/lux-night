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
    let requestType = request.request_type;

    // 兼容旧值：映射到新值
    if (requestType === 'poster') requestType = 'poster_change';
    if (requestType === 'price') requestType = 'price_change';
    if (requestType === 'inventory') requestType = 'inventory_change';

    // 根据 request_type 应用不同的更新逻辑
    if (requestType === 'poster_change' || requestType === 'poster') {
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
    } else if (requestType === 'price_change' || requestType === 'price') {
      // 更新 ticket_types.price_cents
      // 兼容 payload 格式：new_price (cents) 或 prices 数组
      let priceUpdates: Array<{ ticket_type_id: string; new_price: number }> = [];

      if (payload.ticket_type_id && payload.new_price !== undefined) {
        // 单个票种价格变更
        priceUpdates.push({
          ticket_type_id: payload.ticket_type_id,
          new_price: typeof payload.new_price === 'number' ? payload.new_price : Math.round(parseFloat(payload.new_price) * 100),
        });
      } else if (Array.isArray(payload.prices)) {
        // 多个票种价格变更
        priceUpdates = payload.prices.map((p: any) => ({
          ticket_type_id: p.ticket_type_id,
          new_price: typeof p.new_price === 'number' ? p.new_price : Math.round(parseFloat(p.new_price) * 100),
        }));
      } else {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'ticket_type_id and new_price (or prices array) are required for price change',
            },
          },
          { status: 400 }
        );
      }

      // 批量更新票种价格
      for (const priceUpdate of priceUpdates) {
        const { error: updateError } = await adminClient
          .from('ticket_types')
          .update({
            price_cents: priceUpdate.new_price,
            updated_at: new Date().toISOString(),
          })
          .eq('id', priceUpdate.ticket_type_id)
          .eq('event_id', request.event_id);

        if (updateError) {
          console.error('[ADMIN EVENT CHANGE REQUEST] Update price error:', updateError);
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'UPDATE_FAILED',
                message: `Failed to update ticket price for ${priceUpdate.ticket_type_id}`,
              },
            },
            { status: 500 }
          );
        }
      }
    } else if (requestType === 'inventory_change' || requestType === 'inventory') {
      // 更新 ticket_types.quantity_available
      // 兼容 payload 格式：new_capacity 或 new_inventory 或 quantities 数组
      let inventoryUpdates: Array<{ ticket_type_id: string; new_capacity: number }> = [];

      if (payload.ticket_type_id && (payload.new_capacity !== undefined || payload.new_inventory !== undefined)) {
        // 单个票种库存变更
        inventoryUpdates.push({
          ticket_type_id: payload.ticket_type_id,
          new_capacity: payload.new_capacity !== undefined ? payload.new_capacity : payload.new_inventory,
        });
      } else if (Array.isArray(payload.quantities)) {
        // 多个票种库存变更
        inventoryUpdates = payload.quantities.map((q: any) => ({
          ticket_type_id: q.ticket_type_id,
          new_capacity: q.new_capacity !== undefined ? q.new_capacity : q.new_inventory,
        }));
      } else {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'ticket_type_id and new_capacity (or quantities array) are required for inventory change',
            },
          },
          { status: 400 }
        );
      }

      // 批量更新票种库存
      for (const invUpdate of inventoryUpdates) {
        // 计算新的 quantity_available
        // 需要先获取当前的 quantity_sold
        const { data: ticketType, error: fetchTicketError } = await adminClient
          .from('ticket_types')
          .select('quantity_sold, quantity_available')
          .eq('id', invUpdate.ticket_type_id)
          .eq('event_id', request.event_id)
          .single();

        if (fetchTicketError || !ticketType) {
          console.error('[ADMIN EVENT CHANGE REQUEST] Fetch ticket type error:', fetchTicketError);
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'NOT_FOUND',
                message: `Ticket type not found: ${invUpdate.ticket_type_id}`,
              },
            },
            { status: 404 }
          );
        }

        // 新的 quantity_available = new_capacity - quantity_sold
        const newQuantityAvailable = Math.max(0, invUpdate.new_capacity - (ticketType.quantity_sold || 0));

        const { error: updateError } = await adminClient
          .from('ticket_types')
          .update({
            quantity_available: newQuantityAvailable,
            updated_at: new Date().toISOString(),
          })
          .eq('id', invUpdate.ticket_type_id)
          .eq('event_id', request.event_id);

        if (updateError) {
          console.error('[ADMIN EVENT CHANGE REQUEST] Update inventory error:', updateError);
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'UPDATE_FAILED',
                message: `Failed to update ticket inventory for ${invUpdate.ticket_type_id}`,
              },
            },
            { status: 500 }
          );
        }
      }
    } else if (requestType === 'event_edit' || requestType === 'general') {
      // 通用事件编辑：将 payload_json 的字段 patch 到 events 表
      const allowedFields = [
        'title', 'description', 'start_at', 'end_at', 'poster_url',
        'age_policy', 'refund_policy', 'status'
      ];
      
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      // 只更新 payload 中允许的字段
      for (const field of allowedFields) {
        if (payload[field] !== undefined) {
          updateData[field] = payload[field];
        }
      }

      // 如果没有可更新的字段，返回错误
      if (Object.keys(updateData).length === 1) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'No valid fields to update in payload',
            },
          },
          { status: 400 }
        );
      }

      const { error: updateError } = await adminClient
        .from('events')
        .update(updateData)
        .eq('id', request.event_id)
        .eq('merchant_id', request.merchant_id);

      if (updateError) {
        console.error('[ADMIN EVENT CHANGE REQUEST] Update event error:', updateError);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'UPDATE_FAILED',
              message: 'Failed to update event',
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
