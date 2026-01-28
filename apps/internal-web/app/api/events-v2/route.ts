/**
 * Internal Events V2 API (Read-only)
 * GET /api/events-v2 - 获取活动列表（只读）
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal/auth';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    await requireInternalAuth();
    const workspace = await getActiveWorkspace();
    
    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    // 获取当前 merchant 的所有活动（只读）
    const { data: events, error } = await supabase
      .from('events_v2')
      .select(`
        *,
        merchants!inner (
          id,
          name
        )
      `)
      .eq('merchant_id', workspace.merchantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching events:', error);
      return NextResponse.json(
        { error: 'Failed to fetch events', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ events: events || [] });
  } catch (error: any) {
    console.error('Error in GET /api/events-v2:', error);
    
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
