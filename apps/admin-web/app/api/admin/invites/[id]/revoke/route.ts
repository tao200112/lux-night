/**
 * POST /api/admin/invites/[id]/revoke
 * Admin Revoke Invite API
 * 撤销邀请码（支持通过 UUID 或 token 字符串）
 * 
 * 修复：合并了原来的 [id] 和 [code] 两个冲突的动态路由
 */

import {
  handlerWrapper,
  requireAdmin,
  withTimeout,
  type ApiResponse,
} from '@/lib/admin/api';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const TIMEOUT_MS = 10000;

// UUID 格式验证
const UUIDSchema = z.string().uuid();

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

    const { adminClient } = authResult;
    step = 'auth_ok';

    // STEP 2: 获取参数
    step = 'get_params';
    const { id: idParam } = await context.params;
    step = 'params_ok';

    // STEP 3: 判断是 UUID 还是 token 字符串
    step = 'detect_type';
    const isUUID = UUIDSchema.safeParse(idParam).success;
    const isToken = !isUUID;
    step = 'type_detected';

    let invite: any = null;

    if (isUUID) {
      // 通过 UUID 查询
      step = 'query_by_uuid';
      const { data, error } = await withTimeout(
        Promise.resolve(
          adminClient
            .from('invites')
            .select('id, used_count, max_uses, revoked_at, disabled, is_active')
            .eq('id', idParam)
            .maybeSingle()
        ),
        TIMEOUT_MS,
        'query invite by UUID'
      );

      if (error) {
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: 'Database Error',
            code: 'QUERY_ERROR',
            message: error.message,
            step,
          },
          { status: 500 }
        );
      }

      invite = data;
    } else {
      // 通过 token 查询
      step = 'query_by_token';
      const normalizedToken = idParam.toUpperCase().trim();

      const { data, error } = await withTimeout(
        Promise.resolve(
          adminClient
            .from('invites')
            .select('id, used_count, max_uses, revoked_at, disabled, is_active, code')
            .eq('code', normalizedToken)
            .maybeSingle()
        ),
        TIMEOUT_MS,
        'query invite by token'
      );

      if (error) {
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: 'Database Error',
            code: 'QUERY_ERROR',
            message: error.message,
            step,
          },
          { status: 500 }
        );
      }

      invite = data;
    }

    step = 'query_ok';

    // STEP 4: 检查邀请码是否存在
    if (!invite) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Not Found',
          code: 'NOT_FOUND',
          message: 'Invite not found',
          step,
        },
        { status: 404 }
      );
    }

    // STEP 5: 检查是否已撤销
    step = 'check_revoked';
    if (invite.revoked_at !== null || invite.disabled) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Conflict',
          code: 'ALREADY_REVOKED',
          message: 'Invite has already been revoked',
          step,
        },
        { status: 409 }
      );
    }

    // STEP 6: 撤销邀请码
    step = 'revoke_invite';
    const { data: updatedInvite, error: updateError } = await withTimeout(
      Promise.resolve(
        adminClient
          .from('invites')
          .update({
            revoked_at: new Date().toISOString(),
            disabled: true,
            is_active: false,
          })
          .eq('id', invite.id)
          .select()
          .single()
      ),
      TIMEOUT_MS,
      'update invite'
    );

    if (updateError || !updatedInvite) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Database Error',
          code: 'UPDATE_ERROR',
          message: updateError?.message || 'Failed to revoke invite',
          step,
        },
        { status: 500 }
      );
    }

    step = 'success';
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        id: updatedInvite.id,
        revokedAt: updatedInvite.revoked_at,
        message: 'Invite revoked successfully',
      },
      step,
    });

  } catch (error: any) {
    console.error('[ADMIN REVOKE INVITE] Error:', {
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
