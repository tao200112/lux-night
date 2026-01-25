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

    // 1) 按 public_token 查票，并拿到 event.merchant_id
    const { data: ticket, error: ticketErr } = await admin
      .from('tickets')
      .select('id, status, redeemed_at, redeemed_by, event_id, events!inner(merchant_id)')
      .eq('public_token', token)
      .maybeSingle();

    if (ticketErr || !ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const ev = (ticket as any).events;
    const event = Array.isArray(ev) ? ev[0] : ev;
    const merchantId = event?.merchant_id as string | undefined;
    if (!merchantId) {
      return NextResponse.json({ error: 'Invalid ticket data' }, { status: 500 });
    }

    // 2) 权限：admin_users / profiles.is_admin / merchant_members(staff|manager|owner|admin)
    const [adminRow, profileRow, memberRow] = await Promise.all([
      admin.from('admin_users').select('user_id').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
      admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle(),
      admin.from('merchant_members').select('id').eq('user_id', user.id).eq('merchant_id', merchantId).eq('is_active', true).in('role', ['staff', 'manager', 'owner', 'admin']).maybeSingle(),
    ]);

    const isStaff = !!(adminRow || (profileRow as any)?.is_admin === true || memberRow);
    if (!isStaff) {
      return NextResponse.json({ error: 'Only staff can redeem tickets', code: 'FORBIDDEN' }, { status: 403 });
    }

    // 3) 已 used：幂等，直接 200
    if ((ticket as any).status === 'used') {
      return NextResponse.json({
        alreadyRedeemed: true,
        ticket: {
          id: (ticket as any).id,
          status: 'used',
          redeemed_at: (ticket as any).redeemed_at,
          redeemed_by: (ticket as any).redeemed_by,
        },
      });
    }

    // 4) 非 active（如 refunded/void/expired）不执行核销
    if ((ticket as any).status !== 'active') {
      return NextResponse.json({ error: `Ticket cannot be redeemed (status: ${(ticket as any).status})` }, { status: 400 });
    }

    // 5) 原子更新：仅当 status='active' 时更新，保证并发下只成功一次
    const { data: updated, error: updateErr } = await admin
      .from('tickets')
      .update({
        status: 'used',
        redeemed_at: new Date().toISOString(),
        redeemed_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('public_token', token)
      .eq('status', 'active')
      .select('id, status, redeemed_at, redeemed_by')
      .maybeSingle();

    if (updateErr) {
      console.error('[tickets/redeem] update error', updateErr);
      return NextResponse.json({ error: 'Redemption failed' }, { status: 500 });
    }

    // 并发下可能已被其他请求核销，此时 updated 为空，再查一次按“已核销”返回
    if (!updated) {
      const { data: refetch } = await admin
        .from('tickets')
        .select('id, status, redeemed_at, redeemed_by')
        .eq('public_token', token)
        .maybeSingle();
      return NextResponse.json({
        alreadyRedeemed: true,
        ticket: refetch ? { id: refetch.id, status: refetch.status, redeemed_at: refetch.redeemed_at, redeemed_by: refetch.redeemed_by } : undefined,
      });
    }

    return NextResponse.json({
      ticket: {
        id: updated.id,
        status: updated.status,
        redeemed_at: updated.redeemed_at,
        redeemed_by: updated.redeemed_by,
      },
    });
  } catch (e: any) {
    console.error('[tickets/redeem]', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
