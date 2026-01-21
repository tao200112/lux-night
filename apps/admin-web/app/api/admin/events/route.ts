/**
 * GET /api/admin/events
 * Admin Events List API
 * 返回事件列表（支持搜索、筛选）
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 检查 Admin 权限
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' },
        { status: 401 }
      );
    }
    
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', message: 'Must be admin' },
        { status: 403 }
      );
    }
    
    // 获取查询参数
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    const region = searchParams.get('region') || '';
    const status = searchParams.get('status') || '';
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const lowRedemption = searchParams.get('lowRedemption') === 'true';
    const pendingApproval = searchParams.get('pendingApproval') === 'true';
    
    // 构建查询
    let eventsQuery = supabase
      .from('events')
      .select(`
        id,
        title,
        status,
        start_at,
        end_at,
        created_at,
        merchants!inner(
          id,
          name
        ),
        venues!inner(
          id,
          name,
          regions!inner(
            id,
            name,
            state,
            country
          )
        )
      `)
      .order('created_at', { ascending: false });
    
    // 状态筛选
    if (status && status !== 'all') {
      eventsQuery = eventsQuery.eq('status', status);
    }
    
    // Active Only 筛选
    if (activeOnly) {
      eventsQuery = eventsQuery.eq('status', 'published').gte('end_at', new Date().toISOString());
    }
    
    // 地区筛选
    if (region) {
      eventsQuery = eventsQuery.eq('venues.region_id', region);
    }
    
    // 搜索筛选（按事件标题或商家名称）
    if (query) {
      eventsQuery = eventsQuery.or(`title.ilike.%${query}%,merchants.name.ilike.%${query}%`);
    }
    
    const { data: events, error: eventsError } = await eventsQuery.limit(100);
    
    if (eventsError) {
      console.error('[ADMIN EVENTS API] Error:', eventsError);
      return NextResponse.json(
        { success: false, code: 'QUERY_ERROR', message: eventsError.message },
        { status: 500 }
      );
    }
    
    // 获取统计数据（价格、销量、赎回率等）
    const eventsWithStats = await Promise.all(
      (events || []).map(async (event: any) => {
        // 获取票种信息（最低价格）
        const { data: ticketTypes } = await supabase
          .from('ticket_types')
          .select('price_cents, inventory_limit, sold_count')
          .eq('event_id', event.id)
          .eq('is_active', true)
          .order('price_cents', { ascending: true })
          .limit(1);
        
        const minPrice = ticketTypes && ticketTypes.length > 0 ? ticketTypes[0].price_cents : 0;
        const inventoryLimit = ticketTypes && ticketTypes.length > 0 ? (ticketTypes[0].inventory_limit || 0) : 0;
        const soldCount = ticketTypes && ticketTypes.length > 0 ? (ticketTypes[0].sold_count || 0) : 0;
        
        // 计算总销量（所有票种）
        const { data: allTicketTypes } = await supabase
          .from('ticket_types')
          .select('sold_count')
          .eq('event_id', event.id);
        
        const totalSold = (allTicketTypes || []).reduce((sum, tt) => sum + (tt.sold_count || 0), 0);
        
        // 计算赎回率（已使用的票数 / 已售出的票数）
        const { data: tickets } = await supabase
          .from('tickets')
          .select('id, status, redeemed_count, redeem_limit')
          .eq('event_id', event.id);
        
        const totalRedeemed = (tickets || []).reduce((sum, ticket) => sum + (ticket.redeemed_count || 0), 0);
        const redemptionRate = totalSold > 0 ? Math.round((totalRedeemed / totalSold) * 100) : 0;
        
        // 判断是否低库存
        const isLowInventory = inventoryLimit > 0 && soldCount >= inventoryLimit * 0.9;
        
        // 判断是否低赎回率（< 50%）
        const isLowRedemption = redemptionRate < 50;
        
        // 如果有 Pending Approval 筛选
        if (pendingApproval) {
          const { count } = await supabase
            .from('requests')
            .select('*', { count: 'exact', head: true })
            .eq('type', 'new_event')
            .eq('status', 'pending')
            .contains('payload', { event_id: event.id });
          
          if (!count || count === 0) {
            return null; // 过滤掉
          }
        }
        
        // 如果有 Low Redemption 筛选
        if (lowRedemption && !isLowRedemption) {
          return null; // 过滤掉
        }
        
        return {
          id: event.id,
          title: event.title,
          status: event.status,
          merchant: event.merchants && Array.isArray(event.merchants) && event.merchants.length > 0 ? {
            id: event.merchants[0].id,
            name: event.merchants[0].name,
          } : null,
          venue: event.venues && Array.isArray(event.venues) && event.venues.length > 0 ? {
            id: event.venues[0].id,
            name: event.venues[0].name,
            region: event.venues[0].regions && Array.isArray(event.venues[0].regions) && event.venues[0].regions.length > 0 ? {
              id: event.venues[0].regions[0].id,
              name: event.venues[0].regions[0].name,
              state: event.venues[0].regions[0].state,
              country: event.venues[0].regions[0].country,
            } : null,
          } : null,
          stats: {
            minPrice: minPrice / 100, // 转换为美元
            priceFormatted: `$${(minPrice / 100).toFixed(2)}`,
            totalSold,
            redemptionRate,
            isLowInventory,
            isLowRedemption,
          },
          startAt: event.start_at,
          endAt: event.end_at,
          createdAt: event.created_at,
        };
      })
    );
    
    // 过滤掉 null（不符合筛选条件的）
    const filteredEvents = eventsWithStats.filter((e): e is NonNullable<typeof e> => e !== null);
    
    // 获取所有地区列表（用于筛选）
    const { data: regions } = await supabase
      .from('regions')
      .select('id, name, state, country')
      .eq('is_active', true)
      .order('name');
    
    return NextResponse.json({
      success: true,
      data: {
        events: filteredEvents,
        regions: regions || [],
      },
    });
  } catch (error: any) {
    console.error('[ADMIN EVENTS API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
