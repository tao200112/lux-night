/**
 * POST /api/merchant/event-change-requests
 * 商家提交活动修改请求
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';

export async function POST(req: NextRequest) {
  try {
    await requireInternalAuth();
    
    const body = await req.json();
    const { event_id, payload_json } = body;

    if (!event_id || !payload_json) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'event_id and payload_json are required' },
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

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Must be logged in' },
        { status: 401 }
      );
    }

    // 验证 event 属于当前 merchant
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, merchant_id')
      .eq('id', event_id)
      .eq('merchant_id', workspace.merchantId)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Event not found or does not belong to your merchant' },
        { status: 404 }
      );
    }

    // 检查是否有待审批的请求
    const { data: pendingRequest } = await supabase
      .from('event_change_requests')
      .select('id')
      .eq('event_id', event_id)
      .eq('merchant_id', workspace.merchantId)
      .eq('status', 'pending')
      .maybeSingle();

    if (pendingRequest) {
      return NextResponse.json(
        { error: 'PENDING_REQUEST_EXISTS', message: 'You already have a pending change request for this event' },
        { status: 400 }
      );
    }

    // 创建修改请求
    const { data: request, error: createError } = await supabase
      .from('event_change_requests')
      .insert({
        merchant_id: workspace.merchantId,
        event_id: event_id,
        status: 'pending',
        payload_json: payload_json,
        submitted_by: user.id,
      })
      .select('id, status, submitted_at')
      .single();

    if (createError) {
      console.error('[EVENT CHANGE REQUEST] Create error:', createError);
      return NextResponse.json(
        { error: 'CREATE_FAILED', message: 'Failed to create change request' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      request: {
        id: request.id,
        status: request.status,
        submitted_at: request.submitted_at,
      },
    }, { status: 201 });

  } catch (error: any) {
    console.error('[EVENT CHANGE REQUEST] Unexpected error:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireInternalAuth();
    
    const searchParams = req.nextUrl.searchParams;
    const eventId = searchParams.get('event_id');
    const status = searchParams.get('status');

    // 获取当前workspace
    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    let query = supabase
      .from('event_change_requests')
      .select('id, event_id, status, submitted_at, approved_at, rejection_reason')
      .eq('merchant_id', workspace.merchantId);

    if (eventId) {
      query = query.eq('event_id', eventId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    query = query.order('submitted_at', { ascending: false });

    const { data: requests, error: fetchError } = await query;

    if (fetchError) {
      console.error('[EVENT CHANGE REQUEST] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'FETCH_FAILED', message: 'Failed to fetch change requests' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      requests: requests || [],
      count: requests?.length || 0,
    });

  } catch (error: any) {
    console.error('[EVENT CHANGE REQUEST] Unexpected error:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
