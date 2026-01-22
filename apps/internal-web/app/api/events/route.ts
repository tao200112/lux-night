/**
 * GET /api/events - 获取活动列表
 * POST /api/events - 创建新活动
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMerchantEvents } from '@/lib/data/internal/events';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';
import { createClient } from '@/lib/supabase/server';

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

// POST 方法已禁用 - 商家不允许创建新活动，只能编辑已有活动
export async function POST(req: NextRequest) {
  return NextResponse.json(
    { 
      error: 'METHOD_NOT_ALLOWED', 
      message: 'Event creation is disabled. Please edit existing events instead.' 
    },
    { status: 410 } // 410 Gone - 表示功能已被永久移除
  );
}
