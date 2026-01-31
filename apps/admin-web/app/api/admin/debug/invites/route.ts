/**
 * Debug Page for Ambassador Invites
 * /api/admin/debug/invites
 */

import { NextRequest, NextResponse } from 'next/server';
import { handlerWrapper, requireAdmin, withTimeout } from '@/lib/admin/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 15000;

export const GET = handlerWrapper(async (request: NextRequest): Promise<NextResponse> => {
    try {
        const authResult = await withTimeout(requireAdmin(request), TIMEOUT_MS, 'auth');
        if ('status' in authResult) return authResult.response;
        const { adminClient } = authResult;

        // Check recent orders with invite data
        const { data: orders, error: ordersError } = await adminClient
            .from('orders')
            .select('id, created_at, amount_cents, status, merchant_id, invite_code, invite_id, ambassador_id')
            .order('created_at', { ascending: false })
            .limit(20);

        if (ordersError) throw ordersError;

        // Check all ambassadors
        const { data: ambassadors, error: ambError } = await adminClient
            .from('ambassadors')
            .select('*');

        if (ambError) throw ambError;

        // Check all invites
        const { data: invites, error: invError } = await adminClient
            .from('ambassador_invites')
            .select('*');

        if (invError) throw invError;

        return NextResponse.json({
            ok: true,
            data: {
                recentOrders: orders,
                ambassadors,
                invites,
                summary: {
                    totalOrders: orders?.length || 0,
                    ordersWithInvite: orders?.filter(o => o.invite_id).length || 0,
                    totalAmbassadors: ambassadors?.length || 0,
                    totalInvites: invites?.length || 0,
                }
            }
        });
    } catch (e: any) {
        console.error('[DEBUG INVITES]', e);
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
});
