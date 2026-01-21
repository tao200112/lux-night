/**
 * GET /api/admin/merchants
 * POST /api/admin/merchants
 * Admin Merchants API
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
    
    let merchantsQuery = supabase
      .from('merchants')
      .select(`
        id,
        name,
        status,
        created_at,
        regions!inner(
          id,
          name,
          state,
          country
        )
      `)
      .order('created_at', { ascending: false });
    
    if (status && status !== 'all') {
      merchantsQuery = merchantsQuery.eq('status', status);
    }
    
    if (region) {
      merchantsQuery = merchantsQuery.eq('region_id', region);
    }
    
    if (query) {
      merchantsQuery = merchantsQuery.ilike('name', `%${query}%`);
    }
    
    const { data: merchants, error: merchantsError } = await merchantsQuery;
    
    if (merchantsError) {
      console.error('[ADMIN MERCHANTS API] Error:', merchantsError);
      return NextResponse.json(
        { success: false, code: 'QUERY_ERROR', message: merchantsError.message },
        { status: 500 }
      );
    }
    
    // 获取统计数据
    const merchantsWithStats = await Promise.all(
      (merchants || []).map(async (merchant: any) => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        // 通过 order_items -> events 关联获取订单和收入
        const { data: ordersData } = await supabase
          .from('orders')
          .select('total_cents, order_items!inner(event_id, events!inner(merchant_id))')
          .gte('created_at', thirtyDaysAgo.toISOString())
          .eq('status', 'completed');
        
        // 过滤出属于该商家的订单
        const merchantOrders = (ordersData || []).filter((order: any) => {
          const orderItems = order.order_items || [];
          return orderItems.some((item: any) => {
            const eventData = Array.isArray(item.events) ? item.events[0] : item.events;
            return eventData && eventData.merchant_id === merchant.id;
          });
        });
        
        const revenue = merchantOrders.reduce((sum: number, order: any) => sum + (order.total_cents || 0), 0);
        
        // 获取活跃事件数
        const { count: activeEventsCount } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('merchant_id', merchant.id)
          .eq('status', 'published')
          .gte('end_at', new Date().toISOString());
        
        return {
          id: merchant.id,
          name: merchant.name,
          status: merchant.status,
          region: merchant.regions && Array.isArray(merchant.regions) && merchant.regions.length > 0 ? {
            id: merchant.regions[0].id,
            name: merchant.regions[0].name,
            state: merchant.regions[0].state,
            country: merchant.regions[0].country,
          } : null,
          stats: {
            ordersCount: merchantOrders.length,
            revenue: revenue / 100,
            revenueFormatted: `$${(revenue / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
            activeEvents: activeEventsCount || 0,
          },
          createdAt: merchant.created_at,
        };
      })
    );
    
    // 获取所有地区列表
    const { data: regions } = await supabase
      .from('regions')
      .select('id, name, state, country')
      .eq('is_active', true)
      .order('name');
    
    return NextResponse.json({
      success: true,
      data: {
        merchants: merchantsWithStats,
        regions: regions || [],
      },
    });
  } catch (error: any) {
    console.error('[ADMIN MERCHANTS API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/merchants
 * Create merchant invite code
 */
export async function POST(request: NextRequest) {
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
    
    const body = await request.json();
    const { merchantId, regionId, role, expiresDays } = body;
    
    if (!merchantId && !regionId) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: 'Either merchantId or regionId is required' },
        { status: 400 }
      );
    }
    
    // 调用 create-merchant invite API
    const response = await fetch(`${request.nextUrl.origin}/api/admin/invites/create-merchant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        merchantId: merchantId || null,
        regionId: regionId || null,
        role: role || 'owner',
        expiresDays: expiresDays || 30,
        createdByUserId: user.id,
      }),
    });
    
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      return NextResponse.json(
        { success: false, code: result.error || 'CREATE_FAILED', message: result.message || 'Failed to create merchant invite' },
        { status: response.status || 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: {
        token: result.token,
        merchantId: result.merchant_id,
        regionId: result.region_id,
        message: 'Merchant invite code created successfully',
      },
    });
  } catch (error: any) {
    console.error('[ADMIN MERCHANTS CREATE INVITE API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
