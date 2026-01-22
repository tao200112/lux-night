/**
 * GET /api/admin/merchants
 * POST /api/admin/merchants
 * Admin Merchants API
 * 
 * 修复版：
 * - 使用共享 requireAdmin() 避免 route-to-route fetch
 * - 添加超时保护避免 504
 * - 使用 service role 绕过 RLS
 * - 确保所有分支都有 return
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, withTimeout } from '@/lib/server/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';

// 强制使用 Node.js runtime
export const runtime = 'nodejs';
// 强制动态渲染
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 8000; // 8 秒超时

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestPath = request.nextUrl.pathname;
  
  console.info('[ADMIN API]', { path: requestPath, step: 'ENTER', t: startTime });

  try {
    // ============================================================
    // STEP 1: 权限检查（带超时保护）
    // ============================================================
    console.info('[ADMIN API]', { path: requestPath, step: 'AUTH_START', t: Date.now() });
    
    const authResult = await withTimeout(
      requireAdmin(),
      TIMEOUT_MS,
      'requireAdmin'
    ).catch((error: Error) => {
      console.error('[ADMIN API]', {
        path: requestPath,
        step: 'AUTH_TIMEOUT',
        error: error.message,
        t: Date.now(),
      });
      
      return {
        error: NextResponse.json(
          { success: false, code: 'TIMEOUT', message: 'Auth check timeout', label: 'requireAdmin' },
          { status: 504 }
        ),
      };
    });
    
    if ('error' in authResult) {
      console.warn('[ADMIN API]', {
        path: requestPath,
        step: 'AUTH_FAILED',
        t: Date.now(),
        duration: `${Date.now() - startTime}ms`,
      });
      return authResult.error;
    }
    
    const { user } = authResult;
    console.info('[ADMIN API]', {
      path: requestPath,
      step: 'AUTH_OK',
      userId: user.id,
      t: Date.now(),
      duration: `${Date.now() - startTime}ms`,
    });
    
    // ============================================================
    // STEP 2: 环境变量检查
    // ============================================================
    console.info('[ADMIN API]', { path: requestPath, step: 'ENV_CHECK', t: Date.now() });
    
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[ADMIN API]', {
        path: requestPath,
        step: 'ENV_MISSING',
        missing: 'SUPABASE_SERVICE_ROLE_KEY',
        t: Date.now(),
      });
      
      return NextResponse.json(
        { success: false, code: 'ENV_ERROR', message: 'Missing SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      );
    }
    
    // ============================================================
    // STEP 3: 获取查询参数（不读取 body - GET 请求）
    // ============================================================
    console.info('[ADMIN API]', { path: requestPath, step: 'PARSE_PARAMS', t: Date.now() });
    
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    const region = searchParams.get('region') || '';
    const status = searchParams.get('status') || '';
    
    console.info('[ADMIN API]', {
      path: requestPath,
      step: 'PARAMS_OK',
      query,
      region,
      status,
      t: Date.now(),
    });
    
    // ============================================================
    // STEP 4: 查询 Merchants（使用 service role，带超时）
    // ============================================================
    console.info('[ADMIN API]', { path: requestPath, step: 'QUERY_START', t: Date.now() });
    
    const supabaseAdmin = createAdminClient();
    
    // 构建查询
    let merchantsQuery = supabaseAdmin
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
    
    // 执行查询（带超时）
    const merchantsResult = await withTimeout(
      merchantsQuery,
      TIMEOUT_MS,
      'merchants query'
    ).catch((error: Error) => {
      console.error('[ADMIN API]', {
        path: requestPath,
        step: 'QUERY_TIMEOUT',
        error: error.message,
        t: Date.now(),
      });
      
      return {
        data: null,
        error: { message: error.message, code: 'TIMEOUT' },
      };
    });
    
    if (merchantsResult.error) {
      console.error('[ADMIN API]', {
        path: requestPath,
        step: 'QUERY_ERROR',
        error: merchantsResult.error.message,
        code: merchantsResult.error.code,
        t: Date.now(),
      });
      
      if (merchantsResult.error.code === 'TIMEOUT') {
        return NextResponse.json(
          { success: false, code: 'TIMEOUT', message: 'Merchants query timeout', label: 'merchants query' },
          { status: 504 }
        );
      }
      
      return NextResponse.json(
        { success: false, code: 'QUERY_ERROR', message: merchantsResult.error.message },
        { status: 500 }
      );
    }
    
    const merchants = merchantsResult.data || [];
    
    console.info('[ADMIN API]', {
      path: requestPath,
      step: 'QUERY_OK',
      count: merchants.length,
      t: Date.now(),
      duration: `${Date.now() - startTime}ms`,
    });
    
    // ============================================================
    // STEP 5: 获取统计数据（简化版 - 避免复杂查询超时）
    // ============================================================
    console.info('[ADMIN API]', { path: requestPath, step: 'STATS_START', t: Date.now() });
    
    const merchantsWithStats = merchants.map((merchant: any) => ({
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
        ordersCount: 0, // TODO: 后续优化
        revenue: 0,
        revenueFormatted: '$0',
        activeEvents: 0,
      },
      createdAt: merchant.created_at,
    }));
    
    // ============================================================
    // STEP 6: 获取地区列表
    // ============================================================
    const regionsResult = await withTimeout(
      supabaseAdmin
        .from('regions')
        .select('id, name, state, country')
        .eq('is_active', true)
        .order('name'),
      TIMEOUT_MS,
      'regions query'
    ).catch((error: Error) => ({
      data: [],
      error: { message: error.message },
    }));
    
    const regions = regionsResult.data || [];
    
    console.info('[ADMIN API]', {
      path: requestPath,
      step: 'REGIONS_OK',
      count: regions.length,
      t: Date.now(),
    });
    
    // ============================================================
    // STEP 7: 返回响应
    // ============================================================
    const duration = Date.now() - startTime;
    console.info('[ADMIN API]', {
      path: requestPath,
      step: 'RESPOND',
      merchantsCount: merchantsWithStats.length,
      regionsCount: regions.length,
      totalDuration: `${duration}ms`,
      t: Date.now(),
    });
    
    return NextResponse.json({
      success: true,
      data: {
        merchants: merchantsWithStats,
        regions,
      },
    });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[ADMIN API]', {
      path: requestPath,
      step: 'ERROR',
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      t: Date.now(),
    });
    
    // 确保返回响应
    return NextResponse.json(
      {
        success: false,
        code: 'INTERNAL_ERROR',
        message: error.message || 'Unexpected error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/merchants
 * Create merchant invite code
 * 
 * 修复：直接调用共享逻辑，不通过 fetch
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestPath = request.nextUrl.pathname;
  
  console.info('[ADMIN API]', { path: requestPath, step: 'ENTER', method: 'POST', t: startTime });

  try {
    // 权限检查
    const authResult = await withTimeout(requireAdmin(), TIMEOUT_MS, 'requireAdmin');
    if ('error' in authResult) {
      return authResult.error;
    }
    
    const { user } = authResult;
    
    // 读取请求体
    const body = await request.json();
    const { merchantId, regionId, role, expiresDays } = body;
    
    if (!merchantId && !regionId) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: 'Either merchantId or regionId is required' },
        { status: 400 }
      );
    }
    
    // TODO: 实现邀请码创建逻辑（直接调用，不通过 fetch）
    console.warn('[ADMIN API]', {
      path: requestPath,
      step: 'TODO',
      message: 'Invite creation not yet implemented',
      t: Date.now(),
    });
    
    return NextResponse.json(
      { success: false, code: 'NOT_IMPLEMENTED', message: 'Merchant invite creation not yet implemented' },
      { status: 501 }
    );
    
  } catch (error: any) {
    console.error('[ADMIN API]', {
      path: requestPath,
      step: 'ERROR',
      method: 'POST',
      error: error.message,
      t: Date.now(),
    });
    
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
