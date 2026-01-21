/**
 * GET /api/requests/[id]
 * 获取单个申请详情
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestById } from '@/lib/data/internal/requests';
import { requireInternalAuth } from '@/lib/internal/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireInternalAuth();
    const { id } = await params;

    const request = await getRequestById(id);

    if (!request) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Request not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      request,
    });
  } catch (error: any) {
    console.error('Error getting request:', error);
    
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
