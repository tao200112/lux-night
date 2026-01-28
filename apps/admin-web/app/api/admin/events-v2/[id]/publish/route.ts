/**
 * POST /api/admin/events-v2/[id]/publish
 * Publish event (Draft -> Active) with validation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateEventForPublish } from '@/lib/events-v2/publish-validator';
import { syncEventWeekStripe } from '@/lib/stripe/event-week-sync';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin();
  if ('error' in authResult) return authResult.error;

  try {
    const { id } = await params;
    const supabase = createAdminClient();

    // 1. Validate
    const validation = await validateEventForPublish(supabase, id);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }

    // 2. Update Status
    const { error: updateError } = await supabase
      .from('events_v2')
      .update({ status: 'active' })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update status', details: updateError.message },
        { status: 500 }
      );
    }

    // 3. Trigger Stripe Sync (Async)
    // Find the week ID to sync
    const { data: weeks } = await supabase
        .from('event_weeks')
        .select('id')
        .eq('event_id', id)
        .limit(1);

    if (weeks && weeks.length > 0) {
        try {
            await syncEventWeekStripe(weeks[0].id);
        } catch (e) {
            console.error('Stripe sync failed after publish:', e);
            // Don't fail the request, just log
        }
    }

    return NextResponse.json({ success: true, status: 'active' });

  } catch (error: any) {
    console.error('Publish Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
