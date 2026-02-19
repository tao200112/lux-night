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

    // 获取待审批请求 (merchant_change_requests)，包含 event 和 merchant 信息
    const { data: rawRequests, error: fetchError } = await adminClient
      .from('merchant_change_requests')
      .select(`
        id,
        merchant_id,
        event_id,
        request_type,
        status,
        payload,
        submitted_by,
        created_at,
        reviewed_by_admin,
        reviewed_at,
        review_note,
        updated_at,
        events_v2:event_id (
          id,
          title,
          poster_url
        ),
        merchants:merchant_id (
          id,
          name
        )
      `)
      .eq('status', status)
      .order('created_at', { ascending: false });

    // 映射为前端期望的格式 (events, merchants, payload_json, submitted_at, approved_at, rejection_reason)
    const requests = (rawRequests || []).map((r: any) => ({
      ...r,
      events: r.events_v2,
      payload_json: r.payload,
      submitted_at: r.created_at,
      approved_at: r.reviewed_at,
      rejection_reason: r.review_note,
      merchants: r.merchants,
      submitted_user: r.submitted_by ? { id: r.submitted_by } : null,
    }));

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
