/**
 * POST /api/admin/events/[id]/publish
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

    const validation = await validateEventForPublish(supabase, id);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }

    // Sync ALL event weeks to Stripe before publish (required for checkout)
    // Publish fails if any sync fails to prevent "missing Stripe Price ID" at checkout
    const { data: weeks } = await supabase
      .from('event_weeks')
      .select('id')
      .eq('event_id', id);

    if (weeks && weeks.length > 0) {
      try {
        for (const w of weeks) {
          await syncEventWeekStripe(w.id);
        }
      } catch (e: any) {
        console.error('Stripe sync failed before publish:', e);
        return NextResponse.json(
          { error: 'Stripe sync failed', details: e?.message || String(e) },
          { status: 500 }
        );
      }
    }

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

    return NextResponse.json({ success: true, status: 'active' });

  } catch (error: any) {
    console.error('Publish Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
