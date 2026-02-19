/**
 * POST /api/admin/approvals/[id]/reject
 * Reject a merchant change request (uses merchant_change_requests, not event_change_requests)
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
    step = 'auth_check';
    const authResult = await withTimeout(requireAdmin(request), TIMEOUT_MS, 'requireAdmin');

    if ('status' in authResult) {
      return authResult.response;
    }

    const { user, adminClient } = authResult;
    step = 'params';
    const { id: requestId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const note = body.note || body.rejection_reason || 'Rejected by admin';

    step = 'fetch';
    const { data: changeRequest, error: fetchError } = await adminClient
      .from('merchant_change_requests')
      .select('id, status')
      .eq('id', requestId)
      .single();

    if (fetchError || !changeRequest) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Not Found', code: 'NOT_FOUND', message: 'Change request not found', step },
        { status: 404 }
      );
    }

    if (changeRequest.status !== 'pending') {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Conflict', code: 'INVALID_STATUS', message: `Request is already ${changeRequest.status}`, step },
        { status: 409 }
      );
    }

    step = 'update';
    const { data: updatedRequest, error: updateError } = await adminClient
      .from('merchant_change_requests')
      .update({
        status: 'rejected',
        review_note: note,
        reviewed_by_admin: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select()
      .single();

    if (updateError) {
      console.error('[ADMIN REJECT] Update error:', updateError);
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Database Error', code: 'UPDATE_ERROR', message: updateError.message, step },
        { status: 500 }
      );
    }

    if (!updatedRequest) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Conflict', code: 'ALREADY_PROCESSED', message: 'Request has already been processed', step },
        { status: 409 }
      );
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { message: 'Request rejected successfully' },
      step: 'success',
    });
  } catch (error: any) {
    console.error('[ADMIN REJECT] Error:', error);
    if (error.message?.includes('[TIMEOUT]')) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'Timeout', code: 'TIMEOUT', message: error.message, step }, { status: 504 });
    }
    return NextResponse.json<ApiResponse>({ ok: false, error: 'Internal Error', code: 'INTERNAL_ERROR', message: error.message, step }, { status: 500 });
  }
});
