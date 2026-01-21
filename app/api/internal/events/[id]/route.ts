/**
 * GET /api/internal/events/[id]
 * 获取单个活动详情
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEventById } from '@/lib/data/internal/events';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireInternalAuth();
    const { id } = await params;

    // 获取当前workspace
    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    // 获取活动详情
    const event = await getEventById(id, workspace.merchantId);

    if (!event) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Event not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      event,
    });
  } catch (error: any) {
    console.error('Error getting event:', error);
    
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
