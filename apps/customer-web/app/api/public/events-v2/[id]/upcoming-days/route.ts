/**
 * Public Upcoming Days API
 * GET /api/public/events-v2/[id]/upcoming-days?limit=3
 * 跨周返回接下来 N 个可购场次，保证始终显示例如周四周五周六的滚动窗口
 * 新周首次创建时自动同步 Stripe，实现一次配置、无需每周处理
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncEventWeekStripeIfNeeded } from '@/lib/stripe/event-week-sync';
import { APP_TIMEZONE, getNYOffset, getNYDateString } from '@lux-night/shared/timezone';

const DEFAULT_LIMIT = 3;
const MAX_WEEKS_TO_FETCH = 6;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toYYYYMMDD(d: Date): string {
  return getNYDateString(d);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = req.nextUrl.searchParams;
    const limitParam = searchParams.get('limit');
    const limit = Math.min(Math.max(parseInt(limitParam || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1), 10);

    const timezone = APP_TIMEZONE;
    const supabase = await createClient();

    const { data: event, error: eventError } = await supabase
      .from('events_v2')
      .select('id, status')
      .eq('id', id)
      .in('status', ['active', 'paused'])
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const accumulatedDays: Array<{
      id: string;
      dow: number;
      enabled: boolean;
      start_time: string;
      end_time: string;
      end_next_day: boolean;
      date: string;
      valid_start_at: string;
      valid_end_at: string;
      event_week_id: string;
      week_start_date: string;
      tickets: any[];
    }> = [];
    let forDate = new Date();

    for (let w = 0; w < MAX_WEEKS_TO_FETCH && accumulatedDays.length < limit; w++) {
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'rpc_get_or_create_event_week',
        {
          p_event_id: id,
          p_for_date: toYYYYMMDD(forDate),
          p_timezone: timezone,
        }
      );

      if (rpcError || !rpcResult || rpcResult.length === 0) {
        break;
      }

      const result = rpcResult[0];
      const needsSync = (result.days || []).some(
        (d: any) => (d.tickets || []).some((t: any) => t.status === 'active' && !t.stripe_price_id)
      );
      if (needsSync) {
        await syncEventWeekStripeIfNeeded(result.event_week_id);
      }
      const [y, m, d] = String(result.week_start_date).split('-').map(Number);
      let weekStart = new Date(y, m - 1, d);
      if (weekStart.getDay() === 0) {
        weekStart.setDate(weekStart.getDate() + 1);
      } else if (weekStart.getDay() !== 1) {
        const day = weekStart.getDay();
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
        weekStart.setDate(diff);
      }

      const now = new Date();
      const rawDays = result.days || [];

      for (const day of rawDays) {
        if (!day.enabled) continue;

        const offset = (day.dow + 6) % 7;
        const dayDate = new Date(weekStart);
        dayDate.setDate(dayDate.getDate() + offset);
        const dayDateStr = dayDate.toLocaleDateString('en-CA');

        const st = String(day.start_time);
        const et = String(day.end_time);
        const startOffset = getNYOffset(dayDate);
        const startIso = `${dayDateStr}T${st.length === 5 ? st + ':00' : st}${startOffset}`;
        let endDate = new Date(dayDate);
        if (day.end_next_day) endDate.setDate(endDate.getDate() + 1);
        const endDateStr = endDate.toLocaleDateString('en-CA');
        const endOffset = getNYOffset(endDate);
        const endIso = `${endDateStr}T${et.length === 5 ? et + ':00' : et}${endOffset}`;

        if (new Date(endIso) <= now) continue;

        const validTickets = (day.tickets || []).filter((t: any) => t.status === 'active');
        accumulatedDays.push({
          id: day.id,
          dow: day.dow,
          enabled: day.enabled,
          start_time: day.start_time,
          end_time: day.end_time,
          end_next_day: day.end_next_day ?? true,
          date: dayDateStr,
          valid_start_at: startIso,
          valid_end_at: endIso,
          event_week_id: result.event_week_id,
          week_start_date: result.week_start_date,
          tickets: validTickets,
        });

        if (accumulatedDays.length >= limit) break;
      }

      forDate = addDays(forDate, 7);
    }

    accumulatedDays.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return NextResponse.json({
      days: accumulatedDays,
      event_status: event.status,
    });
  } catch (error: any) {
    console.error('Error in GET /api/public/events-v2/[id]/upcoming-days:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
