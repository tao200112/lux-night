/**
 * POST /api/admin/approvals/[id]/approve
 * Approve a merchant change request (uses merchant_change_requests, not event_change_requests)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  handlerWrapper,
  requireAdmin,
  withTimeout,
  type ApiResponse,
} from '@/lib/admin/api';
import { syncEventWeekStripe } from '@/lib/stripe/event-week-sync';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 15000;

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function applyWeekConfig(
  supabase: SupabaseClient,
  eventId: string,
  targetWeekStartDate: string,
  payload: { days?: Record<string, { enabled?: boolean; start_time?: string; end_time?: string; end_next_day?: boolean; tickets?: unknown[] }> }
): Promise<{ ok: boolean; error?: string }> {
  const { data: weekResult, error: weekError } = await supabase.rpc('rpc_get_or_create_event_week', {
    p_event_id: eventId,
    p_for_date: targetWeekStartDate,
    p_timezone: 'America/New_York',
  });

  if (weekError || !weekResult?.length) {
    console.error('[ADMIN APPROVE] Week RPC error:', weekError);
    return { ok: false, error: weekError?.message || 'Failed to get event week' };
  }

  const eventWeekId = weekResult[0].event_week_id;
  const days = payload.days || {};

  for (const [dowStr, dayData] of Object.entries(days)) {
    const dow = parseInt(dowStr);
    const dayConfig = dayData as { enabled?: boolean; start_time?: string; end_time?: string; end_next_day?: boolean; tickets?: unknown[] };

    const { data: dayRecord, error: dayError } = await supabase
      .from('event_week_days')
      .select('id, enabled, start_time, end_time, end_next_day')
      .eq('event_week_id', eventWeekId)
      .eq('dow', dow)
      .single();

    let dayId: string;
    if (dayError || !dayRecord) {
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
        .select('id')
        .single();

      if (createError || !newDay) {
        console.error('[ADMIN APPROVE] Create day error:', createError);
        continue;
      }
      dayId = newDay.id;
    } else {
      dayId = dayRecord.id;
      const existing = dayRecord as { enabled?: boolean; start_time?: string; end_time?: string; end_next_day?: boolean };
      await supabase
        .from('event_week_days')
        .update({
          enabled: dayConfig.enabled ?? existing.enabled ?? false,
          start_time: dayConfig.start_time || existing.start_time || '16:00',
          end_time: dayConfig.end_time || existing.end_time || '02:00',
          end_next_day: dayConfig.end_next_day ?? existing.end_next_day ?? true,
        })
        .eq('id', dayId);
    }

    const tickets = (dayConfig.tickets || []) as Array<{ action?: string; id?: string; name?: string; category?: string; price_cents?: number; inventory_limit?: number }>;
    for (const ticket of tickets) {
      if (ticket.action === 'delete' && ticket.id) {
        await supabase.from('ticket_types_v2').delete().eq('id', ticket.id);
      } else if (ticket.action === 'upsert') {
        const ticketData = {
          event_week_day_id: dayId,
          name: ticket.name,
          category: ticket.category || 'entry',
          price_cents: ticket.price_cents || 0,
          inventory_limit: ticket.inventory_limit ?? null,
        };
        if (ticket.id) {
          await supabase.from('ticket_types_v2').update(ticketData).eq('id', ticket.id);
        } else {
          await supabase.from('ticket_types_v2').insert({ ...ticketData, status: 'active' });
        }
      }
    }
  }

  try {
    await syncEventWeekStripe(eventWeekId);
  } catch (e) {
    console.error('[ADMIN APPROVE] Stripe sync (non-fatal):', e);
  }

  return { ok: true };
}

export const POST = handlerWrapper(async (
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse> => {
  let step = 'init';

  try {
    const rl = await rateLimitOrResponse(request, rateLimitPolicies.sensitivePost, { userId: 'anon' });
    if ('response' in rl) return rl.response as NextResponse;

    step = 'auth_check';
    const authResult = await withTimeout(requireAdmin(request), TIMEOUT_MS, 'requireAdmin');

    if ('status' in authResult) {
      return authResult.response;
    }

    const { user, adminClient } = authResult;
    step = 'params';
    const { id: requestId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const { note: review_note } = body;

    step = 'fetch';
    const { data: changeRequest, error: fetchError } = await adminClient
      .from('merchant_change_requests')
      .select('id, event_id, merchant_id, request_type, status, payload, target_week_start_date')
      .eq('id', requestId)
      .single();

    if (fetchError || !changeRequest) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Not Found', code: 'NOT_FOUND', message: 'Change request not found', step },
        { status: 404 }
      );
    }

    if (changeRequest.status === 'approved') {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { message: 'Request was already approved', already: true },
        step,
      });
    }

    if (changeRequest.status !== 'pending') {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Conflict', code: 'INVALID_STATUS', message: `Request is already ${changeRequest.status}`, step },
        { status: 409 }
      );
    }

    const payload = (changeRequest.payload || {}) as Record<string, unknown>;
    let requestType = changeRequest.request_type;
    if (requestType === 'poster') requestType = 'poster_change';
    if (requestType === 'price') requestType = 'price_change';
    if (requestType === 'inventory') requestType = 'inventory_change';
    if (requestType === 'general') requestType = 'event_edit';

    step = 'apply_changes';

    const isWeekConfig = (!requestType || requestType === 'week_config') && payload.days && changeRequest.target_week_start_date;
    if (isWeekConfig) {
      const applyResult = await applyWeekConfig(
        adminClient,
        changeRequest.event_id,
        changeRequest.target_week_start_date,
        payload as { days?: Record<string, { enabled?: boolean; start_time?: string; end_time?: string; end_next_day?: boolean; tickets?: unknown[] }> }
      );
      if (!applyResult.ok) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: 'Update Failed', code: 'APPLY_ERROR', message: applyResult.error || 'Failed to apply week config', step },
          { status: 500 }
        );
      }
    } else if (requestType === 'poster_change' && payload.poster_url) {
      const { error: updateError } = await adminClient
        .from('events_v2')
        .update({ poster_url: payload.poster_url, updated_at: new Date().toISOString() })
        .eq('id', changeRequest.event_id)
        .eq('merchant_id', changeRequest.merchant_id);
      if (updateError) {
        console.error('[ADMIN APPROVE] Poster update error:', updateError);
        return NextResponse.json<ApiResponse>({ ok: false, error: 'Update Failed', code: 'APPLY_ERROR', message: 'Failed to update poster', step }, { status: 500 });
      }
    } else if (requestType === 'price_change') {
      const updates = Array.isArray(payload.prices)
        ? (payload.prices as Array<{ ticket_type_id: string; new_price: number }>).map((p) => ({
            ticket_type_id: p.ticket_type_id,
            new_price: typeof p.new_price === 'number' ? p.new_price : Math.round(parseFloat(String(p.new_price)) * 100),
          }))
        : payload.ticket_type_id && payload.new_price !== undefined
          ? [{ ticket_type_id: payload.ticket_type_id as string, new_price: typeof payload.new_price === 'number' ? payload.new_price : Math.round(parseFloat(String(payload.new_price)) * 100) }]
          : [];
      for (const u of updates) {
        const { error: updateError } = await adminClient
          .from('ticket_types_v2')
          .update({ price_cents: u.new_price, updated_at: new Date().toISOString() })
          .eq('id', u.ticket_type_id);
        if (updateError) {
          console.error('[ADMIN APPROVE] Price update error:', updateError);
          return NextResponse.json<ApiResponse>({ ok: false, error: 'Update Failed', code: 'APPLY_ERROR', message: 'Failed to update price', step }, { status: 500 });
        }
      }
      // Sync Stripe after price change (creates new Price when price_cents changes)
      const ticketIds = [...new Set(updates.map((u) => u.ticket_type_id))];
      const { data: ticketTypes } = await adminClient
        .from('ticket_types_v2')
        .select('event_week_day_id')
        .in('id', ticketIds);
      const dayIds = ticketTypes?.map((t: any) => t.event_week_day_id).filter(Boolean) ?? [];
      if (dayIds.length > 0) {
        const { data: days } = await adminClient
          .from('event_week_days')
          .select('event_week_id')
          .in('id', dayIds);
        const weekIds = [...new Set((days ?? []).map((d: any) => d.event_week_id))];
        for (const wid of weekIds) {
          try {
            await syncEventWeekStripe(wid);
          } catch (e) {
            console.error('[ADMIN APPROVE] Stripe sync after price change (non-fatal):', e);
          }
        }
      }
    } else if (requestType === 'inventory_change') {
      const updates = Array.isArray(payload.quantities)
        ? (payload.quantities as Array<{ ticket_type_id: string; new_capacity?: number; new_inventory?: number }>).map((q) => ({
            ticket_type_id: q.ticket_type_id,
            new_capacity: q.new_capacity ?? q.new_inventory,
          }))
        : payload.ticket_type_id && (payload.new_capacity !== undefined || payload.new_inventory !== undefined)
          ? [{ ticket_type_id: payload.ticket_type_id as string, new_capacity: (payload.new_capacity ?? payload.new_inventory) as number }]
          : [];
      for (const u of updates) {
        const { error: updateError } = await adminClient
          .from('ticket_types_v2')
          .update({ inventory_limit: u.new_capacity, updated_at: new Date().toISOString() })
          .eq('id', u.ticket_type_id);
        if (updateError) {
          console.error('[ADMIN APPROVE] Inventory update error:', updateError);
          return NextResponse.json<ApiResponse>({ ok: false, error: 'Update Failed', code: 'APPLY_ERROR', message: 'Failed to update inventory', step }, { status: 500 });
        }
      }
    } else if (requestType === 'event_edit') {
      const allowedFields = ['title', 'description', 'start_at', 'end_at', 'poster_url', 'age_policy', 'refund_policy', 'status'];
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const f of allowedFields) {
        if ((payload as Record<string, unknown>)[f] !== undefined) {
          updateData[f] = (payload as Record<string, unknown>)[f];
        }
      }
      if (Object.keys(updateData).length > 1) {
        const { error: updateError } = await adminClient
          .from('events_v2')
          .update(updateData)
          .eq('id', changeRequest.event_id)
          .eq('merchant_id', changeRequest.merchant_id);
        if (updateError) {
          console.error('[ADMIN APPROVE] Event edit error:', updateError);
          return NextResponse.json<ApiResponse>({ ok: false, error: 'Update Failed', code: 'APPLY_ERROR', message: 'Failed to update event', step }, { status: 500 });
        }
      }
    } else if (!isWeekConfig && !['poster_change', 'price_change', 'inventory_change', 'event_edit'].includes(requestType || '')) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'Bad Request', code: 'INVALID_REQUEST_TYPE', message: `Unknown request_type: ${requestType}`, step }, { status: 400 });
    }

    step = 'update_status';
    const { error: updateError } = await adminClient
      .from('merchant_change_requests')
      .update({
        status: 'approved',
        reviewed_by_admin: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: review_note || null,
      })
      .eq('id', requestId)
      .eq('status', 'pending');

    if (updateError) {
      console.error('[ADMIN APPROVE] Update status error:', updateError);
      return NextResponse.json<ApiResponse>({ ok: false, error: 'Database Error', code: 'UPDATE_STATUS_ERROR', message: 'Failed to update request status', step }, { status: 500 });
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { message: 'Request approved successfully' },
      step: 'success',
    });
  } catch (error: any) {
    console.error('[ADMIN APPROVE] Error:', error);
    if (error.message?.includes('[TIMEOUT]')) {
      return NextResponse.json<ApiResponse>({ ok: false, error: 'Timeout', code: 'TIMEOUT', message: error.message, step }, { status: 504 });
    }
    return NextResponse.json<ApiResponse>({ ok: false, error: 'Internal Error', code: 'INTERNAL_ERROR', message: error.message, step }, { status: 500 });
  }
});
