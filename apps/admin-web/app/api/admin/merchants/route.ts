/**
 * GET /api/admin/merchants
 * POST /api/admin/merchants
 * Admin Merchants API
 * 
 * 增强版：包含完整的诊断日志
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// 强制使用 Node.js runtime（支持所有 Supabase 功能）
export const runtime = 'nodejs';
// 强制动态渲染（不缓存）
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestPath = request.nextUrl.pathname;
  const requestMethod = request.method;
  
  console.log('[ADMIN_API_ENTER]', {
    path: requestPath,
    method: requestMethod,
    timestamp: new Date().toISOString(),
  });

  try {
    // ============================================================
    // STEP 1: 环境变量检查
    // ============================================================
    console.log('[ADMIN_MERCHANTS] STEP1: env check');
    const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const hasAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    console.log('[ADMIN_MERCHANTS] STEP1 result:', {
      hasUrl,
      hasAnon,
      hasService,
    });
    
    if (!hasUrl || !hasAnon) {
      console.error('[ADMIN_MERCHANTS] STEP1 FAILED: Missing env vars');
      return NextResponse.json(
        { success: false, code: 'ENV_ERROR', message: 'Missing Supabase environment variables' },
        { status: 500 }
      );
    }

    // ============================================================
    // STEP 2: 创建 Supabase 客户端
    // ============================================================
    console.log('[ADMIN_MERCHANTS] STEP2: create supabase client');
    const supabase = await createClient();
    console.log('[ADMIN_MERCHANTS] STEP2 result: client created');
    
    // ============================================================
    // STEP 3: 获取用户认证状态
    // ============================================================
    console.log('[ADMIN_MERCHANTS] STEP3: auth getUser');
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    console.log('[ADMIN_MERCHANTS] STEP3 result:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      userError: userError?.message || null,
    });
    
    if (userError) {
      console.error('[ADMIN_MERCHANTS] STEP3 FAILED:', userError);
      return NextResponse.json(
        { success: false, code: 'AUTH_ERROR', message: userError.message },
        { status: 401 }
      );
    }
    
    if (!user) {
      console.warn('[ADMIN_MERCHANTS] STEP3 FAILED: No user');
      return NextResponse.json(
        { success: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' },
        { status: 401 }
      );
    }
    
    // ============================================================
    // STEP 4: 检查 Admin 权限
    // ============================================================
    console.log('[ADMIN_MERCHANTS] STEP4: admin check (RPC call)');
    const { data: isAdmin, error: rpcError } = await supabase.rpc('is_admin');
    
    console.log('[ADMIN_MERCHANTS] STEP4 result:', {
      isAdmin,
      rpcError: rpcError?.message || null,
    });
    
    if (rpcError) {
      console.error('[ADMIN_MERCHANTS] STEP4 FAILED: RPC error:', rpcError);
      return NextResponse.json(
        { success: false, code: 'RPC_ERROR', message: `is_admin() RPC failed: ${rpcError.message}` },
        { status: 500 }
      );
    }
    
    if (!isAdmin) {
      console.warn('[ADMIN_MERCHANTS] STEP4 FAILED: Not admin');
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', message: 'Must be admin' },
        { status: 403 }
      );
    }
    
    // ============================================================
    // STEP 5: 查询 Merchants（真正的 Supabase 外部请求）
    // ============================================================
    console.log('[ADMIN_MERCHANTS] STEP5: query merchants (external API call)');
    
    // 获取查询参数
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    const region = searchParams.get('region') || '';
    const status = searchParams.get('status') || '';
    
    console.log('[ADMIN_MERCHANTS] STEP5 params:', {
      query,
      region,
      status,
    });
    
    let merchantsQuery = supabase
      .from('merchants')
      .select(`
        id,
        name,
        status,
        created_at,
        regions!inner(
          id,
          name,
          state,
          country
        )
      `)
      .order('created_at', { ascending: false });
    
    if (status && status !== 'all') {
      merchantsQuery = merchantsQuery.eq('status', status);
    }
    
    if (region) {
      merchantsQuery = merchantsQuery.eq('region_id', region);
    }
    
    if (query) {
      merchantsQuery = merchantsQuery.ilike('name', `%${query}%`);
    }
    
    console.log('[ADMIN_MERCHANTS] STEP5: executing query...');
    const { data: merchants, error: merchantsError } = await merchantsQuery;
    
    console.log('[ADMIN_MERCHANTS] STEP5 result:', {
      success: !merchantsError,
      merchantsCount: merchants?.length || 0,
      error: merchantsError?.message || null,
    });
    
    if (merchantsError) {
      console.error('[ADMIN_MERCHANTS] STEP5 FAILED:', merchantsError);
      return NextResponse.json(
        { success: false, code: 'QUERY_ERROR', message: merchantsError.message },
        { status: 500 }
      );
    }
    
    // 获取统计数据
    const merchantsWithStats = await Promise.all(
      (merchants || []).map(async (merchant: any) => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        // 通过 order_items -> events 关联获取订单和收入
        const { data: ordersData } = await supabase
          .from('orders')
          .select('total_cents, order_items!inner(event_id, events!inner(merchant_id))')
          .gte('created_at', thirtyDaysAgo.toISOString())
          .eq('status', 'completed');
        
        // 过滤出属于该商家的订单
        const merchantOrders = (ordersData || []).filter((order: any) => {
          const orderItems = order.order_items || [];
          return orderItems.some((item: any) => {
            const eventData = Array.isArray(item.events) ? item.events[0] : item.events;
            return eventData && eventData.merchant_id === merchant.id;
          });
        });
        
        const revenue = merchantOrders.reduce((sum: number, order: any) => sum + (order.total_cents || 0), 0);
        
        // 获取活跃事件数
        const { count: activeEventsCount } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('merchant_id', merchant.id)
          .eq('status', 'published')
          .gte('end_at', new Date().toISOString());
        
        return {
          id: merchant.id,
          name: merchant.name,
          status: merchant.status,
          region: merchant.regions && Array.isArray(merchant.regions) && merchant.regions.length > 0 ? {
            id: merchant.regions[0].id,
            name: merchant.regions[0].name,
            state: merchant.regions[0].state,
            country: merchant.regions[0].country,
          } : null,
          stats: {
            ordersCount: merchantOrders.length,
            revenue: revenue / 100,
            revenueFormatted: `$${(revenue / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
            activeEvents: activeEventsCount || 0,
          },
          createdAt: merchant.created_at,
        };
      })
    );
    
    // 获取所有地区列表
    const { data: regions } = await supabase
      .from('regions')
      .select('id, name, state, country')
      .eq('is_active', true)
      .order('name');
    
    const duration = Date.now() - startTime;
    console.log('[ADMIN_MERCHANTS] SUCCESS: returning data', {
      merchantsCount: merchantsWithStats.length,
      regionsCount: regions?.length || 0,
      duration: `${duration}ms`,
    });
    
    return NextResponse.json({
      success: true,
      data: {
        merchants: merchantsWithStats,
        regions: regions || [],
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[ADMIN_API_ERROR]', {
      path: requestPath,
      method: requestMethod,
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
    });
    
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/merchants
 * Create merchant invite code
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestPath = request.nextUrl.pathname;
  const requestMethod = request.method;
  
  console.log('[ADMIN_API_ENTER]', {
    path: requestPath,
    method: requestMethod,
    timestamp: new Date().toISOString(),
  });

  try {
    const supabase = await createClient();
    
    // 检查 Admin 权限
    console.log('[ADMIN_MERCHANTS_POST] Checking auth...');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('[ADMIN_MERCHANTS_POST] No user');
      return NextResponse.json(
        { success: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' },
        { status: 401 }
      );
    }
    
    console.log('[ADMIN_MERCHANTS_POST] Checking admin...');
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      console.warn('[ADMIN_MERCHANTS_POST] Not admin');
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', message: 'Must be admin' },
        { status: 403 }
      );
    }
    
    const body = await request.json();
    const { merchantId, regionId, role, expiresDays } = body;
    
    if (!merchantId && !regionId) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: 'Either merchantId or regionId is required' },
        { status: 400 }
      );
    }
    
    // 调用 create-merchant invite API
    const response = await fetch(`${request.nextUrl.origin}/api/admin/invites/create-merchant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        merchantId: merchantId || null,
        regionId: regionId || null,
        role: role || 'owner',
        expiresDays: expiresDays || 30,
        createdByUserId: user.id,
      }),
    });
    
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      return NextResponse.json(
        { success: false, code: result.error || 'CREATE_FAILED', message: result.message || 'Failed to create merchant invite' },
        { status: response.status || 500 }
      );
    }
    
    const duration = Date.now() - startTime;
    console.log('[ADMIN_MERCHANTS_POST] SUCCESS', {
      token: result.token ? 'CREATED' : 'NONE',
      duration: `${duration}ms`,
    });
    
    return NextResponse.json({
      success: true,
      data: {
        token: result.token,
        merchantId: result.merchant_id,
        regionId: result.region_id,
        message: 'Merchant invite code created successfully',
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[ADMIN_API_ERROR]', {
      path: requestPath,
      method: requestMethod,
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
    });
    
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
