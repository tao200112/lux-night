/**
 * POST /api/admin/events/[id]/status
 * Update status (Active <-> Temp Closed <-> Archived).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin();
  if ('error' in authResult) return authResult.error;

  try {
    const { id } = await params;
    const body = await req.json();
    const { status } = body;

    const allowedStatuses = ['active', 'temp_closed', 'archived', 'draft'];
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { error: updateError } = await supabase
      .from('events_v2')
      .update({ status })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update status', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, status });

  } catch (error: any) {
    console.error('Status Update Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
