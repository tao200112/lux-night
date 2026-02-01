/**
 * GET /api/stripe/webhook/health
 * Check webhook configuration and recent events
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function GET(request: NextRequest) {
  try {
    // Check environment variables
    const config = {
      hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      hasStripeSecretKey: !!process.env.STRIPE_SECRET_KEY,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    };

    // Check recent webhook events
    const { data: recentEvents, error: eventsError } = await supabaseAdmin
      .from('stripe_webhook_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (eventsError) {
      console.error('Error fetching webhook events:', eventsError);
    }

    // Check pending orders
    const { data: pendingOrders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id, created_at, amount_cents, status, stripe_checkout_session_id')
      .eq('status', 'pending_payment')
      .order('created_at', { ascending: false })
      .limit(10);

    if (ordersError) {
      console.error('Error fetching pending orders:', ordersError);
    }

    return NextResponse.json({
      ok: true,
      config,
      recentWebhookEvents: recentEvents || [],
      pendingOrders: pendingOrders || [],
      summary: {
        webhookEventsCount: recentEvents?.length || 0,
        pendingOrdersCount: pendingOrders?.length || 0,
        configComplete: Object.values(config).every(v => v === true),
      },
      recommendations: [
        !config.hasWebhookSecret && 'Set STRIPE_WEBHOOK_SECRET environment variable',
        !config.hasStripeSecretKey && 'Set STRIPE_SECRET_KEY environment variable',
        (pendingOrders?.length || 0) > 0 && `${pendingOrders?.length} orders stuck in pending_payment`,
        (recentEvents?.length || 0) === 0 && 'No webhook events received - check Stripe webhook configuration',
      ].filter(Boolean),
    });
  } catch (e: any) {
    console.error('[WEBHOOK HEALTH CHECK]', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
