/**
 * GET /api/internal/dashboard
 * 获取dashboard统计信息
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/data/internal/dashboard';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';

export async function GET(req: NextRequest) {
  try {
    const internalUser = await requireInternalAuth();
    const searchParams = req.nextUrl.searchParams;
    const venueId = searchParams.get('venue_id');

    // 获取当前workspace
    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    const actualVenueId = venueId || workspace.venueId;

    // 获取统计信息
    const stats = await getDashboardStats(workspace.merchantId, actualVenueId || undefined);

    return NextResponse.json({
      stats,
      workspace,
    });
  } catch (error: any) {
    console.error('Error getting dashboard stats:', error);
    
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
