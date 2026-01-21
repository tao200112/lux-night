/**
 * GET /api/admin/customers/[customerId]
 * Admin Customer Detail API
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId } = await params;
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
    
    // 获取客户详情
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        *,
        auth_users:auth.users!profiles_id_fkey(
          id,
          email,
          created_at,
          email_confirmed_at
        )
      `)
      .eq('id', customerId)
      .single();
    
    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Customer not found' },
        { status: 404 }
      );
    }
    
    // 获取订单历史
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        total_cents,
        status,
        created_at,
        events(
          id,
          title,
          start_at
        )
      `)
      .eq('user_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20);
    
    // 获取票务历史
    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets')
      .select(`
        id,
        status,
        created_at,
        events(
          id,
          title,
          start_at
        ),
        ticket_types(
          id,
          name,
          category
        )
      `)
      .eq('user_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20);
    
    // 计算统计数据
    const { count: totalOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', customerId);
    
    const { data: revenueOrders } = await supabase
      .from('orders')
      .select('total_cents')
      .eq('user_id', customerId)
      .eq('status', 'completed');
    
    const totalSpent = (revenueOrders || []).reduce((sum, order) => sum + (order.total_cents || 0), 0);
    
    return NextResponse.json({
      success: true,
      data: {
        id: profile.id,
        name: profile.display_name || 'Unknown',
        email: profile.auth_users?.email || null,
        avatar: profile.avatar_url,
        phone: profile.phone,
        region: profile.last_region_id,
        stats: {
          totalOrders: totalOrders || 0,
          totalSpent: totalSpent / 100,
          totalSpentFormatted: `$${(totalSpent / 100).toLocaleString()}`,
          ticketsCount: tickets?.length || 0,
        },
        orders: (orders || []).map((o: any) => ({
          id: o.id,
          total: o.total_cents / 100,
          status: o.status,
          event: o.events && (Array.isArray(o.events) ? o.events[0] : o.events) ? {
            id: Array.isArray(o.events) ? o.events[0].id : o.events.id,
            title: Array.isArray(o.events) ? o.events[0].title : o.events.title,
            startAt: Array.isArray(o.events) ? o.events[0].start_at : o.events.start_at,
          } : null,
          createdAt: o.created_at,
        })),
        tickets: (tickets || []).map((t: any) => ({
          id: t.id,
          status: t.status,
          event: t.events && (Array.isArray(t.events) ? t.events[0] : t.events) ? {
            id: Array.isArray(t.events) ? t.events[0].id : t.events.id,
            title: Array.isArray(t.events) ? t.events[0].title : t.events.title,
            startAt: Array.isArray(t.events) ? t.events[0].start_at : t.events.start_at,
          } : null,
          ticketType: t.ticket_types && (Array.isArray(t.ticket_types) ? t.ticket_types[0] : t.ticket_types) ? {
            id: Array.isArray(t.ticket_types) ? t.ticket_types[0].id : t.ticket_types.id,
            name: Array.isArray(t.ticket_types) ? t.ticket_types[0].name : t.ticket_types.name,
            category: Array.isArray(t.ticket_types) ? t.ticket_types[0].category : t.ticket_types.category,
          } : null,
          createdAt: t.created_at,
        })),
        createdAt: profile.auth_users?.created_at || profile.created_at,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN CUSTOMER DETAIL API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
