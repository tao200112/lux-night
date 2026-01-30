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

    // 5. 增强数据：计算绝对日期与有效性窗口 (Fix for Sunday Week Start)
    const [y, m, d] = result.week_start_date.split('-').map(Number);
    const weekStart = new Date(y, m - 1, d); 

    // Parallel processing for days
    const enhancedDays = await Promise.all((result.days || []).map(async (day: any) => {
       // Calculation:
       // Evidence shows week_start_date is SUNDAY (Jan 25).
       // DB dow is 0=Sunday (Javascript standard).
       // So offset is simply dow.
       // e.g. Thu(4) -> Jan 25 + 4 days = Jan 29. Correct.
       const offset = day.dow;
       
       const dayDate = new Date(weekStart);
       dayDate.setDate(dayDate.getDate() + offset);
       
       const dayDateStr = dayDate.toLocaleDateString('en-CA'); // YYYY-MM-DD

       // Parse Times
       const [startH, startM] = day.start_time.split(':').map(Number);
       const [endH, endM] = day.end_time.split(':').map(Number);
       
       // Construct ISO Strings with Explicit Timezone (e.g., America/New_York)
       // We construct a string like "2026-01-29T16:00:00-05:00"
       // To permit accurate comparison.
       
       // Note: To be robust, we need a timezone library, but we can approximate by manually appending offset.
       // TODO: Read from event_weeks.timezone. For now hardcode -05:00 (EST/EDT awareness needed in future).
       const tzOffset = '-05:00'; 
       
       const startIso = `${dayDateStr}T${day.start_time}${day.start_time.length === 5 ? ':00' : ''}${tzOffset}`;
       
       let endDate = new Date(dayDate);
       if (day.end_next_day) {
           endDate.setDate(endDate.getDate() + 1);
       }
       const endDateStr = endDate.toLocaleDateString('en-CA');
       const endIso = `${endDateStr}T${day.end_time}${day.end_time.length === 5 ? ':00' : ''}${tzOffset}`;

       // Filter active tickets
       const validTickets = (day.tickets || []).filter((t: any) => t.status === 'active');

       return {
         ...day,
         date: dayDateStr,
         valid_start_at: startIso,
         valid_end_at: endIso,
         enabled: day.enabled,
         tickets: validTickets
       };
    }));

    // Filter: only enabled and strictly in future (end > now)
    const now = new Date(); // Server time (UTC)
    const finalDays = enhancedDays.filter((day: any) => {
        if (!day.enabled) return false;
        // Compare UTC timestamps
        if (new Date(day.valid_end_at) <= now) return false;
        return true;
    });

    // Sort by date
    finalDays.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return NextResponse.json({
      event_week_id: result.event_week_id,
      week_start_date: result.week_start_date,
      days: finalDays,
      event_status: event.status,
    });
  } catch (error: any) {
    console.error('Error in GET /api/public/events-v2/[id]/week:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
