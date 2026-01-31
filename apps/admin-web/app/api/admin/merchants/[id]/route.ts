/**
 * GET /api/admin/merchants/[id]
 * Admin Merchant Detail API
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, type ApiResponse } from '@/lib/admin/api';
import { randomUUID } from 'crypto';

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
        .from('events_v2')
        .select('id, title, status, created_at')
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
      
      // Orders (recent 30 days) - Using event relation to ensure V2 coverage
      supabase
        .from('orders')
        .select(`
            id, total_cents, status, created_at,
            events_v2!inner(merchant_id)
        `)
        .eq('events_v2.merchant_id', id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    
    // 计算统计数据
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const { count: totalOrders } = await supabase
      .from('orders')
      .select('events_v2!inner(merchant_id)', { count: 'exact', head: true })
      .eq('events_v2.merchant_id', id)
      .gte('created_at', thirtyDaysAgo.toISOString());
    
    const { data: revenueOrders } = await supabase
      .from('orders')
      .select('total_cents, events_v2!inner(merchant_id)')
      .eq('events_v2.merchant_id', id)
      .eq('status', 'completed')
      .gte('created_at', thirtyDaysAgo.toISOString());
    
    const totalRevenue = (revenueOrders || []).reduce((sum, order) => sum + (order.total_cents || 0), 0);
    
    return NextResponse.json({
      success: true,
      data: {
        id: merchant.id,
        name: merchant.name,
        status: merchant.status,
        region: (() => {
          if (!merchant.regions) return null;
          const regionData = Array.isArray(merchant.regions) ? merchant.regions[0] : merchant.regions;
          return regionData ? {
            id: regionData.id,
            name: regionData.name,
            state: regionData.state,
            country: regionData.country,
            status: regionData.status,
          } : null;
        })(),
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
              startAt: e.created_at, // V2 uses weeks info, fallback to created_at for sorting/display
              endAt: null,
            }))
          : [],
        members: (membersResult.data || []).map((m: any) => {
          const profileData = (() => {
            if (!m.profiles) return null;
            return Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          })();
          
          return {
            id: m.id,
            role: m.role,
            isActive: m.is_active,
            user: profileData ? {
              id: profileData.id,
              name: profileData.display_name || 'Unknown',
              email: profileData.email,
              avatar: profileData.avatar_url,
            } : null,
            joinedAt: m.created_at,
          };
        }),
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

/**
 * PATCH /api/admin/merchants/[id]
 * Update merchant information (name, regionId, status)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const debugId = randomUUID().substring(0, 8);
  let step = 'init';

  try {
    step = 'auth_check';
    const authResult = await requireAdmin(request);
    
    if ('response' in authResult) {
      return authResult.response;
    }

    const { adminClient } = authResult;
    const { id } = await params;

    step = 'read_body';
    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Invalid request body',
          code: 'INVALID_BODY',
          message: 'Request body must be valid JSON',
          step,
          debugId,
        },
        { status: 400 }
      );
    }

    step = 'validate_fields';
    const { name, regionId, status } = body;

    // 至少需要一个字段
    if (!name && !regionId && !status) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'At least one field is required',
          code: 'MISSING_FIELDS',
          message: 'At least one of name, regionId, or status must be provided',
          step,
          debugId,
        },
        { status: 400 }
      );
    }

    // 验证 name（如果提供）
    if (name !== undefined) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) {
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: 'Name cannot be empty',
            code: 'INVALID_NAME',
            message: 'Merchant name must be a non-empty string',
            step,
            debugId,
          },
          { status: 400 }
        );
      }
    }

    step = 'update_merchant';
    const updatePayload: {
      name?: string;
      region_id?: string;
      status?: string;
    } = {};

    if (name !== undefined) {
      updatePayload.name = (typeof name === 'string' ? name : String(name)).trim();
    }
    if (regionId !== undefined) {
      updatePayload.region_id = regionId;
    }
    if (status !== undefined) {
      updatePayload.status = status;
    }

    const { data: updatedMerchant, error: updateError } = await adminClient
      .from('merchants')
      .update(updatePayload)
      .eq('id', id)
      .select('id, name, region_id, status, created_at, updated_at')
      .single();

    if (updateError) {
      console.error('[ADMIN MERCHANTS PATCH] Update error:', {
        debugId,
        step,
        merchantId: id,
        updatePayload,
        error: {
          message: updateError.message,
          code: updateError.code,
          details: updateError.details,
          hint: updateError.hint,
        },
      });

      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Failed to update merchant',
          code: 'UPDATE_ERROR',
          message: updateError.message || 'Database update failed',
          step,
          debugId,
          details: {
            supabaseError: {
              message: updateError.message,
              code: updateError.code,
              details: updateError.details,
              hint: updateError.hint,
            },
          },
        },
        { status: 500 }
      );
    }

    if (!updatedMerchant) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Merchant not found',
          code: 'NOT_FOUND',
          message: `Merchant with id ${id} not found`,
          step,
          debugId,
        },
        { status: 404 }
      );
    }

    step = 'success';
    console.log('[ADMIN MERCHANTS PATCH]', {
      debugId,
      step,
      merchantId: id,
      updatedFields: Object.keys(updatePayload),
    });

    return NextResponse.json<ApiResponse>(
      {
        ok: true,
        data: {
          id: updatedMerchant.id,
          name: updatedMerchant.name,
          regionId: updatedMerchant.region_id,
          status: updatedMerchant.status,
          createdAt: updatedMerchant.created_at,
          updatedAt: updatedMerchant.updated_at,
        },
        step,
        debugId,
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error('[ADMIN MERCHANTS PATCH] Unexpected error:', {
      debugId,
      step,
      error: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack?.substring(0, 500),
      },
    });

    return NextResponse.json<ApiResponse>(
      {
        ok: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        message: error?.message || 'An unexpected error occurred',
        step,
        debugId,
      },
      { status: 500 }
    );
  }
}
