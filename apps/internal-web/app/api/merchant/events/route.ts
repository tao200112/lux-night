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

    const now = new Date().toISOString();

    // 基础查询：当前 merchant 的所有活动
    let query = adminClient
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
        venues:venue_id (
          id,
          name
        )
      `)
      .eq('merchant_id', workspace.merchantId)
      .order('start_at', { ascending: false });

    // 根据 scope 筛选
    if (scope === 'upcoming') {
      // upcoming: start_at > now
      query = query.gt('start_at', now);
    } else if (scope === 'live') {
      // live: start_at <= now && end_at >= now
      query = query.lte('start_at', now).gte('end_at', now);
    } else if (scope === 'past') {
      // past: end_at < now
      query = query.lt('end_at', now);
    }
    // scope === 'all' 或未指定：返回所有

    // 可选的 venue 筛选
    if (venueId) {
      query = query.eq('venue_id', venueId);
    } else if (workspace.venueId) {
      query = query.eq('venue_id', workspace.venueId);
    }

    const { data: events, error: eventsError } = await query;

    if (eventsError) {
      console.error('[MERCHANT EVENTS] Query error:', eventsError);
      return NextResponse.json(
        { error: 'FETCH_FAILED', message: 'Failed to fetch events' },
        { status: 500 }
      );
    }

    // 为每个活动获取票务和核销数据
    const eventsWithStats = await Promise.all(
      (events || []).map(async (event: any) => {
        // 获取票务数据
        const { data: tickets } = await adminClient
          .from('tickets')
          .select('id, status')
          .eq('event_id', event.id);

        const soldCount = tickets?.filter((t: any) => t.status === 'sold').length || 0;
        const totalCount = tickets?.length || 0;

        // 获取核销数据
        const { data: checkins } = await adminClient
          .from('checkins')
          .select('id')
          .eq('event_id', event.id)
          .eq('result', 'OK')
          .eq('success', true);

        const checkinCount = checkins?.length || 0;

        // 根据时间判断实际状态
        const startAt = new Date(event.start_at);
        const endAt = new Date(event.end_at);
        const nowDate = new Date();
        let actualStatus = 'upcoming';
        if (startAt <= nowDate && endAt >= nowDate) {
          actualStatus = 'live';
        } else if (endAt < nowDate) {
          actualStatus = 'past';
        }

        return {
          id: event.id,
          title: event.title,
          description: event.description,
          start_at: event.start_at,
          end_at: event.end_at,
          status: event.status, // 数据库原始状态
          actual_status: actualStatus, // 根据时间计算的状态
          poster_url: event.poster_url,
          venue_id: event.venue_id,
          venue_name: event.venues?.name || 'Unknown',
          sold_count: soldCount,
          total_count: totalCount,
          checkin_count: checkinCount,
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
