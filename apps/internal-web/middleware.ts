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

    // 静态资源和 Next.js 内部路径，直接放行
    if (
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/api/') ||
      pathname === '/favicon.ico' ||
      pathname.endsWith('.map') ||
      pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
    ) {
      return response;
    }

    // 公开的登录、回调和认证相关页面，直接放行
    if (
      pathname === '/login' ||
      pathname.startsWith('/auth/callback') ||
      pathname === '/auth/callback' ||
      pathname === '/auth/post-login' ||
      pathname === '/auth/error' ||
      pathname.startsWith('/onboarding/') ||
      pathname === '/join' ||
      pathname === '/error'
    ) {
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

    // ============================================================
    // Invite Gate: 检查用户权限
    // 优先级：
    // 1. 邮箱白名单（INTERNAL_BYPASS_EMAILS）- 管理员/测试账号
    // 2. Merchant membership - 已加入的成员
    // 3. 无权限 -> 重定向到 /invite
    // ============================================================
    
    // 1. 检查邮箱白名单
    // 注意：使用 NEXT_PUBLIC_ 前缀，因为需要在客户端和服务端保持一致
    const bypassEmails = (process.env.NEXT_PUBLIC_INTERNAL_BYPASS_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);
    
    const userEmail = user.email?.toLowerCase() || '';
    const isBypassUser = bypassEmails.includes(userEmail);
    
    if (isBypassUser) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[MIDDLEWARE] ✅ User in bypass list, allowing access:', userEmail);
      }
      return response;
    }
    
    // 2. 检查 merchant membership
    const { data: memberships, error: membershipError } = await supabase
      .from('merchant_members')
      .select('id, merchant_id, role, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1);

    // 如果查询出错，不要当作未绑定；给出错误或重试路径
    if (membershipError) {
      console.error('[MIDDLEWARE] ❌ Membership query error:', membershipError);
      // 查询失败时，如果是访问 /invite 或 /login，允许继续
      // 否则重定向到错误页面，提示重试
      if (pathname !== '/invite' && pathname !== '/login' && pathname !== '/error') {
        const errorUrl = new URL('/error', request.url);
        errorUrl.searchParams.set('reason', 'membership_check_failed');
        errorUrl.searchParams.set('message', 'Failed to verify membership. Please try again.');
        return NextResponse.redirect(errorUrl);
      }
      // 如果已经在错误页面或登录/邀请页面，允许继续
      return response;
    }

    // DEBUG: 打印 membership 检查结果
    if (process.env.NODE_ENV === 'development') {
      console.log('[MIDDLEWARE] Membership check:', {
        userId: user.id,
        userEmail: userEmail,
        isBypassUser,
        hasMembership: memberships && memberships.length > 0,
        membershipCount: memberships?.length || 0,
        memberships: memberships || [],
      });
    }

    // 3. 如果有 membership，允许访问（直接进入 dashboard/workspaces，不再跳转 /invite）
    if (memberships && memberships.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[MIDDLEWARE] ✅ Membership found, allowing access');
      }
      return response;
    }

    // 4. 无权限：只能访问 /invite 页面
    if (pathname !== '/invite' && pathname !== '/login') {
      if (process.env.NODE_ENV === 'development') {
        console.log('[MIDDLEWARE] ⚠️ No membership and not bypassed, redirecting to /invite');
      }
      const inviteUrl = new URL('/invite', request.url);
      inviteUrl.searchParams.set('reason', 'no_membership');
      return NextResponse.redirect(inviteUrl);
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
     * - _next/webpack-hmr (HMR in development)
     * - favicon.ico, *.map (sourcemaps)
     * - Static file extensions
     */
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|map)$).*)',
  ],
};
