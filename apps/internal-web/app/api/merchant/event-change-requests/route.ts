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
    const { event_id, request_type, payload_json } = body;

    if (!event_id || !request_type || !payload_json) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'event_id, request_type, and payload_json are required',
          },
        },
        { status: 400 }
      );
    }

    // 验证 request_type
    if (!['poster', 'price', 'inventory'].includes(request_type)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'request_type must be one of: poster, price, inventory',
          },
        },
        { status: 400 }
      );
    }

    // 获取当前workspace
    const workspace = await getActiveWorkspace();
    if (!workspace || !workspace.merchantId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_WORKSPACE',
            message: 'No active workspace or merchant_id missing',
          },
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Must be logged in',
          },
        },
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
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Event not found or does not belong to your merchant',
          },
        },
        { status: 404 }
      );
    }

    // 创建修改请求（允许同一活动有多个不同类型的 pending 请求）
    const { data: request, error: createError } = await supabase
      .from('event_change_requests')
      .insert({
        merchant_id: workspace.merchantId,
        event_id: event_id,
        request_type: request_type,
        status: 'pending',
        payload_json: payload_json,
        submitted_by: user.id,
      })
      .select('id, request_type, status, payload_json, submitted_at, approved_at, rejected_reason')
      .single();

    if (createError) {
      console.error('[EVENT CHANGE REQUEST] Create error:', createError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CREATE_FAILED',
            message: 'Failed to create change request',
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      request: {
        id: request.id,
        request_type: request.request_type,
        status: request.status,
        payload_json: request.payload_json,
        submitted_at: request.submitted_at,
        approved_at: request.approved_at,
        rejected_reason: request.rejected_reason,
      },
    }, { status: 201 });

  } catch (error: any) {
    console.error('[EVENT CHANGE REQUEST] Unexpected error:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Unauthorized',
          },
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error.message || 'Internal server error',
        },
      },
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
      .select('id, event_id, request_type, status, payload_json, submitted_at, approved_at, rejected_reason')
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
