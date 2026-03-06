/**
 * GET /api/admin/overview
 * Admin Dashboard Overview API
 * 
 * Update 2026-02-01:
 * - Supports Ambassador Invites.
 * - Uses orders.merchant_id as source of truth.
 * - Adds Top Invites / Top Ambassadors / Unlinked Orders stats.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handlerWrapper, requireAdmin, withTimeout, type ApiResponse } from '@/lib/admin/api';
import { getNYStartOfDay } from '@lux-night/shared/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 20000;

export const GET = handlerWrapper(async (request: NextRequest): Promise<NextResponse> => {
  let step = 'init';

  try {
    // STEP 1: Auth Check
    step = 'auth_check';
    const authResult = await withTimeout(
      requireAdmin(request),
      TIMEOUT_MS,
      'requireAdmin'
    );

    if ('status' in authResult) {
      return authResult.response;
    }

    const { adminClient } = authResult;
    step = 'auth_ok';

    // Parse Date Range (Default 30 days)
    const searchParams = request.nextUrl.searchParams;
    const rangeDays = parseInt(searchParams.get('dateRange') || '30');
    
    // Dates
    const now = new Date();
    const todayStart = new Date(getNYStartOfDay(now));

    const rangeStart = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);
    const previousRangeStart = new Date(now.getTime() - (rangeDays * 2) * 24 * 60 * 60 * 1000);
    
    // FETCH ORDERS with new fields
    step = 'fetch_orders';
    const { data: allOrders, error: ordersError } = await adminClient
      .from('orders')
      .select('id, amount_cents, status, created_at, merchant_id, invite_id, ambassador_id')
      .gte('created_at', previousRangeStart.toISOString())
      .in('status', ['paid', 'fulfilled', 'completed']);

    if (ordersError) throw new Error(`Orders query failed: ${ordersError.message}`);
    const orders = allOrders || [];

    // Memory Partition
    const currentOrders = orders.filter((o: any) => new Date(o.created_at) >= rangeStart);
    const previousOrders = orders.filter((o: any) => {
        const d = new Date(o.created_at);
        return d >= previousRangeStart && d < rangeStart;
    });
    
    const todayOrders = currentOrders.filter((o: any) => new Date(o.created_at) >= todayStart);
    
    // Previous day calculation for trend
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);
    yesterdayEnd.setMilliseconds(-1);
    const yesterdayOrders = orders.filter((o: any) => {
        const d = new Date(o.created_at);
        return d >= yesterdayStart && d <= yesterdayEnd;
    });

    // KPI Calculation
    step = 'calc_kpis';
    const totalRevenueCents = currentOrders.reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0);
    const previousRevenueCents = previousOrders.reduce((sum: number, o: any) => sum + (o.amount_cents || 0), 0);
    
    const ordersCount = todayOrders.length;
    const previousOrdersCount = yesterdayOrders.length;

    const calculateTrend = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);
    
    const revenueTrend = calculateTrend(totalRevenueCents, previousRevenueCents);
    const ordersTrend = calculateTrend(ordersCount, previousOrdersCount);

    // Unlinked Orders
    const unlinkedOrdersCount = currentOrders.filter((o: any) => !o.merchant_id).length;

    // Aggregations
    step = 'aggregations';
    
    // 1. Revenue By Merchant
    const merchantAgg: Record<string, { revenue: number; count: number }> = {};
    // 2. Top Invites
    const inviteAgg: Record<string, { revenue: number; count: number; invite_id: string }> = {};
    // 3. Top Ambassadors
    const ambassadorAgg: Record<string, { revenue: number; count: number; ambassador_id: string }> = {};

    currentOrders.forEach((o: any) => {
        // Merchant
        if (o.merchant_id) {
            if (!merchantAgg[o.merchant_id]) merchantAgg[o.merchant_id] = { revenue: 0, count: 0 };
            merchantAgg[o.merchant_id].revenue += o.amount_cents;
            merchantAgg[o.merchant_id].count++;
        }
        
        // Invite
        if (o.invite_id) {
            if (!inviteAgg[o.invite_id]) inviteAgg[o.invite_id] = { revenue: 0, count: 0, invite_id: o.invite_id };
            inviteAgg[o.invite_id].revenue += o.amount_cents;
            inviteAgg[o.invite_id].count++;
        }
        
        // Ambassador
        if (o.ambassador_id) {
             if (!ambassadorAgg[o.ambassador_id]) ambassadorAgg[o.ambassador_id] = { revenue: 0, count: 0, ambassador_id: o.ambassador_id };
             ambassadorAgg[o.ambassador_id].revenue += o.amount_cents;
             ambassadorAgg[o.ambassador_id].count++;
        }
    });

    // Process Top Lists Logic
    // Get Top 5 IDs for each
    const topMerchantIds = Object.keys(merchantAgg).sort((a,b) => merchantAgg[b].revenue - merchantAgg[a].revenue).slice(0, 5);
    const topInviteIds = Object.keys(inviteAgg).sort((a,b) => inviteAgg[b].revenue - inviteAgg[a].revenue).slice(0, 5);
    const topAmbassadorIds = Object.keys(ambassadorAgg).sort((a,b) => ambassadorAgg[b].revenue - ambassadorAgg[a].revenue).slice(0, 5);

    // FETCH METADATA
    step = 'fetch_metadata';
    const pMerchants = topMerchantIds.length > 0 
        ? adminClient.from('merchants').select('id, name').in('id', topMerchantIds)
        : Promise.resolve({ data: [] });
        
    const pInvites = topInviteIds.length > 0
        ? adminClient.from('ambassador_invites').select('id, code, merchant_id, ambassador:ambassadors(display_name)').in('id', topInviteIds)
        : Promise.resolve({ data: [] });

    // For ambassadors, we fetch from ambassadors table
    const pAmbassadors = topAmbassadorIds.length > 0
        ? adminClient.from('ambassadors').select('id, display_name, merchant_id').in('id', topAmbassadorIds)
        : Promise.resolve({ data: [] });

    const [merchantsRes, invitesRes, ambassadorsRes, allMerchantsRes] = await Promise.all([
        pMerchants, 
        pInvites, 
        pAmbassadors,
        // Also fetch all merchants for mapping invites/ambassadors to merchant names if needed, 
        // but for top lists usually we just want the entity name. 
        // Let's optimize: map merchant IDs from invites/ambassadors to fetch their names too.
        Promise.resolve({ data: [] })
    ]);
    
    const merchantsMap = (merchantsRes.data || []).reduce((acc: any, m: any) => { acc[m.id] = m; return acc; }, {});
    
    // Need names for merchant_id in invites/ambuls
    const extraMerchantIds = new Set<string>();
    (invitesRes.data || []).forEach((i: any) => extraMerchantIds.add(i.merchant_id));
    (ambassadorsRes.data || []).forEach((a: any) => extraMerchantIds.add(a.merchant_id));
    
    // If we have extra merchants not in top 5, fetch them
    const missingMerchantIds = [...extraMerchantIds].filter(id => !merchantsMap[id]);
    if (missingMerchantIds.length > 0) {
        const { data: moreMerchants } = await adminClient.from('merchants').select('id, name').in('id', missingMerchantIds);
        (moreMerchants || []).forEach((m: any) => merchantsMap[m.id] = m);
    }
    
    // Assemble Lists
    step = 'assemble_lists';
    
    const revenueByMerchant = topMerchantIds.map(id => ({
        merchantId: id,
        merchantName: merchantsMap[id]?.name || 'Unknown',
        revenueCents: merchantAgg[id].revenue,
        ordersCount: merchantAgg[id].count
    }));
    
    const topInvites = topInviteIds.map(id => {
        const inv = (invitesRes.data || []).find((i: any) => i.id === id);
        return {
            inviteId: id,
            code: inv?.code || '???',
            // @ts-ignore
            ambassadorName: inv?.ambassador?.display_name || 'Unknown',
            merchantName: merchantsMap[inv?.merchant_id]?.name || 'Unknown',
            revenueCents: inviteAgg[id].revenue,
            ordersCount: inviteAgg[id].count
        };
    });
    
    const topAmbassadors = topAmbassadorIds.map(id => {
        const amb = (ambassadorsRes.data || []).find((a: any) => a.id === id);
        return {
            ambassadorId: id,
            ambassadorName: amb?.display_name || 'Unknown',
            merchantName: merchantsMap[amb?.merchant_id]?.name || 'Unknown',
            revenueCents: ambassadorAgg[id].revenue,
            ordersCount: ambassadorAgg[id].count
        };
    });

    // Format helpers
    const formatCurrency = (cents: number) => `$${(cents/100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    step = 'success';
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        totalRevenueCents,
        totalRevenueFormatted: formatCurrency(totalRevenueCents),
        revenueTrend,
        
        totalOrders: currentOrders.length, // Total in period
        
        ordersToday: ordersCount,
        ordersTodayTrend: ordersTrend,
        
        unlinkedOrdersCount,
        
        revenueByMerchant,
        topInvites,
        topAmbassadors,
        
        dateRange: {
            days: rangeDays,
            start: rangeStart.toISOString(),
            end: now.toISOString()
        }
      },
      step
    });

  } catch (error: any) {
    console.error('[ADMIN OVERVIEW API] Error:', error);
    return NextResponse.json<ApiResponse>(
      {
        ok: false,
        error: 'Internal Server Error',
        code: 'INTERNAL_ERROR',
        message: error.message || 'Unexpected error',
        step,
      },
      { status: 500 }
    );
  }
});
