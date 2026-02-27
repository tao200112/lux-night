/**
 * Public Event Week API
 * GET /api/public/events-v2/[id]/week?date= - 获取本周配置（公开，仅当前周）
 * 新周首次创建时自动同步 Stripe，实现一次配置、无需每周处理
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncEventWeekStripeIfNeeded } from '@/lib/stripe/event-week-sync';

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
    const needsSync = (result.days || []).some(
      (d: any) => (d.tickets || []).some((t: any) => t.status === 'active' && !t.stripe_price_id)
    );
    if (needsSync) {
      await syncEventWeekStripeIfNeeded(result.event_week_id);
    }

    // 5. 增强数据：计算绝对日期与有效性窗口 (Robust Fix)
    const [y, m, d] = result.week_start_date.split('-').map(Number);
    // Force Normalize to Monday
    // Logic: Create the date. Check day. If Sunday, add 1. If other, adjust to Monday.
    // However, simpler approach:
    // Postgres `rpc_get_or_create_event_week` logic tries to snap to Monday.
    // If it returns Sunday (e.g. legacy data), we shift it to Monday for consistency with our Offset logic.
    let weekStart = new Date(y, m - 1, d); 
    if (weekStart.getDay() === 0) { // Sunday
        weekStart.setDate(weekStart.getDate() + 1);
    } else if (weekStart.getDay() !== 1) { // Not Monday (and not Sunday)
        // Adjust to previous Monday just in case
        const day = weekStart.getDay();
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); 
        weekStart.setDate(diff); // This logic is tricky in JS, sticking to Sunday->Monday fix is safest for now.
    }
    // Result: weekStart is now anchored to MONDAY (Jan 26).

    // Parallel processing for days
    const enhancedDays = await Promise.all((result.days || []).map(async (day: any) => {
       // Calculation:
       // Admin Input: JS DOW (0=Sun, 1=Mon, ... 4=Thu, 5=Fri, 6=Sat).
       // We want Offset from MONDAY.
       // Thu(4) -> Offset 3.
       // Fri(5) -> Offset 4.
       // Sat(6) -> Offset 5.
       // Sun(0) -> Offset 6.
       // Formula: (day.dow + 6) % 7
       const offset = (day.dow + 6) % 7;
       
       const dayDate = new Date(weekStart);
       dayDate.setDate(dayDate.getDate() + offset);
       
       const dayDateStr = dayDate.toLocaleDateString('en-CA'); // YYYY-MM-DD

       // Parse Times
       const [startH, startM] = day.start_time.split(':').map(Number);
       const [endH, endM] = day.end_time.split(':').map(Number);
       
       // Construct ISO Strings with Explicit Timezone (America/New_York)
       // TODO: Read from event_weeks.timezone.
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
