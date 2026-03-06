/**
 * GET/PUT /api/admin/events/[id]/templates
 *
 * Admin-only CRUD for event_day_templates + ticket_type_templates.
 * PUT saves to template tables ONLY — never writes to instance tables.
 * Stripe sync runs after save; failure is non-blocking (warning returned).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncTemplateStripe } from '@/lib/stripe/template-sync';
import {
  rateLimitOrResponse,
  rateLimitPolicies,
  withRateLimitHeaders,
} from '@lux-night/security';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await rateLimitOrResponse(req, rateLimitPolicies.sensitivePost, {
    userId: 'anon',
  });
  if ('response' in rl) return rl.response;

  const authResult = await requireAdmin();
  if ('error' in authResult) return authResult.error;

  try {
    const { id: eventId } = await params;
    const supabase = createAdminClient();

    const { data: templateDays, error } = await supabase
      .from('event_day_templates')
      .select(`
        id,
        dow,
        enabled,
        start_time,
        end_time,
        end_next_day,
        ticket_type_templates (
          id, name, category, price_cents, currency,
          min_age, inventory_limit, status, sort_order,
          stripe_product_id, stripe_price_id
        )
      `)
      .eq('event_id', eventId)
      .order('dow');

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch templates', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      event_id: eventId,
      days: templateDays ?? [],
    });
  } catch (error: any) {
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
  const rl = await rateLimitOrResponse(req, rateLimitPolicies.sensitivePost, {
    userId: 'anon',
  });
  if ('response' in rl) return rl.response;

  const authResult = await requireAdmin();
  if ('error' in authResult) return authResult.error;

  try {
    const { id: eventId } = await params;
    const body = await req.json();
    const { days } = body;

    if (!days || typeof days !== 'object') {
      return NextResponse.json(
        { error: 'Missing required field: days' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Validate event exists
    const { data: event, error: eventErr } = await supabase
      .from('events_v2')
      .select('id')
      .eq('id', eventId)
      .single();

    if (eventErr || !event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    // Process each day (0–6)
    for (const [dowStr, dayData] of Object.entries(days)) {
      const dow = parseInt(dowStr);
      if (isNaN(dow) || dow < 0 || dow > 6) continue;

      const dayConfig = dayData as any;

      // Upsert event_day_template
      const { data: templateDay, error: dayErr } = await supabase
        .from('event_day_templates')
        .upsert(
          {
            event_id: eventId,
            dow,
            enabled: dayConfig.enabled ?? false,
            start_time: dayConfig.start_time || '16:00',
            end_time: dayConfig.end_time || '02:00',
            end_next_day: dayConfig.end_next_day ?? true,
          },
          { onConflict: 'event_id,dow' }
        )
        .select('id')
        .single();

      if (dayErr || !templateDay) {
        console.error(`Template day ${dow} upsert failed:`, dayErr);
        continue;
      }

      // Process tickets
      if (dayConfig.tickets && Array.isArray(dayConfig.tickets)) {
        for (const ticket of dayConfig.tickets) {
          if (ticket.action === 'delete' && ticket.id) {
            await supabase
              .from('ticket_type_templates')
              .delete()
              .eq('id', ticket.id);
          } else if (ticket.action === 'upsert') {
            const ticketData: any = {
              event_day_template_id: templateDay.id,
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
                .from('ticket_type_templates')
                .update(ticketData)
                .eq('id', ticket.id);
            } else {
              await supabase
                .from('ticket_type_templates')
                .insert(ticketData);
            }
          }
        }
      }
    }

    // Stripe sync (non-blocking on failure)
    let stripeSync: { status: string; synced?: number; errors?: string[] } = {
      status: 'skipped',
    };
    try {
      if (process.env.STRIPE_SECRET_KEY) {
        const syncResult = await syncTemplateStripe(eventId);
        stripeSync = {
          status: syncResult.errors.length > 0 ? 'partial' : 'success',
          synced: syncResult.synced,
          errors: syncResult.errors.length > 0 ? syncResult.errors : undefined,
        };
      } else {
        stripeSync = { status: 'skipped', errors: ['Missing STRIPE_SECRET_KEY'] };
      }
    } catch (stripeError: any) {
      stripeSync = {
        status: 'failed',
        errors: [stripeError.message || String(stripeError)],
      };
    }

    // Return updated templates
    const { data: updatedDays } = await supabase
      .from('event_day_templates')
      .select(`
        id, dow, enabled, start_time, end_time, end_next_day,
        ticket_type_templates (
          id, name, category, price_cents, currency,
          min_age, inventory_limit, status, sort_order,
          stripe_product_id, stripe_price_id
        )
      `)
      .eq('event_id', eventId)
      .order('dow');

    return NextResponse.json({
      success: true,
      event_id: eventId,
      days: updatedDays ?? [],
      stripe_sync: stripeSync,
    });
  } catch (error: any) {
    console.error('Template save error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
