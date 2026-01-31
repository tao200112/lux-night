/**
 * GET /api/admin/ambassadors
 * POST /api/admin/ambassadors
 * 
 * Manage Ambassadors
 */

import { NextRequest, NextResponse } from 'next/server';
import { handlerWrapper, requireAdmin, withTimeout, type ApiResponse } from '@/lib/admin/api';


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 15000;

export const GET = handlerWrapper(async (request: NextRequest): Promise<NextResponse> => {
   let step = 'init';
   try {
       step = 'auth';
       const authResult = await withTimeout(requireAdmin(request), TIMEOUT_MS, 'auth');
       if ('status' in authResult) return authResult.response;
       const { adminClient } = authResult;
       
       const searchParams = request.nextUrl.searchParams;
       const merchantId = searchParams.get('merchantId');
       
       let query = adminClient.from('ambassadors')
           .select(`
                id, display_name, status, created_at, 
                merchant_id, 
                merchants:merchants(id, name),
                invites:ambassador_invites(id, code, uses_count, max_uses, status)
           `)
           .order('created_at', { ascending: false });
           
       if (merchantId) {
           query = query.eq('merchant_id', merchantId);
       }
       
       step = 'fetch';
       const { data, error } = await query;
       if (error) throw error;
       
       // Transform
       const ambassadors = (data || []).map((a: any) => ({
           id: a.id,
           name: a.display_name,
           status: a.status,
           merchant: a.merchants ? { id: a.merchants.id, name: a.merchants.name } : null,
           codes: (a.invites || []).map((i: any) => ({
               id: i.id,
               code: i.code,
               used: i.uses_count,
               max: i.max_uses,
               active: i.status === 'active'
           })),
           createdAt: a.created_at
       }));
       
       return NextResponse.json<ApiResponse>({ ok: true, data: ambassadors, step });
       
   } catch (e: any) {
       console.error('[ADMIN AMBASSADORS GET]', e);
       return NextResponse.json({ ok: false, error: e.message, code: 'INTERNAL_ERROR' }, { status: 500 });
   }
});

export const POST = handlerWrapper(async (request: NextRequest): Promise<NextResponse> => {
    let step = 'init';
    try {
        step = 'auth';
        const authResult = await withTimeout(requireAdmin(request), TIMEOUT_MS, 'auth');
        if ('status' in authResult) return authResult.response;
        const { adminClient } = authResult;
        
        const body = await request.json();
        const { merchantId, name } = body;
        
        if (!merchantId || !name) {
            return NextResponse.json({ ok: false, error: 'Missing fields' }, { status: 400 });
        }
        
        step = 'create_ambassador';
        const { data: amb, error: ambError } = await adminClient
            .from('ambassadors')
            .insert({
                merchant_id: merchantId,
                display_name: name,
                status: 'active'
            })
            .select()
            .single();
            
        if (ambError) throw ambError;
        
        // Optionally create a default code automatically?
        // Let's create one based on name + random
        step = 'create_default_code';
        const codeBase = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 6);
        const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const defaultCode = `${codeBase}${randomSuffix}`;
        
        const { data: inv, error: invError } = await adminClient
            .from('ambassador_invites')
            .insert({
                ambassador_id: amb.id,
                merchant_id: merchantId,
                code: defaultCode,
                max_uses: null, // Unlimited by default
                status: 'active'
            })
            .select()
            .single();
            
        if (invError) {
            console.warn('Failed to create default code', invError);
            // Don't fail the whole request, return ambassador
        }
        
        return NextResponse.json<ApiResponse>({ 
            ok: true, 
            data: { 
                ambassador: amb,
                defaultInvite: inv
            }, 
            step 
        });
        
    } catch (e: any) {
        console.error('[ADMIN AMBASSADORS POST]', e);
        return NextResponse.json({ ok: false, error: e.message, code: 'INTERNAL_ERROR' }, { status: 500 });
    }
});
