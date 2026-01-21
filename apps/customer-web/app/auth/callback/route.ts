/**
 * GET /auth/callback
 * OAuth 回调 Route Handler（服务器端）
 * 从 URL 读取 code，使用服务器端 Supabase 客户端交换 session
 * 成功后重定向到首页，失败重定向到登录页
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const redirectTo = requestUrl.searchParams.get('redirect') || '/';

  // 如果 URL 中有错误参数，重定向到登录页
  if (error) {
    console.error('[CUSTOMER AUTH CALLBACK] Error from OAuth:', error);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  // 如果没有 code，重定向到登录页
  if (!code) {
    console.error('[CUSTOMER AUTH CALLBACK] No code parameter found');
    return NextResponse.redirect(
      new URL('/login?error=missing_code', request.url)
    );
  }

  try {
    const supabase = await createClient();

    // DEBUG: 开发环境打印
    if (process.env.NODE_ENV === 'development') {
      console.log('[CUSTOMER AUTH CALLBACK] Processing code:', code ? 'YES' : 'NO');
    }

    // 使用服务器端 Supabase 客户端交换 code 获取 session
    // 服务器端会自动从 cookies 中读取 PKCE verifier
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('[CUSTOMER AUTH CALLBACK] Exchange error:', exchangeError);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(exchangeError.message)}`, request.url)
      );
    }

    // DEBUG: 开发环境打印成功信息
    if (process.env.NODE_ENV === 'development' && data.session) {
      console.log('[CUSTOMER AUTH CALLBACK] Session exchanged successfully:', data.session.user.id);
    }

    // 成功后重定向到目标页面
    // session 已经存储在 cookies 中（通过 createServerClient 的 setAll）
    return NextResponse.redirect(new URL(redirectTo, request.url));
  } catch (err: any) {
    console.error('[CUSTOMER AUTH CALLBACK] Unexpected error:', err);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(err.message || 'Unexpected error')}`, request.url)
    );
  }
}
