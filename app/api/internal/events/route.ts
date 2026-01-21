/**
 * GET /api/internal/events
 * 获取活动列表
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMerchantEvents } from '@/lib/data/internal/events';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';

export async function GET(req: NextRequest) {
  try {
    await requireInternalAuth();
    const searchParams = req.nextUrl.searchParams;
    const venueId = searchParams.get('venue_id');
    const status = searchParams.get('status');

    // 获取当前workspace
    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    const actualVenueId = venueId || workspace.venueId;

    // 获取活动列表
    const events = await getMerchantEvents(
      workspace.merchantId,
      actualVenueId || undefined,
      status || undefined
    );

    return NextResponse.json({
      events,
      count: events.length,
    });
  } catch (error: any) {
    console.error('Error getting events:', error);
    
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
