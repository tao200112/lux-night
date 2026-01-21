/**
 * GET /api/admin/orders/[orderId]
 * Admin Order Detail API
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
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
    
    // 获取订单详情
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        profiles!orders_user_id_fkey(
          id,
          display_name,
          email,
          phone,
          avatar_url
        ),
        events!inner(
          id,
          title,
          start_at,
          end_at,
          venue_id,
          venues(
            id,
            name,
            address
          ),
          merchant_id,
          merchants!inner(
            id,
            name
          )
        )
      `)
      .eq('id', orderId)
      .single();
    
    if (orderError || !order) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Order not found' },
        { status: 404 }
      );
    }
    
    // 获取订单项（tickets）
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select(`
        id,
        quantity,
        price_cents,
        ticket_types(
          id,
          name,
          category
        )
      `)
      .eq('order_id', orderId);
    
    // 获取关联的 tickets
    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets')
      .select(`
        id,
        qr_seed,
        status,
        ticket_type_id,
        ticket_types(
          id,
          name
        )
      `)
      .eq('order_id', orderId);
    
    // 格式化响应
    return NextResponse.json({
      success: true,
      data: {
        id: order.id,
        total: order.total_cents / 100,
        totalFormatted: `$${(order.total_cents / 100).toFixed(2)}`,
        status: order.status,
        customer: order.profiles ? {
          id: order.profiles.id,
          name: order.profiles.display_name || 'Unknown',
          email: order.profiles.email,
          phone: order.profiles.phone,
          avatar: order.profiles.avatar_url,
        } : null,
        event: (() => {
          const eventData = Array.isArray(order.events) ? order.events[0] : order.events;
          return eventData ? {
            id: eventData.id,
            title: eventData.title,
            startAt: eventData.start_at,
            endAt: eventData.end_at,
          } : null;
        })(),
        venue: (() => {
          const eventData = Array.isArray(order.events) ? order.events[0] : order.events;
          if (!eventData) return null;
          const venueData = Array.isArray(eventData.venues) ? eventData.venues[0] : eventData.venues;
          return venueData ? {
            id: venueData.id,
            name: venueData.name,
            address: venueData.address,
          } : null;
        })(),
        merchant: (() => {
          const eventData = Array.isArray(order.events) ? order.events[0] : order.events;
          if (!eventData) return null;
          const merchants = eventData.merchants;
          if (!merchants || !Array.isArray(merchants) || merchants.length === 0) return null;
          return {
            id: merchants[0].id,
            name: merchants[0].name,
          };
        })(),
        items: (orderItems || []).map((item: any) => ({
          id: item.id,
          quantity: item.quantity,
          price: item.price_cents / 100,
          ticketType: item.ticket_types ? {
            id: item.ticket_types.id,
            name: item.ticket_types.name,
            category: item.ticket_types.category,
          } : null,
        })),
        tickets: (tickets || []).map((ticket: any) => ({
          id: ticket.id,
          qrSeed: ticket.qr_seed,
          status: ticket.status,
          ticketType: ticket.ticket_types ? {
            id: ticket.ticket_types.id,
            name: ticket.ticket_types.name,
          } : null,
        })),
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN ORDER DETAIL API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
