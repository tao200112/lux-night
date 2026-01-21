/**
 * GET /api/admin/merchants/[id]
 * Admin Merchant Detail API
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
    
    // 获取商家详情
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select(`
        *,
        regions!inner(
          id,
          name,
          state,
          country,
          status
        )
      `)
      .eq('id', id)
      .single();
    
    if (merchantError || !merchant) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Merchant not found' },
        { status: 404 }
      );
    }
    
    // 获取关联数据
    const [venuesResult, eventsResult, membersResult, ordersResult] = await Promise.all([
      // Venues
      supabase
        .from('venues')
        .select('id, name, address, is_active')
        .eq('merchant_id', id),
      
      // Events (最近 30 天)
      supabase
        .from('events')
        .select('id, title, status, start_at, end_at')
        .eq('merchant_id', id)
        .order('created_at', { ascending: false })
        .limit(10),
      
      // Members
      supabase
        .from('merchant_members')
        .select(`
          id,
          role,
          is_active,
          created_at,
          profiles!inner(
            id,
            display_name,
            email,
            avatar_url
          )
        `)
        .eq('merchant_id', id)
        .eq('is_active', true),
      
      // Orders (最近 30 天)
      supabase
        .from('orders')
        .select('id, total_cents, status, created_at')
        .eq('merchant_id', id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    
    // 计算统计数据
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const { count: totalOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('merchant_id', id)
      .gte('created_at', thirtyDaysAgo.toISOString());
    
    const { data: revenueOrders } = await supabase
      .from('orders')
      .select('total_cents')
      .eq('merchant_id', id)
      .eq('status', 'completed')
      .gte('created_at', thirtyDaysAgo.toISOString());
    
    const totalRevenue = (revenueOrders || []).reduce((sum, order) => sum + (order.total_cents || 0), 0);
    
    return NextResponse.json({
      success: true,
      data: {
        id: merchant.id,
        name: merchant.name,
        status: merchant.status,
        region: merchant.regions && Array.isArray(merchant.regions) && merchant.regions.length > 0 ? {
          id: merchant.regions[0].id,
          name: merchant.regions[0].name,
          state: merchant.regions[0].state,
          country: merchant.regions[0].country,
          status: merchant.regions[0].status,
        } : null,
        venues: (venuesResult.data || []).map((v: any) => ({
          id: v.id,
          name: v.name,
          address: v.address,
          isActive: v.is_active,
        })),
        events: Array.isArray(eventsResult.data) 
          ? eventsResult.data.map((e: any) => ({
              id: e.id,
              title: e.title,
              status: e.status,
              startAt: e.start_at,
              endAt: e.end_at,
            }))
          : [],
        members: (membersResult.data || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          isActive: m.is_active,
          user: m.profiles && Array.isArray(m.profiles) && m.profiles.length > 0 ? {
            id: m.profiles[0].id,
            name: m.profiles[0].display_name || 'Unknown',
            email: m.profiles[0].email,
            avatar: m.profiles[0].avatar_url,
          } : null,
          joinedAt: m.created_at,
        })),
        recentOrders: (ordersResult.data || []).map((o: any) => ({
          id: o.id,
          total: o.total_cents / 100,
          status: o.status,
          createdAt: o.created_at,
        })),
        stats: {
          totalOrders: totalOrders || 0,
          totalRevenue: totalRevenue / 100,
          totalRevenueFormatted: `$${(totalRevenue / 100).toLocaleString()}`,
          venuesCount: venuesResult.data?.length || 0,
          eventsCount: eventsResult.data?.length || 0,
          membersCount: membersResult.data?.length || 0,
        },
        createdAt: merchant.created_at,
        updatedAt: merchant.updated_at,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN MERCHANT DETAIL API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
