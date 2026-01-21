/**
 * GET /api/dashboard
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

    // 获取当前workspace（如果没有默认的，使用第一个 membership）
    let workspace = await getActiveWorkspace();
    if (!workspace) {
      // 如果没有默认 workspace，使用第一个 membership
      if (internalUser.memberships && internalUser.memberships.length > 0) {
        const firstMembership = internalUser.memberships[0];
        const firstVenue = firstMembership.venues?.[0];
        
        workspace = {
          merchantId: firstMembership.merchantId,
          merchantName: firstMembership.merchantName,
          venueId: firstVenue?.venueId,
          venueName: firstVenue?.venueName,
          role: firstMembership.role,
        };
        
        // 自动设置默认 workspace（异步，不阻塞响应）
        const { setDefaultWorkspace } = await import('@/lib/internal/workspace');
        setDefaultWorkspace(workspace.merchantId, workspace.venueId).catch(console.error);
      } else {
        return NextResponse.json(
          { error: 'NO_WORKSPACE', message: 'No active workspace' },
          { status: 403 }
        );
      }
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
