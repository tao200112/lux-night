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
    step = 'params_ok';

    // STEP 3: 读取请求体
    step = 'parse_body';
    const body = await request.json().catch(() => ({}));
    const { note } = body;
    step = 'body_ok';

    // STEP 4: 更新 request 状态
    step = 'update_request';
    const { data: updatedRequest, error: updateError } = await withTimeout(
      Promise.resolve(
        adminClient
          .from('requests')
          .update({
            status: 'rejected',
            decided_at: new Date().toISOString(),
            admin_note: note || null,
          })
          .eq('id', id)
          .select()
          .single()
      ),
      TIMEOUT_MS,
      'update request'
    );

    if (updateError) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Database Error',
          code: 'UPDATE_ERROR',
          message: updateError.message,
          step,
        },
        { status: 500 }
      );
    }

    step = 'success';
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        request: updatedRequest,
        message: 'Request rejected successfully',
      },
      step,
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
