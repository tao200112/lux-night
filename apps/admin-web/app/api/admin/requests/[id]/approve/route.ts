/**
 * POST /api/admin/requests/[id]/approve
 * 审批申请（仅admin）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRequestById } from '@/lib/data/internal/requests';
import { isAdmin } from '@/lib/internal/permissions';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rl = await rateLimitOrResponse(req, rateLimitPolicies.sensitivePost, { userId: 'anon' });
    if ('response' in rl) return rl.response;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // 检查是否是admin
    const userIsAdmin = await isAdmin();
    if (!userIsAdmin) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Only admin can approve requests' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { adminNote } = body;

    // 获取申请详情
    const request = await getRequestById(id);
    if (!request) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Request not found' },
        { status: 404 }
      );
    }

    if (request.status !== 'pending') {
      return NextResponse.json(
        { error: 'INVALID_STATUS', message: 'Request is not pending' },
        { status: 400 }
      );
    }

    // TODO: 根据申请类型应用变更
    // - venue_edit: 更新venue信息
    // - new_event: 创建event
    // - price_change: 更新ticket_type价格
    // - inventory_change: 更新ticket_type库存

    // 更新申请状态
    const { error: updateError } = await supabase
      .from('requests')
      .update({
        status: 'approved',
        admin_note: adminNote || null,
        decided_by: user.id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    // 创建request_event记录
    await supabase
      .from('request_events')
      .insert({
        request_id: id,
        event_type: 'approved',
        before: request.payload,
        after: request.payload, // TODO: 应用变更后的数据
        created_by: user.id,
      });

    return NextResponse.json({
      success: true,
      requestId: id,
      status: 'approved',
    });
  } catch (error: any) {
    console.error('Error approving request:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'APPROVE_FAILED', message: error.message },
      { status: 500 }
    );
  }
}
