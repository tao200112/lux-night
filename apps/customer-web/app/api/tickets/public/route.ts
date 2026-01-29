
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 此接口公开，用于 Staff App 扫码后查询票据详情，或三连击页面预加载
// 不使用 cookie auth，只认 Service Role (如果需绕过 RLS) 或 Anon (如果 RLS 配置了 public 查)
// 鉴于 tickets 表通常 private，这里使用 Admin Client 比较稳妥，只暴露非敏感信息

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token is required', code: 'MISSING_TOKEN' }, { status: 400 });
  }

  // 使用 Service Role 安全查询
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // 查询 Ticket + Event V2 + Venue + Merchant
  const { data: ticket, error } = await supabaseAdmin
    .from('tickets')
    .select(`
      id,
      status,
      ticket_type_id_v2,
      redeemed_count,
      redeem_limit,
      valid_start_at,
      valid_end_at,
      public_token,
      created_at,
      updated_at,
      event_id_v2,
      user_id,
      qr_seed,
      ticket_name_snapshot,
      price_paid_cents_snapshot,
      events_v2:events_v2!tickets_events_v2_id_fkey (
        title,
        poster_url,
        merchant:merchants!events_v2_merchant_id_fkey (name),
        venue:venues!events_v2_venue_id_fkey (name, city, address)
      ),
      start_at:valid_start_at
    `)
    .eq('public_token', token)
    .maybeSingle();

  if (error) {
    console.error('[GET /api/tickets/public] DB Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', code: 'DB_ERROR' }, { status: 500 });
  }

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  // 整理返回数据，去除敏感 ID，确保 Venue 格式统一
  const ev = Array.isArray(ticket.events_v2) ? ticket.events_v2[0] : ticket.events_v2;
  const ven = ev?.venue ? (Array.isArray(ev.venue) ? ev.venue[0] : ev.venue) : null;
  const mer = ev?.merchant ? (Array.isArray(ev.merchant) ? ev.merchant[0] : ev.merchant) : null;

  // Venue Logic: Venue Name || Merchant + City
  const venueCity = ven?.city || (ven?.address ? ven.address.split(',').pop()?.trim() : '') || 'City TBD';
  const venueDisplayName = ven?.name || (mer?.name ? `${mer.name} (${venueCity})` : 'Location TBD');

  // Validity Logic (for frontend UI preview)
  const now = new Date();
  const validStart = ticket.valid_start_at ? new Date(ticket.valid_start_at) : null;
  const validEnd = ticket.valid_end_at ? new Date(ticket.valid_end_at) : null;
  
  // Basic status projection
  let computedStatus = ticket.status;
  if (validEnd && now > validEnd && ticket.status === 'active') {
      computedStatus = 'expired';
  }

  const earlyMins = parseInt(process.env.REDEEM_EARLY_MINUTES || '0', 10);
  const lateMins = parseInt(process.env.REDEEM_LATE_MINUTES || '30', 10);

  return NextResponse.json({
    ticket: {
      id: ticket.id,
      status: computedStatus, 
      db_status: ticket.status,
      eventName: ev?.title || 'Unknown Event',
      venueName: venueDisplayName,
      ticketName: ticket.ticket_name_snapshot || 'Ticket',
      validStartAt: ticket.valid_start_at,
      validEndAt: ticket.valid_end_at,
      redeemedCount: ticket.redeemed_count,
      redeemLimit: ticket.redeem_limit,
      posterUrl: ev?.poster_url || null,
      token: ticket.public_token
    },
    meta: {
      serverTime: now.toISOString(),
      timezone: 'America/New_York', // Fixed for display
      testConfig: {
         earlyMinutes: earlyMins,
         lateMinutes: lateMins,
         isTestMode: earlyMins > 0
      }
    }
  });
}
