/**
 * Internal Event Week API (Read-only)
 * GET /api/events-v2/[id]/week?date= - 获取本周配置（只读）
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal/auth';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireInternalAuth();
    const workspace = await getActiveWorkspace();
    
    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const searchParams = req.nextUrl.searchParams;
    const dateParam = searchParams.get('date');
    
    const forDate = dateParam ? new Date(dateParam) : new Date();
    const timezone = 'America/New_York';

    const supabase = await createClient();

    // 验证活动属于当前 merchant
    const { data: event, error: eventError } = await supabase
      .from('events_v2')
      .select('id, merchant_id')
      .eq('id', id)
      .eq('merchant_id', workspace.merchantId)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: 'Event not found or access denied' },
        { status: 404 }
      );
    }

    // 调用 RPC 获取本周配置（只读）
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'rpc_get_or_create_event_week',
      {
        p_event_id: id,
        p_for_date: forDate.toISOString().split('T')[0],
        p_timezone: timezone,
      }
    );

    if (rpcError) {
      console.error('Error calling rpc_get_or_create_event_week:', rpcError);
      return NextResponse.json(
        { error: 'Failed to get event week', details: rpcError.message },
        { status: 500 }
      );
    }

    if (!rpcResult || rpcResult.length === 0) {
      return NextResponse.json(
        { error: 'No event week found' },
        { status: 404 }
      );
    }

    const result = rpcResult[0];

    return NextResponse.json({
      event_week_id: result.event_week_id,
      week_start_date: result.week_start_date,
      days: result.days,
    });
  } catch (error: any) {
    console.error('Error in GET /api/events-v2/[id]/week:', error);
    
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
