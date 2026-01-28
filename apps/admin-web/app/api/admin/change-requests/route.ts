/**
 * Admin Change Requests API
 * GET /api/admin/change-requests - 获取修改申请列表
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const authResult = await requireAdmin();
  if ('error' in authResult) {
    return authResult.error;
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status') || 'pending';

    const supabase = createAdminClient();

    let query = supabase
      .from('merchant_change_requests')
      .select(`
        *,
        events_v2!inner (
          id,
          title,
          merchant_id
        ),
        merchants!inner (
          id,
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: requests, error } = await query;

    if (error) {
      console.error('Error fetching change requests:', error);
      return NextResponse.json(
        { error: 'Failed to fetch change requests', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ requests: requests || [] });
  } catch (error: any) {
    console.error('Error in GET /api/admin/change-requests:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
