/**
 * GET /api/internal/me
 * 获取当前用户的内部端信息
 */

import { NextRequest, NextResponse } from 'next/server';
import { getInternalUser } from '@/lib/internal/auth';

export async function GET(req: NextRequest) {
  try {
    const internalUser = await getInternalUser();

    if (!internalUser) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: {
        id: internalUser.user.id,
        email: internalUser.user.email,
      },
      memberships: internalUser.memberships,
      defaultWorkspace: internalUser.defaultWorkspace,
    });
  } catch (error: any) {
    console.error('Error in /api/internal/me:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
