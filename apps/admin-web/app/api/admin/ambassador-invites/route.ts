/**
 * POST /api/admin/ambassador-invites
 * Create new invite code for ambassador
 */

import { NextRequest, NextResponse } from 'next/server';
import { handlerWrapper, requireAdmin, withTimeout, type ApiResponse } from '@/lib/admin/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 15000;

export const POST = handlerWrapper(async (request: NextRequest): Promise<NextResponse> => {
    let step = 'init';
    try {
        step = 'auth';
        const authResult = await withTimeout(requireAdmin(request), TIMEOUT_MS, 'auth');
        if ('status' in authResult) return authResult.response;
        const { adminClient } = authResult;
        
        const body = await request.json();
        const { ambassadorId, code, maxUses } = body;
        
        if (!ambassadorId || !code) {
             return NextResponse.json({ ok: false, error: 'Missing ambassadorId or code' }, { status: 400 });
        }
        
        // Fetch ambassador to get merchant_id
        const { data: amb } = await adminClient.from('ambassadors').select('merchant_id').eq('id', ambassadorId).single();
        if (!amb) return NextResponse.json({ ok: false, error: 'Ambassador not found' }, { status: 404 });
        
        step = 'create_code';
        const { data: inv, error } = await adminClient
            .from('ambassador_invites')
            .insert({
                ambassador_id: ambassadorId,
                merchant_id: amb.merchant_id,
                code: code.toUpperCase(),
                max_uses: maxUses || null,
                is_active: true
            })
            .select()
            .single();
            
        if (error) {
            if (error.code === '23505') { // Unique violation
                 return NextResponse.json({ ok: false, error: 'Code already exists' }, { status: 400 });
            }
            throw error;
        }
        
        return NextResponse.json<ApiResponse>({ ok: true, data: inv, step });
        
    } catch (e: any) {
        console.error('[ADMIN AMBASSADOR INVITE POST]', e);
        return NextResponse.json({ ok: false, error: e.message, code: 'INTERNAL_ERROR' }, { status: 500 });
    }
});
