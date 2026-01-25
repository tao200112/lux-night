/**
 * GET /api/tickets/public?token=
 * 公开查票（无需登录），用于 /t/[token] 扫码页
 * 返回最小字段：eventName, venueName, startTime, entryBefore, accessTier, status, ticketId(尾号)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token || token.length < 10) {
    return NextResponse.json({ error: 'Invalid ticket' }, { status: 404 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: row, error } = await supabase
    .from('tickets')
    .select(`
      id,
      status,
      redeemed_at,
      redeemed_by,
      events!inner(title, start_at, end_at, venues!inner(name)),
      ticket_types!inner(name)
    `)
    .eq('public_token', token)
    .maybeSingle();

  if (error) {
    console.error('[tickets/public]', error);
    return NextResponse.json({ error: 'Invalid ticket' }, { status: 404 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Invalid ticket' }, { status: 404 });
  }

  const e = (row as any).events;
  const tt = (row as any).ticket_types;
  const event = Array.isArray(e) ? e[0] : e;
  const ticketType = Array.isArray(tt) ? tt[0] : tt;
  const v = event?.venues;
  const venue = Array.isArray(v) ? v[0] : v;

  const startAt = event?.start_at;
  const entryBefore = event?.end_at ?? startAt;

  const body = {
    eventName: event?.title || '—',
    venueName: venue?.name || '—',
    startTime: startAt || null,
    entryBefore: entryBefore || null,
    accessTier: ticketType?.name || '—',
    status: (row as any).status,
    ticketId: String((row as any).id).slice(-8),
    redeemedAt: (row as any).redeemed_at || null,
    redeemedBy: (row as any).redeemed_by || null,
  };

  return NextResponse.json(body);
}
