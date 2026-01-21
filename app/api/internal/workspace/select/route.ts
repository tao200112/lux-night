/**
 * POST /api/internal/workspace/select
 * 设置默认workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { setDefaultWorkspace } from '@/lib/internal/workspace';
import { canAccessVenue } from '@/lib/internal/permissions';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { merchantId, venueId } = body;

    if (!merchantId) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'merchantId is required' },
        { status: 400 }
      );
    }

    // 如果指定了venueId，验证权限
    if (venueId) {
      const hasAccess = await canAccessVenue(venueId, merchantId);
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'NO_ACCESS', message: 'No access to this venue' },
          { status: 403 }
        );
      }
    }

    // 设置默认workspace
    await setDefaultWorkspace(merchantId, venueId);

    return NextResponse.json({
      success: true,
      merchantId,
      venueId: venueId || null,
    });
  } catch (error: any) {
    console.error('Error selecting workspace:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    if (error.message === 'NO_ACCESS' || error.message === 'INVALID_VENUE') {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'UPDATE_FAILED', message: error.message },
      { status: 500 }
    );
  }
}
