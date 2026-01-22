/**
 * GET /api/merchant/events/[id]/change-requests
 * 获取指定活动的变更请求列表
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// 使用 service role key 创建 admin client（绕过 RLS）
const getAdminClient = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireInternalAuth();
    const { id: eventId } = await params;

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

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_ERROR',
            message: 'Server configuration error',
          },
        },
        { status: 500 }
      );
    }

    // 验证 event 属于当前 merchant
    const { data: event, error: eventError } = await adminClient
      .from('events')
      .select('id, merchant_id')
      .eq('id', eventId)
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

    // 获取该活动的变更请求列表（按 submitted_at 降序）
    const { data: requests, error: fetchError } = await adminClient
      .from('event_change_requests')
      .select(`
        id,
        request_type,
        status,
        payload_json,
        submitted_at,
        approved_at,
        rejected_reason
      `)
      .eq('event_id', eventId)
      .eq('merchant_id', workspace.merchantId)
      .order('submitted_at', { ascending: false });

    if (fetchError) {
      console.error('[EVENT CHANGE REQUESTS] Fetch error:', fetchError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FETCH_FAILED',
            message: 'Failed to fetch change requests',
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      requests: requests || [],
      count: requests?.length || 0,
    });

  } catch (error: any) {
    console.error('[EVENT CHANGE REQUESTS] Unexpected error:', error);
    
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
