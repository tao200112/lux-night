/**
 * Internal Change Request API
 * POST /api/events-v2/[id]/change-requests - 提交修改申请
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal/auth';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { createClient } from '@/lib/supabase/server';

export async function POST(
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

    // 验证活动属于当前 merchant
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

    // 获取当前用户
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // 创建修改申请
    const { data: request, error: insertError } = await supabase
      .from('merchant_change_requests')
      .insert({
        merchant_id: workspace.merchantId,
        event_id: eventId,
        target_week_start_date,
        payload,
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
    console.error('Error in POST /api/events-v2/[id]/change-requests:', error);
    
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
