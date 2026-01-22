/**
 * GET /api/admin/_debug
 * Admin Debug & Diagnostics
 * 
 * 用于诊断 504 超时问题
 * 返回脱敏的环境信息和执行时序
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, withTimeout } from '@/lib/server/requireAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const timestamps: Record<string, number> = {
    start: startTime,
  };
  
  let lastStep = 'start';
  
  try {
    // STEP 1: 环境变量检查（脱敏）
    lastStep = 'env_check';
    timestamps.env_check_start = Date.now();
    
    const envStatus = {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      nodeEnv: process.env.NODE_ENV || 'unknown',
      vercelEnv: process.env.VERCEL_ENV || 'unknown',
      vercelRegion: process.env.VERCEL_REGION || 'unknown',
    };
    
    timestamps.env_check_end = Date.now();
    lastStep = 'env_check_done';
    
    // STEP 2: Auth 检查
    lastStep = 'auth_check';
    timestamps.auth_start = Date.now();
    
    const authResult = await withTimeout(
      requireAdmin(),
      8000,
      'requireAdmin in _debug'
    ).catch((error: Error) => ({
      error: {
        message: error.message,
        isTimeout: error.message.includes('Timeout'),
      },
    }));
    
    timestamps.auth_end = Date.now();
    lastStep = 'auth_done';
    
    const authStatus = {
      success: 'error' in authResult ? false : true,
      error: 'error' in authResult ? authResult.error : null,
      userId: 'error' in authResult ? null : authResult.user.id,
      isAdmin: 'error' in authResult ? null : authResult.isAdmin,
      auth_ms: timestamps.auth_end - timestamps.auth_start,
    };
    
    // 计算时序
    const timings = {
      env_check_ms: timestamps.env_check_end - timestamps.env_check_start,
      auth_ms: timestamps.auth_end - timestamps.auth_start,
      total_ms: Date.now() - startTime,
    };
    
    // 返回诊断信息
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      lastStep,
      env: envStatus,
      auth: authStatus,
      timings,
      request: {
        method: request.method,
        path: request.nextUrl.pathname,
        host: request.headers.get('host'),
        userAgent: request.headers.get('user-agent')?.substring(0, 50),
      },
      cookies: {
        hasCookies: request.cookies.getAll().length > 0,
        authCookies: request.cookies.getAll()
          .filter(c => c.name.includes('sb-') || c.name.includes('auth'))
          .map(c => c.name),
      },
    });
    
  } catch (error: any) {
    const errorTimings = {
      total_ms: Date.now() - startTime,
      lastStep,
    };
    
    console.error('[ADMIN DEBUG] Error:', {
      lastStep,
      error: error.message,
      stack: error.stack,
      timings: errorTimings,
    });
    
    return NextResponse.json({
      ok: false,
      timestamp: new Date().toISOString(),
      lastStep,
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      timings: errorTimings,
    }, { status: 500 });
  }
}
