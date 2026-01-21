/**
 * Internal Web Middleware
 * 刷新 Supabase session，确保 Cookie 中的 session 保持最新
 * 实现 Invite Gate：无 merchant_members 永远进不了内部功能
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  try {
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    const { pathname } = request.nextUrl;

    // API 路由直接放行（不需要认证检查）
    if (pathname.startsWith('/api/')) {
      return response;
    }

    // 公开的登录和回调页面，直接放行
    if (pathname === '/login' || pathname === '/auth/callback') {
      return response;
    }

    // 检查环境变量
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('Missing Supabase environment variables');
      // 如果环境变量未配置，允许访问登录页
      if (pathname !== '/login') {
        return NextResponse.redirect(new URL('/login', request.url));
      }
      return response;
    }

    // 使用 createServerClient 刷新 session
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

    // 刷新 session（如果存在）
    await supabase.auth.getUser();

    // DEBUG: 打印 cookie 信息（仅开发环境）
    if (process.env.NODE_ENV === 'development') {
      const allCookies = request.cookies.getAll();
      const authCookies = allCookies.filter(c => c.name.includes('auth') || c.name.includes('sb-'));
      console.log('[MIDDLEWARE] Auth cookies:', authCookies.map(c => c.name));
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    // DEBUG: 打印用户状态（仅开发环境）
    if (process.env.NODE_ENV === 'development') {
      console.log('[MIDDLEWARE] User:', user ? user.id : 'NULL');
      console.log('[MIDDLEWARE] Auth error:', authError?.message || 'NONE');
      console.log('[MIDDLEWARE] Current pathname:', pathname);
    }

    // 如果认证检查出错，记录但不阻止访问登录页
    if (authError && pathname !== '/login') {
      console.error('[MIDDLEWARE] Auth error:', authError);
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // 如果未登录，重定向到登录页
    if (!user) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[MIDDLEWARE] No user found, redirecting to /login');
      }
      if (pathname !== '/login') {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = '/login';
        redirectUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(redirectUrl);
      }
      return response;
    }

    // Invite Gate: 检查用户是否有 merchant_members
    const { data: memberships, error: membershipError } = await supabase
      .from('merchant_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1);

    // 如果查询出错，记录但不阻止访问
    if (membershipError) {
      console.error('Membership query error:', membershipError);
      // 允许继续，可能是数据库连接问题
    }

    // 如果没有 membership，只能访问 /invite 页面
    if (!memberships || memberships.length === 0) {
      if (pathname !== '/invite' && pathname !== '/login') {
        return NextResponse.redirect(new URL('/invite', request.url));
      }
    }

    return response;
  } catch (error) {
    console.error('Middleware error:', error);
    // 出错时，如果是登录页，允许访问；否则重定向到登录页
    const { pathname } = request.nextUrl;
    if (pathname === '/login') {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
