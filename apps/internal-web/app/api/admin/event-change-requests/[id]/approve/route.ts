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
      .select('id, event_id, merchant_id, status, payload_json')
      .eq('id', id)
      .single();

    if (fetchError || !request) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Change request not found' },
        { status: 404 }
      );
    }

    if (request.status !== 'pending') {
      return NextResponse.json(
        { error: 'INVALID_STATUS', message: `Request is already ${request.status}` },
        { status: 400 }
      );
    }

    // 事务化更新 events 表
    const payload = request.payload_json as any;

    const { error: updateError } = await adminClient
      .from('events')
      .update({
        title: payload.title,
        description: payload.description,
        start_at: payload.start_at,
        end_at: payload.end_at,
        poster_url: payload.poster_url,
        age_policy: payload.age_policy,
        refund_policy: payload.refund_policy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.event_id)
      .eq('merchant_id', request.merchant_id);

    if (updateError) {
      console.error('[ADMIN EVENT CHANGE REQUEST] Update event error:', updateError);
      return NextResponse.json(
        { error: 'UPDATE_FAILED', message: 'Failed to update event' },
        { status: 500 }
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
      // 注意：这里 events 已经更新了，但请求状态更新失败
      // 可以考虑回滚或记录日志
      return NextResponse.json(
        { error: 'APPROVE_FAILED', message: 'Event updated but failed to update request status' },
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
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    if (error.message === 'FORBIDDEN') {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Admin access required' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
