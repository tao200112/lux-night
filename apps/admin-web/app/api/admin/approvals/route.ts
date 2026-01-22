/**
 * GET /api/admin/approvals
 * Admin Approvals List API
 * 返回审批列表（支持 status 筛选）
 * 
 * 修复版：使用 requireAdmin + 超时保护
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, withTimeout } from '@/lib/server/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 8000;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestPath = request.nextUrl.pathname;
  
  console.info('[ADMIN API]', { path: requestPath, step: 'ENTER', t: startTime });

  try {
    // 权限检查（带超时）
    const authResult = await withTimeout(requireAdmin(), TIMEOUT_MS, 'requireAdmin');
    if ('error' in authResult) {
      return authResult.error;
    }
    
    console.info('[ADMIN API]', {
      path: requestPath,
      step: 'AUTH_OK',
      t: Date.now(),
      duration: `${Date.now() - startTime}ms`,
    });
    
    // 环境变量检查
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { success: false, code: 'ENV_ERROR', message: 'Missing SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      );
    }
    
    // 获取查询参数（GET 不读取 body）
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'pending';
    const query = searchParams.get('query') || '';
    
    console.info('[ADMIN API]', {
      path: requestPath,
      step: 'QUERY_START',
      status,
      query,
      t: Date.now(),
    });
    
    // 使用 service role 查询
    const supabaseAdmin = createAdminClient();
    
    let requestQuery = supabaseAdmin
      .from('requests')
      .select(`
        id,
        type,
        status,
        payload_before,
        payload_after,
        admin_note,
        requested_by,
        created_at,
        decided_at,
        merchant_id,
        venue_id,
        event_id
      `)
      .order('created_at', { ascending: false });
    
    if (status && status !== 'all') {
      requestQuery = requestQuery.eq('status', status);
    }
    
    // 执行查询（带超时）
    // 注意：将 PostgrestFilterBuilder 转换为真正的 Promise
    const requestsResult = await withTimeout(
      Promise.resolve(requestQuery),
      TIMEOUT_MS,
      'approvals query'
    ).catch((error: Error) => ({
      data: null,
      error: { message: error.message, code: 'TIMEOUT' },
    }));
    
    if (requestsResult.error) {
      console.error('[ADMIN API]', {
        path: requestPath,
        step: 'QUERY_ERROR',
        error: requestsResult.error.message,
        t: Date.now(),
      });
      
      if (requestsResult.error.code === 'TIMEOUT') {
        return NextResponse.json(
          { success: false, code: 'TIMEOUT', message: 'Approvals query timeout', label: 'approvals query' },
          { status: 504 }
        );
      }
      
      return NextResponse.json(
        { success: false, code: 'QUERY_ERROR', message: requestsResult.error.message },
        { status: 500 }
      );
    }
    
    const requests = requestsResult.data || [];
    
    console.info('[ADMIN API]', {
      path: requestPath,
      step: 'RESPOND',
      count: requests.length,
      duration: `${Date.now() - startTime}ms`,
      t: Date.now(),
    });
    
    // 简化返回（避免复杂关联查询超时）
    const approvals = requests.map((req: any) => ({
      id: req.id,
      type: req.type,
      status: req.status,
      requestedBy: req.requested_by,
      createdAt: req.created_at,
      decidedAt: req.decided_at,
      note: req.admin_note,
      merchantId: req.merchant_id,
      venueId: req.venue_id,
      eventId: req.event_id,
      // TODO: 后续可以批量查询关联数据
    }));
    
    return NextResponse.json({
      success: true,
      data: {
        approvals,
      },
    });
    
  } catch (error: any) {
    console.error('[ADMIN API]', {
      path: requestPath,
      step: 'ERROR',
      error: error.message,
      stack: error.stack,
      t: Date.now(),
    });
    
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
