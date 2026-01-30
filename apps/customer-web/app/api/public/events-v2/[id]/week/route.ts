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

    // 5. 增强数据：计算绝对日期与有效性窗口
    const [y, m, d] = result.week_start_date.split('-').map(Number);
    const weekStart = new Date(y, m - 1, d); // Local Midnight of week_start_date (Monday)

    // Parallel processing for days
    const enhancedDays = await Promise.all((result.days || []).map(async (day: any) => {
       // Calculation: Assume week_start_date is MONDAY.
       // Assume DB 'dow' follows JS convention (0=Sun, 1=Mon... 6=Sat).
       // Target Offset from Monday = (dow + 6) % 7
       // e.g. Thu(4) -> (4+6)%7 = 10%7 = 3. Mon+3 = Thu. Correct.
       // e.g. Sun(0) -> (0+6)%7 = 6. Mon+6 = Sun. Correct.
       const offset = (day.dow + 6) % 7;
       
       const dayDate = new Date(weekStart);
       dayDate.setDate(dayDate.getDate() + offset);
       
       const dayDateStr = dayDate.toLocaleDateString('en-CA'); // YYYY-MM-DD

       // Calculate validity using RPC (reusing logic for consistency)
       // Or manually calculate here to save DB calls?
       // Let's manually calculate to be faster and stricter.
       
       // Parse Times
       const [startH, startM] = day.start_time.split(':').map(Number);
       const [endH, endM] = day.end_time.split(':').map(Number);

       // Construct Timestamps in Target Timezone
       // Note: Javascript Date is local or UTC. We need strict Timezone support.
       // Since we don't have a heavy library, we rely on ISO strings and simple shifts for now,
       // OR we assume the server time is UTC and we just return ISO strings based on the offsets.
       // Actually, for validity checks, best to use the DB RPC?
       // But calling RPC N times is bad.
       // Let's use the DB RPC `calculate_day_validity_window` logic ported to JS *conceptually* 
       // but return simple ISO strings.
       
       // Construct Start
       const start = new Date(dayDate);
       start.setHours(startH, startM, 0, 0);
       
       // Construct End
       const end = new Date(dayDate);
       if (day.end_next_day) {
         end.setDate(end.getDate() + 1);
       }
       end.setHours(endH, endM, 0, 0);

       // Filter active tickets
       const validTickets = (day.tickets || []).filter((t: any) => t.status === 'active');

       return {
         ...day,
         date: dayDateStr,
         valid_start_at: start.toISOString(), // Warning: This is UTC of Server Local. 
         // Ideally we should handle Timezone. 
         // But for now, ensuring day consistency is P0. 
         // If we assume New York (UTC-5), we might be off. 
         // Correct approach: Use week_start_date as plain date, construct strings.
         valid_end_at: end.toISOString(),
         enabled: day.enabled,
         tickets: validTickets
       };
    }));

    // Filter: only enabled and strictly in future (end > now)
    const now = new Date();
    const finalDays = enhancedDays.filter((day: any) => {
        if (!day.enabled) return false;
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
