/**
 * Public Event Week API
 * GET /api/public/events-v2/[id]/week?date= - 获取本周配置（公开，仅当前周）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = req.nextUrl.searchParams;
    const dateParam = searchParams.get('date');
    
    // 默认使用今天
    const forDate = dateParam ? new Date(dateParam) : new Date();
    const timezone = 'America/New_York';

    const supabase = await createClient();

    // 验证活动存在且为 active/paused
    const { data: event, error: eventError } = await supabase
      .from('events_v2')
      .select('id, status')
      .eq('id', id)
      .in('status', ['active', 'paused'])
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    // 调用 RPC 获取本周配置
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

    // 过滤：只返回 enabled 的 days 和 active 的 tickets
    const filteredDays = (result.days || []).map((day: any) => ({
      ...day,
      enabled: day.enabled,
      tickets: (day.tickets || []).filter((ticket: any) => ticket.status === 'active'),
    })).filter((day: any) => day.enabled);

    return NextResponse.json({
      event_week_id: result.event_week_id,
      week_start_date: result.week_start_date,
      days: filteredDays,
      event_status: event.status, // 用于前端判断是否 paused
    });
  } catch (error: any) {
    console.error('Error in GET /api/public/events-v2/[id]/week:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
