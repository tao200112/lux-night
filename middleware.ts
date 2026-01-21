/**
 * Next.js Middleware
 * 处理路由保护和重定向
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // 内部端路由处理
  if (pathname.startsWith('/internal')) {
    // 公开的登录页面
    if (pathname === '/internal/login' || pathname === '/internal/auth/callback') {
      return response;
    }

    // 如果未登录，重定向到内部登录页
    if (!user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/internal/login';
      redirectUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // 检查用户是否有workspace
    const { data: memberships } = await supabase
      .from('merchant_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1);

    // 如果没有workspace，重定向到邀请码门禁
    if (!memberships || memberships.length === 0) {
      if (pathname !== '/internal/invite') {
        return NextResponse.redirect(new URL('/internal/invite', request.url));
      }
    }
  }

  // 顾客端路由处理（保持原有逻辑）
  // 如果需要保护某些顾客端路由，可以在这里添加

  return response;
}

export const config = {
  matcher: [
    '/internal/:path*',
    // 如果需要保护顾客端路由，可以添加：
    // '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
