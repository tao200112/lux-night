/**
 * POST /api/admin/event-change-requests/[id]/reject
 * 管理员拒绝活动修改请求
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

    const body = await req.json();
    const { rejection_reason } = body;

    // 获取请求详情
    const { data: request, error: fetchError } = await adminClient
      .from('event_change_requests')
      .select('id, status')
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

    // 更新请求状态为 rejected
    const { error: rejectError } = await adminClient
      .from('event_change_requests')
      .update({
        status: 'rejected',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        rejected_reason: rejection_reason || 'Rejected by admin',
      })
      .eq('id', id);

    if (rejectError) {
      console.error('[ADMIN EVENT CHANGE REQUEST] Reject error:', rejectError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'REJECT_FAILED',
            message: 'Failed to reject request',
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Change request rejected successfully',
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
