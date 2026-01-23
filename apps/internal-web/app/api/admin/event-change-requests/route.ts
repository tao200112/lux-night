/**
 * GET /api/admin/event-change-requests
 * 管理员获取待审批的活动修改请求列表
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

export async function GET(req: NextRequest) {
  try {
    const { adminClient } = await requireAdmin();
    
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status') || 'pending';

    // 获取待审批请求，包含 event 和 merchant 信息
    const { data: requests, error: fetchError } = await adminClient
      .from('event_change_requests')
      .select(`
        id,
        merchant_id,
        event_id,
        request_type,
        status,
        payload_json,
        submitted_by,
        submitted_at,
        approved_by,
        approved_at,
        rejection_reason,
        events:event_id (
          id,
          title,
          start_at
        ),
        merchants:merchant_id (
          id,
          name
        ),
        submitted_user:submitted_by (
          id,
          email
        )
      `)
      .eq('status', status)
      .order('submitted_at', { ascending: false });

    if (fetchError) {
      console.error('[ADMIN EVENT CHANGE REQUEST] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'FETCH_FAILED', message: 'Failed to fetch change requests' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      requests: requests || [],
      count: requests?.length || 0,
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
