/**
 * GET /api/staff/[memberId] - 获取员工详情
 * PATCH /api/staff/[memberId] - 更新员工状态/名字
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStaffMemberById, updateStaffStatus } from '@/lib/data/internal/staff';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';
import { canManageMerchant } from '@/lib/internal/permissions';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    await requireInternalAuth();
    const { memberId } = await params;
    const workspace = await getActiveWorkspace();

    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    const member = await getStaffMemberById(memberId, workspace.merchantId);
    if (!member) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Staff member not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ member });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'FETCH_FAILED', message: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    await requireInternalAuth();
    const { memberId } = await params;
    const body = await req.json();
    const { isActive, displayName } = body;

    const updates: { isActive?: boolean; displayName?: string } = {};
    if (typeof isActive === 'boolean') {
      updates.isActive = isActive;
    }
    if (typeof displayName === 'string') {
      updates.displayName = displayName;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Provide isActive and/or displayName' },
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

    // 更新员工状态/名字
    await updateStaffStatus(memberId, updates);

    return NextResponse.json({
      success: true,
      memberId,
      ...updates,
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
