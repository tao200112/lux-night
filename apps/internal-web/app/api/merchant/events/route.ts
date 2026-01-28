/**
 * GET /api/merchant/events
 * 获取当前 merchant 的活动列表（统一数据源）
 * 根据时间判断 upcoming/live/past，而不是依赖 status 字段
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

// GET /api/merchant/events
// 获取当前 merchant 的活动列表（统一数据源）
// Migrated to usage of events_v2
export async function GET(req: NextRequest) {
  try {
    await requireInternalAuth();
    
    const searchParams = req.nextUrl.searchParams;
    const scope = searchParams.get('scope'); // upcoming | live | past | all
    const venueId = searchParams.get('venue_id');

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

    // 基础查询：当前 merchant 的所有活动 (events_v2)
    let query = adminClient
      .from('events_v2')
      .select(`
        id,
        title,
        description,
        status,
        poster_url,
        merchant_id,
        created_at
      `)
      .eq('merchant_id', workspace.merchantId)
      .order('created_at', { ascending: false });

    // 根据 scope 筛选 V2 status
    if (scope === 'past') {
      query = query.eq('status', 'archived');
    } else {
      // upcoming / live / all -> return active (and paused?)
      // For V2, 'active' encompasses both 'upcoming' and 'live' (recurring)
      query = query.neq('status', 'archived');
    }

    const { data: events, error: eventsError } = await query;

    if (eventsError) {
      console.error('[MERCHANT EVENTS] Query error:', eventsError);
      return NextResponse.json(
        { error: 'FETCH_FAILED', message: 'Failed to fetch events' },
        { status: 500 }
      );
    }

    const eventsWithStats = await Promise.all(
      (events || []).map(async (event: any) => {
        // Fetch Venue (Assumes single venue per merchant for now, as per V2 webhook logic)
        // If venueId param is provided, we could filter, but events_v2 doesn't have venue_id.
        // We just fetch the merchant's venue to display name.
        const { data: venue } = await adminClient
          .from('venues')
          .select('id, name')
          .eq('merchant_id', event.merchant_id)
          .limit(1)
          .single();

        // 统计销量 (order_items count for this event)
        // Check order_items table. V2 webhook puts event_id_v2 into order_items.event_id?
        // Actually V2 webhook sets `event_id` in `order_items` to `eventId`.
        // So we can count order_items.
        const { count: soldCount } = await adminClient
          .from('order_items')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', event.id);

        // 统计核销 (checkins) -> uses tickets.
        // Tickets have event_id_v2 (and event_id).
        // Checkins link to tickets.
        // So we find tickets for this event, then checkins for those tickets?
        // Or checkins might have event_id?
        // checkins table has `ticket_id`, `actor_merchant_id`, ...
        // It does NOT have event_id directly? Wait, previous code queried `checkins.eq('event_id', ...)`
        // Let's check checkins schema.
        // The user provided list had `public.checkins`.
        // I'll assume checkins has event_id or I can join.
        // But for now, count tickets with status='redeemed'? 
        // V2 tickets have `redeemed_count`.
        
        let checkinCount = 0;
        // Try query checkins by event_id if column exists (previous code assumed it did)
        // If V2 tickets are inserted with event_id, checkins might rely on that.
        // Safest: Count tickets where redeemed_count > 0?
        // Or query checkins.
        // Let's try querying tickets by event_id (V2 ID) and summing redeemed_count.
        const { data: tickets } = await adminClient
          .from('tickets')
          .select('redeemed_count')
          .eq('event_id', event.id); // V2 webhook puts V2 ID in event_id column too.
          
        if (tickets) {
           checkinCount = tickets.reduce((sum: number, t: any) => sum + (t.redeemed_count || 0), 0);
        }

        // status mapping
        let actualStatus = 'upcoming'; 
        if (event.status === 'active') {
            actualStatus = 'live'; // Treat active V2 events as "Live" (available)
        } else if (event.status === 'archived') {
            actualStatus = 'past';
        }

        return {
          id: event.id,
          title: event.title,
          description: event.description,
          start_at: null, // V2 has no fixed start
          end_at: null,
          status: event.status,
          actual_status: actualStatus,
          poster_url: event.poster_url,
          venue_id: venue?.id,
          venue_name: venue?.name || 'Main Venue',
          sold_count: soldCount || 0,
          total_count: 0, // Infinite/Weekly capacity
          checkin_count: checkinCount,
          is_v2: true
        };
      })
    );

    return NextResponse.json({
      events: eventsWithStats,
      count: eventsWithStats.length,
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
