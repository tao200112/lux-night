/**
 * GET /api/admin/health
 * Admin Health Check & Diagnostics
 * 
 * 用于诊断 Vercel 环境配置和请求状态
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const now = new Date().toISOString();
  
  // 检查环境变量
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  // 获取 Vercel 环境信息
  const vercelRegion = process.env.VERCEL_REGION || 'unknown';
  const vercelEnv = process.env.VERCEL_ENV || 'unknown';
  
  // 获取请求头信息
  const host = request.headers.get('host') || 'unknown';
  const xForwardedHost = request.headers.get('x-forwarded-host') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  // 检查 cookies
  const cookies = request.cookies.getAll();
  const authCookies = cookies.filter(c => 
    c.name.includes('sb-') || c.name.includes('auth')
  );
  const cookiesPresent = authCookies.length > 0;
  
  const payload = {
    ok: true,
    timestamp: now,
    env: {
      hasUrl,
      hasAnon,
      hasService,
      nodeEnv: process.env.NODE_ENV,
    },
    vercel: {
      region: vercelRegion,
      env: vercelEnv,
    },
    request: {
      host,
      xForwardedHost,
      userAgent: userAgent.substring(0, 50) + '...',
    },
    cookies: {
      present: cookiesPresent,
      authCookieCount: authCookies.length,
      authCookieNames: authCookies.map(c => c.name),
    },
  };
  
  // 输出到 Vercel Functions logs
  console.log('[ADMIN_HEALTH]', JSON.stringify(payload, null, 2));
  
  return NextResponse.json(payload);
}
