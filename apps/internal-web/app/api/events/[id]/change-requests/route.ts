/**
 * Internal Change Request API
 * POST /api/events/[id]/change-requests - 提交修改申请
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal/auth';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { createClient } from '@/lib/supabase/server';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rl = await rateLimitOrResponse(req, rateLimitPolicies.sensitivePost, { userId: 'anon' });
    if ('response' in rl) return rl.response;

    await requireInternalAuth();
    const workspace = await getActiveWorkspace();
    
    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    const { id: eventId } = await params;
    const body = await req.json();
    const { target_week_start_date, payload, note } = body;

    if (!target_week_start_date || !payload) {
      return NextResponse.json(
        { error: 'Missing required fields: target_week_start_date, payload' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: event, error: eventError } = await supabase
      .from('events_v2')
      .select('id, merchant_id')
      .eq('id', eventId)
      .eq('merchant_id', workspace.merchantId)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: 'Event not found or access denied' },
        { status: 404 }
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    let beforeSnapshot: Record<string, unknown> | null = null;
    const { data: rpcResult } = await supabase.rpc('rpc_get_or_create_event_week', {
      p_event_id: eventId,
      p_for_date: target_week_start_date,
      p_timezone: 'America/New_York',
    });
    if (rpcResult && rpcResult.length > 0) {
      const result = rpcResult[0];
      const daysArray = result.days as Array<{ dow: number; enabled: boolean; start_time: string; end_time: string; end_next_day: boolean; tickets?: unknown[] }> | null;
      const daysObj: Record<string, unknown> = {};
      if (Array.isArray(daysArray)) {
        for (const d of daysArray) {
          daysObj[String(d.dow)] = {
            enabled: d.enabled,
            start_time: d.start_time,
            end_time: d.end_time,
            end_next_day: d.end_next_day,
            tickets: d.tickets || [],
          };
        }
      }
      beforeSnapshot = { week_start_date: result.week_start_date, days: daysObj };
    }

    const { data: request, error: insertError } = await supabase
      .from('merchant_change_requests')
      .insert({
        merchant_id: workspace.merchantId,
        event_id: eventId,
        target_week_start_date,
        payload,
        before_snapshot: beforeSnapshot,
        note: note || null,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating change request:', insertError);
      return NextResponse.json(
        { error: 'Failed to create change request', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ request });
  } catch (error: any) {
    console.error('Error in POST /api/events/[id]/change-requests:', error);
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'FETCH_FAILED', message: error.message },
      { status: 500 }
    );
  }
}
