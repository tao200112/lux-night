/**
 * GET /api/internal/staff
 * 获取员工列表
 * PATCH /api/internal/staff/:member_id
 * 更新员工状态
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStaffMembers, updateStaffStatus } from '@/lib/data/internal/staff';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';
import { canManageMerchant } from '@/lib/internal/permissions';

export async function GET(req: NextRequest) {
  try {
    await requireInternalAuth();
    const workspace = await getActiveWorkspace();

    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    const staff = await getStaffMembers(workspace.merchantId);

    return NextResponse.json({
      staff,
      count: staff.length,
    });
  } catch (error: any) {
    console.error('Error getting staff:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'FETCH_FAILED', message: error.message },
      { status: 500 }
    );
  }
}
