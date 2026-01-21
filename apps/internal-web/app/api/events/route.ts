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

export async function POST(req: NextRequest) {
  try {
    await requireInternalAuth();
    const body = await req.json();
    const { title, description, startAt, endAt, venueId, agePolicy, refundPolicy } = body;

    // 验证必填字段
    if (!title || !startAt || !endAt || !venueId) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Title, startAt, endAt, and venueId are required' },
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

    // 验证 venue 属于当前 merchant
    const supabase = await createClient();
    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .select('id, merchant_id, region_id')
      .eq('id', venueId)
      .eq('merchant_id', workspace.merchantId)
      .single();

    if (venueError || !venue) {
      return NextResponse.json(
        { error: 'INVALID_VENUE', message: 'Venue not found or does not belong to your merchant' },
        { status: 404 }
      );
    }

    // 验证日期
    const startDate = new Date(startAt);
    const endDate = new Date(endAt);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: 'INVALID_DATE', message: 'Invalid date format' },
        { status: 400 }
      );
    }
    if (endDate <= startDate) {
      return NextResponse.json(
        { error: 'INVALID_DATE', message: 'End date must be after start date' },
        { status: 400 }
      );
    }

    // 商家端创建活动：发送请求到管理员端审批
    // 使用 createRequest 函数创建 new_event 类型的请求
    const { createRequest } = await import('@/lib/data/internal/requests');
    
    // 获取当前用户
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Must be logged in' },
        { status: 401 }
      );
    }
    
    const requestData = {
      merchant_id: workspace.merchantId,
      venue_id: venueId,
      requested_by: user.id,
      type: 'new_event',
      status: 'pending',
      payload: {
        title: title.trim(),
        description: description?.trim() || null,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        venue_id: venueId,
        age_policy: agePolicy || '21+',
        refund_policy: refundPolicy || 'no_refund',
      },
      payload_after: {
        title: title.trim(),
        description: description?.trim() || null,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        venue_id: venueId,
        age_policy: agePolicy || '21+',
        refund_policy: refundPolicy || 'no_refund',
      },
      payload_before: null,
    };
    
    const request = await createRequest(requestData);

    return NextResponse.json({
      success: true,
      message: 'Event request submitted successfully. Waiting for admin approval.',
      request: {
        id: request.id,
        status: request.status,
        type: request.type,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('[CREATE EVENT REQUEST] Error:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'CREATE_FAILED', message: error.message },
      { status: 500 }
    );
  }
}
