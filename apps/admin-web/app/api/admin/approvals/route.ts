/**
 * GET /api/admin/approvals
 * Admin Approvals List API
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

export const GET = handlerWrapper(async (request: NextRequest): Promise<NextResponse> => {
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

    const { adminClient } = authResult;
    step = 'auth_ok';

    // STEP 2: 获取查询参数并严格校验
    step = 'parse_params';
    const searchParams = request.nextUrl.searchParams;
    let status = searchParams.get('status') || 'pending';
    
    // 严格校验 status
    const validStatuses = ['pending', 'approved', 'rejected', 'all'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Bad Request',
          code: 'INVALID_STATUS',
          message: `Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`,
          step,
        },
        { status: 400 }
      );
    }
    
    const query = searchParams.get('query') || '';
    step = 'params_ok';

    // ============================================================
    // 临时调试日志（定位数据源问题）
    // ============================================================
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    console.log('[ADMIN APPROVALS] ===== DEBUG START =====');
    console.log('[ADMIN APPROVALS] NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'MISSING');
    console.log('[ADMIN APPROVALS] Has SUPABASE_SERVICE_ROLE_KEY:', hasServiceRoleKey);
    console.log('[ADMIN APPROVALS] Used Service Role:', true); // adminClient 来自 requireAdmin，已经是 service role
    console.log('[ADMIN APPROVALS] Query Table:', 'event_change_requests');
    console.log('[ADMIN APPROVALS] Status Filter:', status);
    console.log('[ADMIN APPROVALS] ===== DEBUG END =====');

    // STEP 3: 查询 event_change_requests（使用 service role client 绕过 RLS）
    step = 'query_event_change_requests';
    
    // 先测试表是否存在：查询 count
    const { count: totalCount, error: countError } = await adminClient
      .from('event_change_requests')
      .select('*', { count: 'exact', head: true });
    
    console.log('[ADMIN APPROVALS] Table count check:', {
      totalCount,
      countError: countError ? {
        code: countError.code,
        message: countError.message,
        details: countError.details,
        hint: countError.hint,
      } : null,
    });

    // 查询带 status 过滤的记录，并 join merchant、event 和 venue
    let requestQuery = adminClient
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
        merchants:merchant_id (
          id,
          name
        ),
        events:event_id (
          id,
          title,
          start_at,
          venue_id,
          venues:venue_id (
            id,
            name
          )
        )
      `)
      .order('submitted_at', { ascending: false })
      .limit(50);

    // 严格过滤：必须使用 .eq('status', status)，禁止用 neq/in
    if (status && status !== 'all') {
      requestQuery = requestQuery.eq('status', status);
    }

    const { data: requests, error: requestsError } = await withTimeout(
      Promise.resolve(requestQuery),
      TIMEOUT_MS,
      'event_change_requests query'
    );

    // 详细日志：查询结果
    console.log('[ADMIN APPROVALS] Query result:', {
      rowsCount: requests?.length || 0,
      hasError: !!requestsError,
      error: requestsError ? {
        code: requestsError.code,
        message: requestsError.message,
        details: requestsError.details,
        hint: requestsError.hint,
      } : null,
      firstRowId: requests && requests.length > 0 ? requests[0].id : null,
      allIds: requests?.map((r: any) => r.id) || [],
    });

    if (requestsError) {
      console.error('[ADMIN APPROVALS] Query error:', {
        code: requestsError.code,
        message: requestsError.message,
        details: requestsError.details,
        hint: requestsError.hint,
      });
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Database Error',
          code: 'QUERY_ERROR',
          message: requestsError.message,
          step,
          debug: {
            table: 'event_change_requests',
            usedServiceRole: true,
            supabaseError: {
              code: requestsError.code,
              message: requestsError.message,
              details: requestsError.details,
              hint: requestsError.hint,
            },
          },
        },
        { status: 500 }
      );
    }

    step = 'requests_ok';

    // STEP 4: 查询所有状态的计数（用于 tab 显示）
    step = 'count_all_statuses';
    const { count: pendingCount } = await adminClient
      .from('event_change_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    
    const { count: approvedCount } = await adminClient
      .from('event_change_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved');
    
    const { count: rejectedCount } = await adminClient
      .from('event_change_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'rejected');

    // STEP 5: 格式化响应
    step = 'format_response';
    const approvals = (requests || []).map((req: any) => ({
      id: req.id,
      type: req.request_type || 'unknown',
      status: req.status,
      requestedBy: req.submitted_by,
      decidedBy: req.approved_by,
      createdAt: req.submitted_at,
      decidedAt: req.approved_at,
      note: req.rejection_reason,
      merchantId: req.merchant_id,
      merchant: req.merchants ? {
        id: req.merchants.id,
        name: req.merchants.name,
      } : null,
      event: req.events ? {
        id: req.events.id,
        title: req.events.title,
        start_at: req.events.start_at,
        venue_id: req.events.venue_id,
      } : null,
      venue: req.events?.venues ? {
        id: req.events.venues.id,
        name: req.events.venues.name,
      } : null,
      venueId: req.events?.venue_id || null,
      // payload_json contains the change request details
      payload: req.payload_json || {},
    }));

    // Debug 信息（包含详细日志）
    const firstId = requests && requests.length > 0 ? requests[0].id : null;
    const debug = {
      statusFilterApplied: status,
      rowCount: requests?.length || 0,
      firstId,
      usedServiceRole: true,
      table: 'event_change_requests',
      supabaseUrl: supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'MISSING',
      hasServiceRoleKey,
      totalTableCount: totalCount,
      allIds: requests?.map((r: any) => r.id) || [],
    };

    step = 'success';
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        approvals,
        counts: {
          pending: pendingCount || 0,
          approved: approvedCount || 0,
          rejected: rejectedCount || 0,
        },
      },
      step,
      debug,
    });

  } catch (error: any) {
    console.error('[ADMIN APPROVALS GET] Error:', {
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
