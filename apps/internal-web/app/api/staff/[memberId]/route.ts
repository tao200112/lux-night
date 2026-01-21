/**
 * PATCH /api/staff/[memberId]
 * 更新员工状态（启用/禁用）
 */

import { NextRequest, NextResponse } from 'next/server';
import { updateStaffStatus } from '@/lib/data/internal/staff';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';
import { canManageMerchant } from '@/lib/internal/permissions';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    await requireInternalAuth();
    const { memberId } = await params;
    const body = await req.json();
    const { isActive } = body;

    if (typeof isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'isActive must be a boolean' },
        { status: 400 }
      );
    }

    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    // 检查权限
    const canManage = await canManageMerchant(workspace.merchantId);
    if (!canManage) {
      return NextResponse.json(
        { error: 'NO_ACCESS', message: 'Only owner or manager can update staff status' },
        { status: 403 }
      );
    }

    // 更新员工状态
    await updateStaffStatus(memberId, isActive);

    return NextResponse.json({
      success: true,
      memberId,
      isActive,
    });
  } catch (error: any) {
    console.error('Error updating staff:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'UPDATE_FAILED', message: error.message },
      { status: 500 }
    );
  }
}
