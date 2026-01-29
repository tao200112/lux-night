/**
 * POST /api/tickets/redeem
 * 核销票务（仅 staff/admin），幂等，按 public_token 查找
 * Body: { token: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let body: { token?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token || token.length < 10) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    const admin = createAdminClient(url, key, { auth: { persistSession: false } });

    // 1) 按 public_token 查票，并拿到 valid_*, events_v2.merchant_id
    // 注意：需确保 tickets.event_id 或 tickets.event_id_v2 关联了 events_v2
    const { data: ticket, error: ticketErr } = await admin
      .from('tickets')
      .select(`
        id, 
        status, 
        redeemed_at, 
        redeemed_by, 
        valid_start_at, 
        valid_end_at,
        event:events_v2!tickets_events_v2_id_fkey (
          merchant_id
        )
      `)
      .eq('public_token', token)
      .maybeSingle();

    if (ticketErr || !ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Adapt to PostgREST response (obj or array)
    const evRaw = (ticket as any).event;
    const eventV2 = Array.isArray(evRaw) ? evRaw[0] : evRaw;
    const merchantId = eventV2?.merchant_id as string | undefined;

    if (!merchantId) {
      // Fallback: Try looking up by legacy event logic if migration incomplete, or error out
      // For V2 Closed Loop, we expect V2 relation.
      console.error('[redeem] Ticket missing linked merchant (V2). Ticket ID:', ticket.id);
      return NextResponse.json({ error: 'Invalid ticket data (Merchant link missing)' }, { status: 500 });
    }

    // 2) 权限：admin_users / profiles.is_admin / merchant_members(staff|manager|owner|admin)
    const [adminRow, profileRow, memberRow] = await Promise.all([
      admin.from('admin_users').select('user_id').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
      // Robust profile check (avoid 500 if profile missing)
      admin.from('profiles').select('id').eq('id', user.id).maybeSingle(),
      admin.from('merchant_members').select('id').eq('user_id', user.id).eq('merchant_id', merchantId).eq('is_active', true).in('role', ['staff', 'manager', 'owner', 'admin']).maybeSingle(),
    ]);

    // Note: profileRow logic for admin might need specific field like 'is_admin' if it exists, or rely on admin_users table (Best Practice)
    // As per previous instruction, rely on admin_users primarily.
    const isAdmin = !!adminRow; 
    const isStaff = isAdmin || !!memberRow;

    if (!isStaff) {
      return NextResponse.json({ error: 'Only staff can redeem tickets', code: 'FORBIDDEN' }, { status: 403 });
    }

    // 3) 已 used：幂等，直接 200
    if ((ticket as any).status === 'used') {
      return NextResponse.json({
        alreadyRedeemed: true,
        ticket: {
          id: ticket.id,
          status: 'used',
          redeemed_at: ticket.redeemed_at,
          redeemed_by: ticket.redeemed_by,
        },
      });
    }

    // 3.5) Validity Window Check
    if (ticket.valid_start_at && ticket.valid_end_at) {
       const now = new Date();
       const startAt = new Date(ticket.valid_start_at);
       const endAt = new Date(ticket.valid_end_at);
       
       const earlyMins = parseInt(process.env.REDEEM_EARLY_MINUTES || '0', 10);
       const lateMins = parseInt(process.env.REDEEM_LATE_MINUTES || '30', 10);

       const redeemStart = new Date(startAt.getTime() - earlyMins * 60000);
       const redeemEnd = new Date(endAt.getTime() + lateMins * 60000);

       // Debug Log (Chinese comments for observability)
       console.log('[Redeem Debug] Time Check:', {
          token: token.slice(0, 8) + '...',
          ticketId: ticket.id,
          now_utc: now.toISOString(),
          now_epoch: now.getTime(),
          valid_start_at_utc: ticket.valid_start_at,
          valid_end_at_utc: ticket.valid_end_at,
          redeemable_from_utc: redeemStart.toISOString(),
          redeemable_to_utc: redeemEnd.toISOString(),
          config: { earlyMins, lateMins }
       });

       // 检查是否早于窗口
       if (now < redeemStart) {
         return NextResponse.json({ 
           error: 'Ticket not yet valid', 
           code: 'TOO_EARLY',
           message: '未到核销时间',
           validFrom: redeemStart.toISOString(),
           debugInfo: {
             serverNow: now.toISOString(),
             startsAt: ticket.valid_start_at,
             endsAt: ticket.valid_end_at,
             timezone: 'America/New_York' // Hint for Frontend, strictly strictly derived from venue ideally
           }
         }, { status: 422 });
       }

       // 检查是否晚于窗口
       if (now > redeemEnd) {
         return NextResponse.json({ 
           error: 'Ticket expired', 
           code: 'EXPIRED',
           message: '票据已过期',
           expiredAt: redeemEnd.toISOString(),
           debugInfo: {
             serverNow: now.toISOString(),
             startsAt: ticket.valid_start_at,
             endsAt: ticket.valid_end_at,
             timezone: 'America/New_York'
           }
         }, { status: 422 });
       }
    }

    // 4) 非 active（如 refunded/void/expired）不执行核销
    if ((ticket as any).status !== 'active') {
       return NextResponse.json({ 
           error: `Ticket cannot be redeemed (status: ${(ticket as any).status})`,
           code: 'STATUS_INVALID'
       }, { status: 409 });
    }

    // Check Limit
    const currentCount = (ticket as any).redeemed_count || 0;
    const limit = (ticket as any).redeem_limit || 1;
    if (currentCount >= limit) {
        return NextResponse.json({ 
            error: 'Redeem limit reached', 
            code: 'LIMIT_REACHED' 
        }, { status: 409 });
    }

    // 5) 原子更新
    const newCount = currentCount + 1;
    const newStatus = newCount >= limit ? 'used' : 'active';
    
    // We assume 'redeem_method' is passed in body if needed, but schema might not have it column.
    // So we just update standard fields.

    const { data: updated, error: updateErr } = await admin
      .from('tickets')
      .update({
        status: newStatus,
        redeemed_count: newCount,
        redeemed_at: new Date().toISOString(),
        redeemed_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('public_token', token)
      .eq('status', 'active') // Optimistic lock
      .select('id, status, redeemed_count, redeem_limit, redeemed_at, redeemed_by')
      .maybeSingle();

    if (updateErr) {
      console.error('[tickets/redeem] update error', updateErr);
      return NextResponse.json({ error: 'Redemption failed' }, { status: 500 });
    }

    // 并发下可能已被其他请求核销
    if (!updated) {
        // ... refetch logic ... 
      const { data: refetch } = await admin
        .from('tickets')
        .select('id, status, redeemed_at, redeemed_by, redeemed_count, redeem_limit')
        .eq('public_token', token)
        .maybeSingle();
        
      // Check if it was because of Limit Reached or Status Change
      if (refetch && refetch.redeemed_count >= (refetch.redeem_limit || 1)) {
          return NextResponse.json({
            alreadyRedeemed: true,
            code: 'LIMIT_REACHED',
            ticket: refetch
          }, { status: 409 });
      }
      
      return NextResponse.json({
        alreadyRedeemed: true,
        ticket: refetch
      });
    }

    return NextResponse.json({
      success: true,
      ticket: {
        id: updated!.id,
        status: updated!.status,
        redeemed_at: updated!.redeemed_at,
        redeemed_by: updated!.redeemed_by,
        redeemed_count: updated!.redeemed_count,
        redeem_limit: updated!.redeem_limit
      },
    });


  } catch (e: any) {
    console.error('[tickets/redeem]', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

