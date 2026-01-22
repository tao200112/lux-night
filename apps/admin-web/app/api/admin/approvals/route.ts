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

    // STEP 2: 获取查询参数
    step = 'parse_params';
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'pending';
    const query = searchParams.get('query') || '';
    step = 'params_ok';

    // STEP 3: 查询 Requests
    step = 'query_requests';
    let requestQuery = adminClient
      .from('requests')
      .select(`
        id,
        type,
        status,
        payload_before,
        payload_after,
        admin_note,
        requested_by,
        created_at,
        decided_at,
        merchant_id,
        venue_id,
        event_id
      `)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      requestQuery = requestQuery.eq('status', status);
    }

    const { data: requests, error: requestsError } = await withTimeout(
      Promise.resolve(requestQuery),
      TIMEOUT_MS,
      'requests query'
    );

    if (requestsError) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Database Error',
          code: 'QUERY_ERROR',
          message: requestsError.message,
          step,
        },
        { status: 500 }
      );
    }

    step = 'requests_ok';

    // STEP 4: 格式化响应
    step = 'format_response';
    const approvals = (requests || []).map((req: any) => ({
      id: req.id,
      type: req.type,
      status: req.status,
      requestedBy: req.requested_by,
      createdAt: req.created_at,
      decidedAt: req.decided_at,
      note: req.admin_note,
      merchantId: req.merchant_id,
      venueId: req.venue_id,
      eventId: req.event_id,
      payloadBefore: req.payload_before,
      payloadAfter: req.payload_after,
    }));

    step = 'success';
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        approvals,
      },
      step,
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
