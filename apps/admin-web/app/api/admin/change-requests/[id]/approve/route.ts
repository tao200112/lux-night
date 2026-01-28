/**
 * Admin Approve Change Request API
 * POST /api/admin/change-requests/[id]/approve - 审批通过修改申请
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncEventWeekStripe } from '@/lib/stripe/event-week-sync';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin();
  if ('error' in authResult) {
    return authResult.error;
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { review_note } = body;

    const supabase = createAdminClient();

    // 1. 获取申请
    const { data: request, error: fetchError } = await supabase
      .from('merchant_change_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !request) {
      return NextResponse.json(
        { error: 'Change request not found' },
        { status: 404 }
      );
    }

    if (request.status !== 'pending') {
      return NextResponse.json(
        { error: 'Change request is not pending' },
        { status: 400 }
      );
    }

    // 2. 应用 payload 到 target_week_start_date
    const { data: weekResult, error: weekError } = await supabase.rpc(
      'rpc_get_or_create_event_week',
      {
        p_event_id: request.event_id,
        p_for_date: request.target_week_start_date,
        p_timezone: 'America/New_York',
      }
    );

    if (weekError || !weekResult || weekResult.length === 0) {
      return NextResponse.json(
        { error: 'Failed to get or create event week', details: weekError?.message },
        { status: 500 }
      );
    }

    const eventWeekId = weekResult[0].event_week_id;
    const payload = request.payload as any;

    // 3. 应用 payload 的 patch
    if (payload.days) {
      for (const [dowStr, dayData] of Object.entries(payload.days)) {
        const dow = parseInt(dowStr);
        const dayConfig = dayData as any;

        // 获取或创建 day
        const { data: dayRecord, error: dayError } = await supabase
          .from('event_week_days')
          .select('id')
          .eq('event_week_id', eventWeekId)
          .eq('dow', dow)
          .single();

        let dayId: string;
        if (dayError || !dayRecord) {
          // 创建新 day
          const { data: newDay, error: createError } = await supabase
            .from('event_week_days')
            .insert({
              event_week_id: eventWeekId,
              dow,
              enabled: dayConfig.enabled ?? false,
              start_time: dayConfig.start_time || '16:00',
              end_time: dayConfig.end_time || '02:00',
              end_next_day: dayConfig.end_next_day ?? true,
            })
            .select()
            .single();

          if (createError || !newDay) {
            console.error(`Failed to create day ${dow}:`, createError);
            continue;
          }
          dayId = newDay.id;
        } else {
          dayId = dayRecord.id;
          // 更新 day
          await supabase
            .from('event_week_days')
            .update({
              enabled: dayConfig.enabled ?? dayRecord.enabled,
              start_time: dayConfig.start_time || dayRecord.start_time,
              end_time: dayConfig.end_time || dayRecord.end_time,
              end_next_day: dayConfig.end_next_day ?? dayRecord.end_next_day,
            })
            .eq('id', dayId);
        }

        // 处理 tickets
        if (dayConfig.tickets && Array.isArray(dayConfig.tickets)) {
          for (const ticket of dayConfig.tickets) {
            if (ticket.action === 'delete' && ticket.id) {
              await supabase
                .from('ticket_types_v2')
                .delete()
                .eq('id', ticket.id);
            } else if (ticket.action === 'upsert') {
              const ticketData: any = {
                event_week_day_id: dayId,
                name: ticket.name,
                category: ticket.category || 'entry',
                price_cents: ticket.price_cents || 0,
                currency: ticket.currency || 'usd',
                min_age: ticket.min_age || null,
                inventory_limit: ticket.inventory_limit || null,
                status: ticket.status || 'active',
                sort_order: ticket.sort_order || 0,
              };

              if (ticket.id) {
                await supabase
                  .from('ticket_types_v2')
                  .update(ticketData)
                  .eq('id', ticket.id);
              } else {
                await supabase
                  .from('ticket_types_v2')
                  .insert(ticketData);
              }
            }
          }
        }
      }
    }

    // 4. 同步 Stripe
    try {
      await syncEventWeekStripe(eventWeekId);
    } catch (stripeError) {
      console.error('Stripe sync error (non-fatal):', stripeError);
    }

    // 5. 更新申请状态
    const { data: updatedRequest, error: updateError } = await supabase
      .from('merchant_change_requests')
      .update({
        status: 'approved',
        reviewed_by_admin: authResult.user.id,
        reviewed_at: new Date().toISOString(),
        review_note: review_note || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating request status:', updateError);
      return NextResponse.json(
        { error: 'Failed to update request status', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ request: updatedRequest });
  } catch (error: any) {
    console.error('Error in POST /api/admin/change-requests/[id]/approve:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
