/**
 * GET /api/admin/orders
 * Admin Orders List API
 * 返回订单列表（支持搜索、筛选）
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
    const status = searchParams.get('status') || '';
    const merchant = searchParams.get('merchant') || '';
    const dateRange = searchParams.get('dateRange') || '7'; // 默认最近7天
    
    // 计算时间范围
    const now = new Date();
    const daysAgo = parseInt(dateRange) || 7;
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    
    // 构建查询
    // 注意：orders 通过 order_items -> events 关联
    let ordersQuery = supabase
      .from('orders')
      .select(`
        id,
        status,
        amount_cents,
        currency,
        created_at,
        user_id
      `)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);
    
    // 状态筛选
    if (status && status !== 'all') {
      // 映射状态值
      const statusMap: Record<string, string> = {
        'paid': 'paid',
        'pending': 'created',
        'refunded': 'refunded',
        'failed': 'expired',
      };
      const mappedStatus = statusMap[status] || status;
      ordersQuery = ordersQuery.eq('status', mappedStatus);
    }
    
    const { data: orders, error: ordersError } = await ordersQuery;
    
    if (ordersError) {
      console.error('[ADMIN ORDERS API] Error:', ordersError);
      return NextResponse.json(
        { success: false, code: 'QUERY_ERROR', message: ordersError.message },
        { status: 500 }
      );
    }
    
    // 获取用户信息（批量）
    const userIds = [...new Set((orders || []).map((order: any) => order.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', userIds);
    
    const profileMap: Record<string, any> = {};
    (profiles || []).forEach((profile: any) => {
      profileMap[profile.id] = profile;
    });
    
    // 获取 order_items 和 events 信息（批量）
    const orderIds = (orders || []).map((o: any) => o.id);
    
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('order_id, event_id')
      .in('order_id', orderIds);
    
    const eventIds = [...new Set((orderItems || []).map((item: any) => item.event_id))];
    
    const { data: events } = await supabase
      .from('events')
      .select('id, title, merchant_id, merchants!inner(id, name)')
      .in('id', eventIds);
    
    // 构建映射
    const orderIdToEventIds: Record<string, string[]> = {};
    (orderItems || []).forEach((item: any) => {
      if (!orderIdToEventIds[item.order_id]) {
        orderIdToEventIds[item.order_id] = [];
      }
      orderIdToEventIds[item.order_id].push(item.event_id);
    });
    
    const eventIdToEvent: Record<string, any> = {};
    (events || []).forEach((event: any) => {
      eventIdToEvent[event.id] = event;
    });
    
    // 处理订单数据（合并相同订单的不同 order_items）
    const orderMap: Record<string, any> = {};
    
    (orders || []).forEach((order: any) => {
      const orderId = order.id;
      const eventIds = orderIdToEventIds[orderId] || [];
      const relatedEvents = eventIds.map((eid: string) => eventIdToEvent[eid]).filter(Boolean);
      const firstEvent = relatedEvents[0];
      const merchant = firstEvent?.merchants;
      
      if (!orderMap[orderId]) {
        orderMap[orderId] = {
          id: order.id,
          status: order.status,
          amountCents: order.amount_cents,
          currency: order.currency,
          createdAt: order.created_at,
          userId: order.user_id,
          user: profileMap[order.user_id] || null,
          events: relatedEvents.map((e: any) => ({ id: e.id, title: e.title })),
          merchants: new Set<string>(),
        };
      }
      
      relatedEvents.forEach((event: any) => {
        if (event.merchants) {
          orderMap[orderId].merchants.add(event.merchants.id);
        }
      });
    });
    
    // 转换为数组并处理
    const ordersWithDetails = Object.values(orderMap).map((order: any) => {
      // 获取第一个商家（如果多个则取第一个）
      const merchantIds = Array.from(order.merchants);
      const firstEvent = order.events[0];
      
      // 商家筛选（通过 events）
      if (merchant) {
        if (!merchantIds.includes(merchant)) {
          return null; // 过滤掉
        }
      }
      
      // 搜索筛选（按订单ID、用户名、事件标题）
      if (query) {
        const matchesId = order.id.toLowerCase().includes(query.toLowerCase());
        const matchesUser = order.user?.display_name?.toLowerCase().includes(query.toLowerCase());
        const matchesEvent = order.events.some((e: any) => e.title.toLowerCase().includes(query.toLowerCase()));
        
        if (!matchesId && !matchesUser && !matchesEvent) {
          return null; // 过滤掉
        }
      }
      
      return {
        id: order.id,
        status: order.status,
        amount: order.amountCents / 100,
        amountFormatted: `$${(order.amountCents / 100).toFixed(2)}`,
        currency: order.currency,
        createdAt: order.created_at,
        user: order.user ? {
          id: order.user.id,
          name: order.user.display_name || 'Unknown',
          avatar: order.user.avatar_url,
        } : null,
        event: firstEvent ? {
          id: firstEvent.id,
          title: firstEvent.title,
        } : null,
        merchantId: merchantIds[0] || null,
        eventCount: order.events.length,
      };
    }).filter((o): o is NonNullable<typeof o> => o !== null);
    
    // 获取所有商家列表（用于筛选）
    const { data: merchants } = await supabase
      .from('merchants')
      .select('id, name')
      .eq('status', 'active')
      .order('name');
    
    return NextResponse.json({
      success: true,
      data: {
        orders: ordersWithDetails,
        merchants: merchants || [],
      },
    });
  } catch (error: any) {
    console.error('[ADMIN ORDERS API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
