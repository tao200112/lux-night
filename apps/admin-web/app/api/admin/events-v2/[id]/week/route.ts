/**
 * Admin Event Week Configuration API
 * GET /api/admin/events-v2/[id]/week?date= - 获取或创建本周配置
 * PUT /api/admin/events-v2/[id]/week - 保存本周配置
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncEventWeekStripe } from '@/lib/stripe/event-week-sync';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin();
  if ('error' in authResult) {
    return authResult.error;
  }

  try {
    const { id } = await params;
    const searchParams = req.nextUrl.searchParams;
    const dateParam = searchParams.get('date');
    
    // 默认使用今天
    const forDate = dateParam ? new Date(dateParam) : new Date();
    const timezone = 'America/New_York';

    const supabase = createAdminClient();

    // 调用 RPC 获取或创建本周配置
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'rpc_get_or_create_event_week',
      {
        p_event_id: id,
        p_for_date: forDate.toISOString().split('T')[0], // YYYY-MM-DD
        p_timezone: timezone,
      }
    );

    if (rpcError) {
      console.error('Error calling rpc_get_or_create_event_week:', rpcError);
      return NextResponse.json(
        { error: 'Failed to get or create event week', details: rpcError.message },
        { status: 500 }
      );
    }

    if (!rpcResult || rpcResult.length === 0) {
      return NextResponse.json(
        { error: 'No event week found' },
        { status: 404 }
      );
    }

    const result = rpcResult[0];

    // Fetch Event Status separately
    const { data: eventData } = await supabase
        .from('events_v2')
        .select('status')
        .eq('id', id)
        .single();
    
    return NextResponse.json({
      event_week_id: result.event_week_id,
      week_start_date: result.week_start_date,
      days: result.days,
      event_status: eventData?.status || 'draft'
    });
  } catch (error: any) {
    console.error('Error in GET /api/admin/events-v2/[id]/week:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin();
  if ('error' in authResult) {
    return authResult.error;
  }

  try {
    const { id: eventId } = await params;
    const body = await req.json();
    const { week_start_date, days } = body;

    if (!week_start_date || !days) {
      return NextResponse.json(
        { error: 'Missing required fields: week_start_date, days' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. 获取或创建 event_week
    const { data: weekResult, error: weekError } = await supabase.rpc(
      'rpc_get_or_create_event_week',
      {
        p_event_id: eventId,
        p_for_date: week_start_date,
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

    // 2. 更新每个 day 的配置
    for (const [dowStr, dayData] of Object.entries(days)) {
      const dow = parseInt(dowStr);
      const dayConfig = dayData as any;

      // 更新 event_week_days
      const { data: dayRecord, error: dayError } = await supabase
        .from('event_week_days')
        .select('id')
        .eq('event_week_id', eventWeekId)
        .eq('dow', dow)
        .single();

      if (dayError || !dayRecord) {
        console.error(`Day ${dow} not found:`, dayError);
        continue;
      }

      // 更新 day 配置
      await supabase
        .from('event_week_days')
        .update({
          enabled: dayConfig.enabled ?? false,
          start_time: dayConfig.start_time || '16:00',
          end_time: dayConfig.end_time || '02:00',
          end_next_day: dayConfig.end_next_day ?? true,
        })
        .eq('id', dayRecord.id);

      // 3. 处理 tickets（新增/更新/删除）
      if (dayConfig.tickets && Array.isArray(dayConfig.tickets)) {
        for (const ticket of dayConfig.tickets) {
          if (ticket.action === 'delete' && ticket.id) {
            // 删除
            const { error: deleteError } = await supabase
              .from('ticket_types_v2')
              .delete()
              .eq('id', ticket.id);
            
            if (deleteError) {
              // 23503 = foreign_key_violation (used in tickets table usually)
              if (deleteError.code === '23503') {
                  console.warn(`[Ticket Delete] FK Violation for ${ticket.id}, falling back to soft delete (hidden).`);
                  const { error: softDeleteError } = await supabase
                    .from('ticket_types_v2')
                    .update({ status: 'hidden' })
                    .eq('id', ticket.id);
                  
                  if (softDeleteError) throw softDeleteError; // If this fails too, throw real error
              } else {
                  throw deleteError;
              }
            }
          } else if (ticket.action === 'upsert') {
            const ticketData: any = {
              event_week_day_id: dayRecord.id,
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
              // 更新
              const { error: updateError } = await supabase
                .from('ticket_types_v2')
                .update(ticketData)
                .eq('id', ticket.id);
              if (updateError) throw updateError;
            } else {
              // 新增
              const { error: insertError } = await supabase
                .from('ticket_types_v2')
                .insert(ticketData);
              if (insertError) throw insertError;
            }
          }
        }
      }
    }

    // 4. 同步 Stripe（为所有 active ticket_types 创建/更新 Product/Price）
    let stripeSync: { status: string; error?: string } = { status: 'skipped' };
    try {
      if (process.env.STRIPE_SECRET_KEY) {
          await syncEventWeekStripe(eventWeekId);
          stripeSync = { status: 'success' };
      } else {
          stripeSync = { status: 'failed', error: 'Missing STRIPE_SECRET_KEY' };
      }
    } catch (stripeError: any) {
      console.error('Stripe sync error (non-fatal):', stripeError);
      stripeSync = { status: 'failed', error: stripeError.message || String(stripeError) };
    }

    // 5. 返回更新后的配置
    const { data: finalResult, error: finalError } = await supabase.rpc(
      'rpc_get_or_create_event_week',
      {
        p_event_id: eventId,
        p_for_date: week_start_date,
        p_timezone: 'America/New_York',
      }
    );

    if (finalError || !finalResult || finalResult.length === 0) {
      return NextResponse.json(
        { error: 'Failed to fetch updated week', details: finalError?.message },
        { status: 500 }
      );
    }

    // Fetch Event Status
    const { data: eventData } = await supabase
        .from('events_v2')
        .select('status')
        .eq('id', eventId)
        .single();

    return NextResponse.json({
      event_week_id: finalResult[0].event_week_id,
      week_start_date: finalResult[0].week_start_date,
      days: finalResult[0].days,
      event_status: eventData?.status || 'draft',
      stripe_sync: stripeSync
    });
  } catch (error: any) {
    console.error('Error in PUT /api/admin/events-v2/[id]/week:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
