/**
 * GET /auth/callback
 * Internal Web OAuth 回调 Route Handler（服务器端）
 * 
 * 职责：
 * 1. 从 URL 读取 code
 * 2. 使用服务器端 Supabase 客户端交换 session
 * 3. 成功后重定向到 /auth/post-login（由客户端处理最终跳转）
 * 4. 失败重定向到登录页
 * 
 * 注意：不再通过 query 参数传递 redirect，而是使用 localStorage
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');

  // 如果 URL 中有错误参数，重定向到登录页
  if (error) {
    console.error('[INTERNAL AUTH CALLBACK] Error from OAuth:', error);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  // 如果没有 code，重定向到登录页
  if (!code) {
    console.error('[INTERNAL AUTH CALLBACK] No code parameter found');
    return NextResponse.redirect(
      new URL('/login?error=missing_code', request.url)
    );
  }

  try {
    const supabase = await createClient();

    // DEBUG: 开发环境打印
    if (process.env.NODE_ENV === 'development') {
      console.log('[INTERNAL AUTH CALLBACK] Processing code:', code ? 'YES' : 'NO');
    }

    // 使用服务器端 Supabase 客户端交换 code 获取 session
    // 服务器端会自动从 cookies 中读取 PKCE verifier
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('[INTERNAL AUTH CALLBACK] Exchange error:', exchangeError);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(exchangeError.message)}`, request.url)
      );
    }

    // DEBUG: 开发环境打印成功信息
    if (process.env.NODE_ENV === 'development' && data.session) {
      console.log('[INTERNAL AUTH CALLBACK] Session exchanged successfully:', data.session.user.id);
    }

    // 重定向到 post-login 页面
    // post-login 页面会从 localStorage 读取目标路径并跳转
    // session 已经存储在 cookies 中（通过 createServerClient 的 setAll）
    return NextResponse.redirect(new URL('/auth/post-login', request.url));
  } catch (err: any) {
    console.error('[INTERNAL AUTH CALLBACK] Unexpected error:', err);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(err.message || 'Unexpected error')}`, request.url)
    );
  }
}
