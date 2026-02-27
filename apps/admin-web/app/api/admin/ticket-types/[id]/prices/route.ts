/**
 * Ticket Type Prices API (Per-Day Pricing)
 * GET  /api/admin/ticket-types/[id]/prices - 获取票种的按天定价
 * PUT  /api/admin/ticket-types/[id]/prices - 更新票种的按天定价
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

interface DayPrice {
  day_of_week: number; // 0=Sunday, 6=Saturday
  is_enabled: boolean;
  price_cents: number;
  quantity_limit?: number | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const { id: ticketTypeId } = await params;
    const admin = createAdminClient();

    // 获取票种信息
    const { data: ticketType, error: ttError } = await admin
      .from('ticket_types')
      .select('id, name, price_cents, event_id')
      .eq('id', ticketTypeId)
      .single();

    if (ttError || !ticketType) {
      return NextResponse.json({ success: false, error: 'Ticket type not found' }, { status: 404 });
    }

    // 获取按天定价
    const { data: prices, error: pricesError } = await admin
      .from('ticket_type_prices')
      .select('*')
      .eq('ticket_type_id', ticketTypeId)
      .order('day_of_week', { ascending: true });

    if (pricesError) {
      console.error('[TICKET PRICES GET] Error:', pricesError);
      return NextResponse.json({ success: false, error: pricesError.message }, { status: 500 });
    }

    // 生成完整的 7 天定价（使用默认价格填充缺失的天）
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayPrices = Array.from({ length: 7 }, (_, i) => {
      const existing = prices?.find(p => p.day_of_week === i);
      return {
        day_of_week: i,
        day_name: dayNames[i],
        is_enabled: existing?.is_enabled ?? true,
        price_cents: existing?.price_cents ?? ticketType.price_cents ?? 0,
        quantity_limit: existing?.quantity_limit ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        ticket_type_id: ticketTypeId,
        ticket_type_name: ticketType.name,
        default_price_cents: ticketType.price_cents,
        prices: dayPrices,
      },
    });
  } catch (e: any) {
    console.error('[TICKET PRICES GET]', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rl = await rateLimitOrResponse(req, rateLimitPolicies.sensitivePost, { userId: 'anon' });
    if ('response' in rl) return rl.response;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const { id: ticketTypeId } = await params;
    const body = await req.json();
    const { prices } = body as { prices: DayPrice[] };

    if (!prices || !Array.isArray(prices)) {
      return NextResponse.json({ success: false, error: 'prices array is required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // 验证票种存在
    const { data: ticketType, error: ttError } = await admin
      .from('ticket_types')
      .select('id')
      .eq('id', ticketTypeId)
      .single();

    if (ttError || !ticketType) {
      return NextResponse.json({ success: false, error: 'Ticket type not found' }, { status: 404 });
    }

    // 使用 upsert 更新/插入定价
    const pricesToUpsert = prices
      .filter(p => p.day_of_week >= 0 && p.day_of_week <= 6)
      .map(p => ({
        ticket_type_id: ticketTypeId,
        day_of_week: p.day_of_week,
        is_enabled: p.is_enabled ?? true,
        price_cents: Math.max(0, Math.round(p.price_cents)),
        quantity_limit: p.quantity_limit ?? null,
      }));

    if (pricesToUpsert.length > 0) {
      const { error: upsertError } = await admin
        .from('ticket_type_prices')
        .upsert(pricesToUpsert, {
          onConflict: 'ticket_type_id,day_of_week',
        });

      if (upsertError) {
        console.error('[TICKET PRICES PUT] Upsert error:', upsertError);
        return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ticket_type_id: ticketTypeId,
        prices_updated: pricesToUpsert.length,
        message: 'Ticket prices updated successfully',
      },
    });
  } catch (e: any) {
    console.error('[TICKET PRICES PUT]', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
