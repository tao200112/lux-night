/**
 * GET /api/orders
 * 获取该商家的历史订单（售票记录）
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal/auth';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    await requireInternalAuth();
    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return NextResponse.json({ error: 'NO_WORKSPACE', message: 'No active workspace' }, { status: 403 });
    }

    const supabase = await createClient();
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(10, parseInt(req.nextUrl.searchParams.get('limit') || '20')));
    const offset = (page - 1) * limit;

    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, amount_cents, status, created_at, invite_code, event_id')
      .eq('merchant_id', workspace.merchantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);

    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', workspace.merchantId);

    const orderIds = (orders || []).map((o: any) => o.id);
    let itemsByOrder: Record<string, { quantity: number; ticketType?: string }[]> = {};
    if (orderIds.length > 0) {
      const { data: items } = await supabase
        .from('order_items')
        .select('order_id, quantity')
        .in('order_id', orderIds);
      (items || []).forEach((oi: any) => {
        if (!itemsByOrder[oi.order_id]) itemsByOrder[oi.order_id] = [];
        itemsByOrder[oi.order_id].push({ quantity: oi.quantity || 1 });
      });
    }

    const list = (orders || []).map((o: any) => ({
      id: o.id,
      amountCents: o.amount_cents,
      amountFormatted: `$${((o.amount_cents || 0) / 100).toFixed(2)}`,
      status: o.status,
      createdAt: o.created_at,
      inviteCode: o.invite_code || null,
      tickets: (itemsByOrder[o.id] || []).reduce((s, i) => s + (i.quantity || 1), 0),
    }));

    return NextResponse.json({
      ok: true,
      data: {
        orders: list,
        total: count || 0,
        page,
        limit,
      },
    });
  } catch (error: any) {
    console.error('[ORDERS API] Error', error);
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    return NextResponse.json({ error: 'FETCH_FAILED', message: error.message }, { status: 500 });
  }
}
