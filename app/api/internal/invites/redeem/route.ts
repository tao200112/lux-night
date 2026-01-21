/**
 * POST /api/internal/invites/redeem
 * 兑换邀请码
 */

import { NextRequest, NextResponse } from 'next/server';
import { redeemInvite } from '@/lib/data/internal/invites';
import { getInternalUser } from '@/lib/internal/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Token is required' },
        { status: 400 }
      );
    }

    // 兑换邀请码
    const result = await redeemInvite(token);

    // 重新获取用户信息（包含新的membership）
    const internalUser = await getInternalUser();

    return NextResponse.json({
      success: true,
      workspace: result,
      memberships: internalUser?.memberships || [],
    });
  } catch (error: any) {
    console.error('Error redeeming invite:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    if (error.message === 'NOT_FOUND' || error.message.includes('NOT_FOUND')) {
      return NextResponse.json(
        { error: 'INVALID_TOKEN', message: 'Invite token not found or expired' },
        { status: 404 }
      );
    }

    if (error.message === 'CONFLICT' || error.message.includes('CONFLICT')) {
      return NextResponse.json(
        { error: 'TOKEN_EXHAUSTED', message: 'Invite token has reached max uses' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'REDEEM_FAILED', message: error.message },
      { status: 500 }
    );
  }
}
