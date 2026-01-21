/**
 * GET /api/admin/customers
 * Admin Customers List API
 * 返回客户列表（支持搜索、筛选）
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
    const filter = searchParams.get('filter') || 'all'; // all, active, high_spenders, recent, banned
    
    // 构建查询（从 profiles 表）
    let profilesQuery = supabase
      .from('profiles')
      .select('id, display_name, avatar_url, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    
    // 搜索筛选（按 display_name）
    if (query) {
      profilesQuery = profilesQuery.ilike('display_name', `%${query}%`);
    }
    
    const { data: profiles, error: profilesError } = await profilesQuery;
    
    if (profilesError) {
      console.error('[ADMIN CUSTOMERS API] Error:', profilesError);
      return NextResponse.json(
        { success: false, code: 'QUERY_ERROR', message: profilesError.message },
        { status: 500 }
      );
    }
    
    // 获取用户邮箱（从 auth.users）
    const userIds = (profiles || []).map((p: any) => p.id);
    
    // 获取订单统计数据
    const { data: orders } = await supabase
      .from('orders')
      .select('user_id, amount_cents, status, created_at')
      .in('user_id', userIds);
    
    // 按用户聚合统计数据
    const userStatsMap: Record<string, { ordersCount: number; lifetimeSpend: number; lastActive: string }> = {};
    
    (profiles || []).forEach((profile: any) => {
      userStatsMap[profile.id] = {
        ordersCount: 0,
        lifetimeSpend: 0,
        lastActive: profile.created_at,
      };
    });
    
    (orders || []).forEach((order: any) => {
      const userId = order.user_id;
      if (userStatsMap[userId]) {
        userStatsMap[userId].ordersCount++;
        if (order.status === 'paid' || order.status === 'fulfilled') {
          userStatsMap[userId].lifetimeSpend += order.amount_cents || 0;
        }
        // 更新最后活跃时间
        if (order.created_at > userStatsMap[userId].lastActive) {
          userStatsMap[userId].lastActive = order.created_at;
        }
      }
    });
    
    // 处理客户数据
    let customersWithStats = (profiles || []).map((profile: any) => {
      const stats = userStatsMap[profile.id] || { ordersCount: 0, lifetimeSpend: 0, lastActive: profile.created_at };
      
      return {
        id: profile.id,
        name: profile.display_name || 'Unknown',
        email: null, // profiles 表没有 email，需要从 auth.users 获取
        avatar: profile.avatar_url,
        stats: {
          ordersCount: stats.ordersCount,
          lifetimeSpend: stats.lifetimeSpend / 100, // 转换为美元
          lifetimeSpendFormatted: `$${(stats.lifetimeSpend / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          lastActive: stats.lastActive,
        },
        isActive: stats.ordersCount > 0 || new Date(stats.lastActive) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        isHighSpender: stats.lifetimeSpend >= 100000, // $1000+
        createdAt: profile.created_at,
      };
    });
    
    // 应用筛选
    if (filter === 'active') {
      customersWithStats = customersWithStats.filter(c => c.isActive);
    } else if (filter === 'high_spenders') {
      customersWithStats = customersWithStats.filter(c => c.isHighSpender);
    } else if (filter === 'recent') {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      customersWithStats = customersWithStats.filter(c => new Date(c.stats.lastActive) > sevenDaysAgo);
    } else if (filter === 'banned') {
      // TODO: 实现 banned 筛选（需要添加 banned 字段到 profiles）
      customersWithStats = [];
    }
    
    // 按最后活跃时间排序
    customersWithStats.sort((a, b) => new Date(b.stats.lastActive).getTime() - new Date(a.stats.lastActive).getTime());
    
    return NextResponse.json({
      success: true,
      data: {
        customers: customersWithStats,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN CUSTOMERS API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
