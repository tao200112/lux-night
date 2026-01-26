/**
 * Weekly Rules API for Events
 * GET  /api/admin/events/[id]/weekly-rules - 获取活动的周期规则
 * PUT  /api/admin/events/[id]/weekly-rules - 更新活动的周期规则
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface WeeklyRule {
  day_of_week: number; // 0=Sunday, 6=Saturday
  is_on_sale: boolean;
  valid_from_time: string; // "HH:MM:SS"
  valid_to_time: string;   // "HH:MM:SS"
  timezone?: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const { id: eventId } = await params;
    const admin = createAdminClient();

    // 获取活动信息
    const { data: event, error: eventError } = await admin
      .from('events')
      .select('id, title, schedule_mode, timezone')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });
    }

    // 获取周期规则
    const { data: rules, error: rulesError } = await admin
      .from('event_weekly_rules')
      .select('*')
      .eq('event_id', eventId)
      .is('specific_date', null)
      .order('day_of_week', { ascending: true });

    if (rulesError) {
      console.error('[WEEKLY RULES GET] Error:', rulesError);
      return NextResponse.json({ success: false, error: rulesError.message }, { status: 500 });
    }

    // 如果没有规则，生成默认的 7 天规则
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weeklyRules = Array.from({ length: 7 }, (_, i) => {
      const existing = rules?.find(r => r.day_of_week === i);
      return {
        day_of_week: i,
        day_name: dayNames[i],
        is_on_sale: existing?.is_on_sale ?? false,
        valid_from_time: existing?.valid_from_time ?? '22:00:00',
        valid_to_time: existing?.valid_to_time ?? '04:00:00',
        is_overnight: existing?.is_overnight ?? true,
        timezone: existing?.timezone ?? event.timezone ?? 'America/Los_Angeles',
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        event_id: eventId,
        schedule_mode: event.schedule_mode,
        default_timezone: event.timezone,
        rules: weeklyRules,
      },
    });
  } catch (e: any) {
    console.error('[WEEKLY RULES GET]', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const { id: eventId } = await params;
    const body = await req.json();
    const { rules, schedule_mode, timezone } = body as {
      rules: WeeklyRule[];
      schedule_mode?: 'single' | 'weekly' | 'custom';
      timezone?: string;
    };

    if (!rules || !Array.isArray(rules)) {
      return NextResponse.json({ success: false, error: 'rules array is required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // 验证活动存在
    const { data: event, error: eventError } = await admin
      .from('events')
      .select('id, merchant_id')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });
    }

    // 更新活动的 schedule_mode 和 timezone
    if (schedule_mode || timezone) {
      const updateData: Record<string, unknown> = {};
      if (schedule_mode) updateData.schedule_mode = schedule_mode;
      if (timezone) updateData.timezone = timezone;

      await admin.from('events').update(updateData).eq('id', eventId);
    }

    // 删除现有规则（非特定日期的）
    await admin
      .from('event_weekly_rules')
      .delete()
      .eq('event_id', eventId)
      .is('specific_date', null);

    // 插入新规则
    const rulesToInsert = rules
      .filter(r => r.day_of_week >= 0 && r.day_of_week <= 6)
      .map(r => ({
        event_id: eventId,
        day_of_week: r.day_of_week,
        is_on_sale: r.is_on_sale ?? false,
        valid_from_time: r.valid_from_time || '22:00:00',
        valid_to_time: r.valid_to_time || '04:00:00',
        timezone: r.timezone || timezone || 'America/Los_Angeles',
      }));

    if (rulesToInsert.length > 0) {
      const { error: insertError } = await admin
        .from('event_weekly_rules')
        .insert(rulesToInsert);

      if (insertError) {
        console.error('[WEEKLY RULES PUT] Insert error:', insertError);
        return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        event_id: eventId,
        rules_count: rulesToInsert.length,
        message: 'Weekly rules updated successfully',
      },
    });
  } catch (e: any) {
    console.error('[WEEKLY RULES PUT]', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
