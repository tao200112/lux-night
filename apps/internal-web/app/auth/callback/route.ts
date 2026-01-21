/**
 * GET /auth/callback
 * Internal Web OAuth 回调 Route Handler（服务器端）
 * 从 URL 读取 code，使用服务器端 Supabase 客户端交换 session
 * 成功后重定向到首页，失败重定向到登录页
 * 
 * 注意：不再调用 ensureProfile，因为 DB trigger 会自动创建 profile
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

    // Internal app: 登录后重定向到根路径，让 middleware 处理路由
    // middleware 会检查 membership 并重定向到 /invite 或相应页面
    const finalRedirectTo = redirectTo === '/' ? '/' : redirectTo;
    
    // 成功后重定向到目标页面
    // session 已经存储在 cookies 中（通过 createServerClient 的 setAll）
    return NextResponse.redirect(new URL(finalRedirectTo, request.url));
  } catch (err: any) {
    console.error('[INTERNAL AUTH CALLBACK] Unexpected error:', err);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(err.message || 'Unexpected error')}`, request.url)
    );
  }
}
