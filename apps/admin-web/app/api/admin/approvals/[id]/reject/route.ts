/**
 * POST /api/admin/approvals/[id]/reject
 * Reject a request
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

    // STEP 3: 读取请求体
    step = 'parse_body';
    const body = await request.json().catch(() => ({}));
    const { note } = body;
    const rejectionReason = note || 'Rejected by admin';
    step = 'body_ok';

    console.log('[ADMIN REJECT] ===== DEBUG START =====');
    console.log('[ADMIN REJECT] requestId:', requestId);
    console.log('[ADMIN REJECT] adminUserId:', adminUserId);
    console.log('[ADMIN REJECT] rejectionReason:', rejectionReason);
    console.log('[ADMIN REJECT] ===== DEBUG END =====');

    // STEP 4: 更新 event_change_requests 状态
    step = 'update_change_request';
    const { data: updatedRequest, error: updateError } = await adminClient
      .from('event_change_requests')
      .update({
        status: 'rejected',
        rejection_reason: rejectionReason,
        approved_by: adminUserId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'pending') // 确保只更新 pending 状态的记录
      .select()
      .single();

    if (updateError) {
      console.error('[ADMIN REJECT] Update error:', {
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
      });
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Database Error',
          code: 'UPDATE_ERROR',
          message: updateError.message,
          step,
          debug: {
            requestId,
            supabaseError: {
              code: updateError.code,
              message: updateError.message,
              details: updateError.details,
              hint: updateError.hint,
            },
          },
        },
        { status: 500 }
      );
    }

    // 如果影响行数为 0，说明记录不存在或已被处理
    if (!updatedRequest) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Conflict',
          code: 'ALREADY_PROCESSED',
          message: 'Request has already been processed or does not exist',
          step,
          debug: {
            requestId,
          },
        },
        { status: 409 }
      );
    }

    console.log('[ADMIN REJECT] Successfully rejected change request:', {
      requestId,
      updatedStatus: updatedRequest.status,
    });

    step = 'success';
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        message: 'Request rejected successfully',
      },
      step,
      debug: {
        requestId,
      },
    });

  } catch (error: any) {
    console.error('[ADMIN REJECT] Error:', {
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
