/**
 * GET /api/internal/tickets/search
 * 搜索票据（手动查找）
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchTickets } from '@/lib/data/internal/checkins';
import { getActiveWorkspace } from '@/lib/internal/workspace';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const q = searchParams.get('q');

    if (!q) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Query parameter q is required' },
        { status: 400 }
      );
    }

    // 获取当前workspace
    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    // 搜索票据
    const tickets = await searchTickets(q, workspace.venueId);

    return NextResponse.json({
      tickets,
      count: tickets.length,
    });
  } catch (error: any) {
    console.error('Error searching tickets:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'SEARCH_FAILED', message: error.message },
      { status: 500 }
    );
  }
}
