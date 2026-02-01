/**
 * POST /api/admin/debug/complete-order
 * Manually complete a pending order (for testing/debugging)
 */

import { NextRequest, NextResponse } from 'next/server';
import { handlerWrapper, requireAdmin, withTimeout } from '@/lib/admin/api';
import { randomBytes } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 30000;

export const POST = handlerWrapper(async (request: NextRequest): Promise<NextResponse> => {
    try {
        const authResult = await withTimeout(requireAdmin(request), TIMEOUT_MS, 'auth');
        if ('status' in authResult) return authResult.response;
        const { adminClient } = authResult;

        const body = await request.json();
        const { orderId } = body;

        if (!orderId) {
            return NextResponse.json({ ok: false, error: 'Missing orderId' }, { status: 400 });
        }

        // Fetch order
        const { data: order, error: orderError } = await adminClient
            .from('orders')
            .select('id, user_id, status, event_v2_id, invite_id, invite_code')
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
        }

        if (order.status === 'fulfilled') {
            return NextResponse.json({ ok: true, message: 'Order already fulfilled', skipped: true });
        }

        // Fetch order items
        const { data: orderItems, error: itemsError } = await adminClient
            .from('order_items')
            .select('*')
            .eq('order_id', orderId);

        if (itemsError || !orderItems || orderItems.length === 0) {
            return NextResponse.json({ ok: false, error: 'Order items not found' }, { status: 404 });
        }

        // Check if tickets already exist
        const { data: existingTickets } = await adminClient
            .from('tickets')
            .select('id')
            .eq('order_id', orderId);

        if (existingTickets && existingTickets.length > 0) {
            // Just update order status
            await adminClient
                .from('orders')
                .update({ status: 'fulfilled' })
                .eq('id', orderId);

            return NextResponse.json({ 
                ok: true, 
                message: 'Tickets already exist, order marked as fulfilled',
                ticketCount: existingTickets.length 
            });
        }

        // Generate tickets
        const tickets = [];
        
        for (const orderItem of orderItems) {
            const { data: ticketType } = await adminClient
                .from('ticket_types_v2')
                .select(`
                    *,
                    event_week_days!inner (
                        id,
                        dow,
                        enabled,
                        start_time,
                        end_time,
                        end_next_day
                    )
                `)
                .eq('id', orderItem.ticket_type_id)
                .single();

            if (!ticketType) continue;

            const day = ticketType.event_week_days;
            if (!day) continue;

            // Use snapshot validity if available
            const valid_start_at = orderItem.valid_start_at;
            const valid_end_at = orderItem.valid_end_at;
            const dayId = orderItem.event_week_day_id || day.id;

            if (!valid_start_at || !valid_end_at) {
                console.error('Missing validity window for order item', orderItem.id);
                continue;
            }

            // Get venue_id
            const { data: eventV2 } = await adminClient
                .from('events_v2')
                .select('id, merchant_id')
                .eq('id', order.event_v2_id)
                .single();

            if (!eventV2) continue;

            const { data: venue } = await adminClient
                .from('venues')
                .select('id')
                .eq('merchant_id', eventV2.merchant_id)
                .limit(1)
                .single();

            const venueId = venue?.id || null;

            // Generate tickets
            for (let i = 0; i < orderItem.quantity; i++) {
                const qrSeed = randomBytes(16).toString('hex');
                const publicToken = randomBytes(16).toString('hex') + randomBytes(4).toString('hex');

                tickets.push({
                    order_id: orderId,
                    user_id: order.user_id,
                    event_id: order.event_v2_id,
                    event_id_v2: order.event_v2_id,
                    venue_id: venueId,
                    ticket_type_id: orderItem.ticket_type_id,
                    ticket_type_id_v2: orderItem.ticket_type_id,
                    event_week_id: orderItem.event_week_id,
                    event_week_day_id: dayId,
                    valid_start_at: valid_start_at,
                    valid_end_at: valid_end_at,
                    ticket_name_snapshot: ticketType.name,
                    price_paid_cents_snapshot: ticketType.price_cents,
                    currency_snapshot: ticketType.currency || 'usd',
                    min_age_snapshot: ticketType.min_age,
                    policy_snapshot: {
                        category: ticketType.category,
                        inventory_limit: ticketType.inventory_limit,
                    },
                    qr_seed: qrSeed,
                    public_token: publicToken,
                    status: 'active',
                    redeem_limit: 1,
                    redeemed_count: 0,
                });
            }
        }

        if (tickets.length === 0) {
            return NextResponse.json({ ok: false, error: 'No tickets generated' }, { status: 500 });
        }

        // Insert tickets
        const { error: ticketsError } = await adminClient
            .from('tickets')
            .insert(tickets);

        if (ticketsError) {
            return NextResponse.json({ ok: false, error: `Failed to create tickets: ${ticketsError.message}` }, { status: 500 });
        }

        // Increment invite usage if applicable
        if (order.invite_id) {
            const { data: currentInvite } = await adminClient
                .from('ambassador_invites')
                .select('uses_count')
                .eq('id', order.invite_id)
                .single();

            if (currentInvite) {
                await adminClient
                    .from('ambassador_invites')
                    .update({ uses_count: currentInvite.uses_count + 1 })
                    .eq('id', order.invite_id);
            }
        }

        // Update order status
        await adminClient
            .from('orders')
            .update({ status: 'paid' })
            .eq('id', orderId);

        await adminClient
            .from('orders')
            .update({ status: 'fulfilled' })
            .eq('id', orderId);

        return NextResponse.json({
            ok: true,
            message: 'Order completed successfully',
            ticketCount: tickets.length,
            inviteIncremented: !!order.invite_id
        });

    } catch (e: any) {
        console.error('[DEBUG COMPLETE ORDER]', e);
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
});
