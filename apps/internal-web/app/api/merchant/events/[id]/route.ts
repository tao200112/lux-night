/**
 * GET /api/merchant/events/[id]
 * 获取单个活动详情（校验属于当前 merchant）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// 使用 service role key 创建 admin client（绕过 RLS）
const getAdminClient = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireInternalAuth();
    const { id } = await params;

    // 获取当前workspace
    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: 'SERVER_ERROR', message: 'Server configuration error' },
        { status: 500 }
      );
    }

    // 获取活动详情，并校验属于当前 merchant
    const { data: event, error: eventError } = await adminClient
      .from('events')
      .select(`
        id,
        title,
        description,
        start_at,
        end_at,
        status,
        poster_url,
        venue_id,
        merchant_id,
        age_policy,
        refund_policy,
        venues:venue_id (
          id,
          name,
          address
        )
      `)
      .eq('id', id)
      .eq('merchant_id', workspace.merchantId)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Event not found or does not belong to your merchant' },
        { status: 404 }
      );
    }

    // 获取票种数据
    const { data: ticketTypes } = await adminClient
      .from('ticket_types')
      .select('id, name, price_cents, quantity_available, quantity_sold')
      .eq('event_id', id);

    // 获取票务统计
    const { data: tickets } = await adminClient
      .from('tickets')
      .select('id, status')
      .eq('event_id', id);

    const soldCount = tickets?.filter((t: any) => t.status === 'sold').length || 0;
    const totalCount = tickets?.length || 0;

    // 获取核销统计
    const { data: checkins } = await adminClient
      .from('checkins')
      .select('id')
      .eq('event_id', id)
      .eq('result', 'OK')
      .eq('success', true);

    const checkinCount = checkins?.length || 0;

    // 计算总收入（从 orders 表）
    const orderIds = tickets?.map((t: any) => t.order_id).filter(Boolean) || [];
    let totalRevenue = 0;
    if (orderIds.length > 0) {
      const { data: orders } = await adminClient
        .from('orders')
        .select('amount_cents')
        .in('id', orderIds)
        .eq('status', 'paid');
      
      totalRevenue = orders?.reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0) || 0;
    }

    return NextResponse.json({
      event: {
        ...event,
        venue: event.venues,
        ticket_types: ticketTypes || [],
        tickets_sold: soldCount,
        tickets_total: totalCount,
        checkins_count: checkinCount,
        total_revenue: totalRevenue,
      },
    });

  } catch (error: any) {
    console.error('[MERCHANT EVENTS] Unexpected error:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
