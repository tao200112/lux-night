/**
 * POST /api/internal/invites/create
 * 创建邀请码（仅owner/manager）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createInvite } from '@/lib/data/internal/invites';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';
import { canManageMerchant } from '@/lib/internal/permissions';

export async function POST(req: NextRequest) {
  try {
    const internalUser = await requireInternalAuth();
    const body = await req.json();
    const { intendedRole, maxUses, expiresAt, venueId } = body;

    if (!intendedRole || !maxUses || !expiresAt) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'intendedRole, maxUses, and expiresAt are required' },
        { status: 400 }
      );
    }

    // 获取当前workspace
    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    // 检查权限（必须是owner或manager）
    const canManage = await canManageMerchant(workspace.merchantId);
    if (!canManage) {
      return NextResponse.json(
        { error: 'NO_ACCESS', message: 'Only owner or manager can create invites' },
        { status: 403 }
      );
    }

    // 创建邀请码
    const invite = await createInvite(
      workspace.merchantId,
      intendedRole,
      maxUses,
      expiresAt,
      venueId
    );

    return NextResponse.json({
      invite,
    });
  } catch (error: any) {
    console.error('Error creating invite:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'CREATE_FAILED', message: error.message },
      { status: 500 }
    );
  }
}
