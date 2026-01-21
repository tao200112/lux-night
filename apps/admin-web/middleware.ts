/**
 * Admin Web Middleware
 * 刷新 Supabase session，确保 Cookie 中的 session 保持最新
 * 检查 admin 权限并保护路由
 */

import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ============================================================
  // Phase 1: 诊断日志 - 路径检查
  // ============================================================
  const isPublicPath = pathname === '/login' || 
                       pathname === '/auth/callback' ||
                       pathname.startsWith('/api/') ||
                       pathname.startsWith('/_next/') ||
                       pathname === '/favicon.ico' ||
                       pathname.includes('.');

  // 诊断日志：路径信息
  if (process.env.NODE_ENV === 'development') {
    console.log('[ADMIN MIDDLEWARE] ========================================');
    console.log('[ADMIN MIDDLEWARE] Pathname:', pathname);
    console.log('[ADMIN MIDDLEWARE] Is public path:', isPublicPath);
  }

  // 如果是公开路径，直接放行（不检查认证）
  if (isPublicPath) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ADMIN MIDDLEWARE] Public path, allowing access');
      console.log('[ADMIN MIDDLEWARE] ========================================');
    }
    return NextResponse.next();
  }

  // 保护路径列表
  const protectedPaths = [
    '/',
    '/dashboard',
    '/events',
    '/users',
    '/admin',
    '/approvals',
    '/merchants',
    '/orders',
    '/customers',
    '/invites',
    '/exports',
    '/settings',
    '/no-access',
  ];

  const isProtectedPath = protectedPaths.some(path => 
    pathname === path || pathname.startsWith(path + '/')
  );

  if (process.env.NODE_ENV === 'development') {
    console.log('[ADMIN MIDDLEWARE] Is protected path:', isProtectedPath);
  }

  // 如果不是保护路径，放行
  if (!isProtectedPath) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ADMIN MIDDLEWARE] Not protected path, allowing access');
      console.log('[ADMIN MIDDLEWARE] ========================================');
    }
    return NextResponse.next();
  }

  // ============================================================
  // Phase 2: 创建 Supabase 客户端并刷新 session
  // ============================================================
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
            response.cookies.set(name, value, {
              ...options,
              // 本地开发不强制 secure
              secure: options?.secure ?? (process.env.NODE_ENV === 'production'),
              path: options?.path ?? '/',
              sameSite: options?.sameSite ?? 'lax',
            });
          });
        },
      },
    }
  );

  // ============================================================
  // Phase 3: 诊断日志 - Cookie 检查
  // ============================================================
  const allCookies = request.cookies.getAll();
  const authCookies = allCookies.filter(c => 
    c.name.includes('sb-') || c.name.includes('auth')
  );

  if (process.env.NODE_ENV === 'development') {
    console.log('[ADMIN MIDDLEWARE] Auth cookies found:', authCookies.map(c => c.name));
    console.log('[ADMIN MIDDLEWARE] Total cookies:', allCookies.length);
  }

  // ============================================================
  // Phase 4: 检查用户登录状态
  // ============================================================
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (process.env.NODE_ENV === 'development') {
    console.log('[ADMIN MIDDLEWARE] User check result:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      authError: authError?.message || 'NONE',
      authErrorCode: authError?.status || 'NONE',
    });
  }

  // 如果未登录，重定向到登录页
  if (!user) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ADMIN MIDDLEWARE] No user found, redirecting to /login');
      console.log('[ADMIN MIDDLEWARE] Reason: Cookie read failed or session expired');
      console.log('[ADMIN MIDDLEWARE] ========================================');
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // ============================================================
  // Phase 5: 检查 admin 权限（直接在 middleware 中查询，避免内部 API 调用）
  // ============================================================
  let isAdmin = false;
  let adminCheckError: any = null;

  try {
    // 优先使用 service role key 创建 admin client（如果可用）
    // 注意：middleware 在 Edge Runtime 运行，但 Supabase 查询是兼容的
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient } = await import('@supabase/supabase-js');
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );

      // 查询用户是否为 admin
      const { data: profile, error: profileError } = await adminClient
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (profileError) {
        adminCheckError = {
          type: 'query_failed',
          error: profileError.message,
        };
        console.error('[ADMIN MIDDLEWARE] Profile query failed:', profileError);
      } else {
        isAdmin = profile?.is_admin === true;
      }
    } else {
      // Fallback: 如果没有 service role key，使用 anon key + RLS
      // 这需要 profiles 表的 RLS 策略允许用户查询自己的 is_admin 字段
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (profileError) {
        adminCheckError = {
          type: 'query_failed',
          error: profileError.message,
        };
        console.error('[ADMIN MIDDLEWARE] Profile query failed:', profileError);
      } else {
        isAdmin = profile?.is_admin === true;
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[ADMIN MIDDLEWARE] Admin check result:', {
        isAdmin,
        adminCheckError: adminCheckError || 'NONE',
        adminCheckType: adminCheckError?.type || 'NONE',
      });
    }

  } catch (error: any) {
    adminCheckError = {
      type: 'exception',
      error: error.message,
    };
    console.error('[ADMIN MIDDLEWARE] Error checking admin status:', error);
    
    // 如果出错且在登录页，允许继续
    if (pathname === '/login') {
      if (process.env.NODE_ENV === 'development') {
        console.log('[ADMIN MIDDLEWARE] On login page, allowing access despite error');
        console.log('[ADMIN MIDDLEWARE] ========================================');
      }
      return response;
    }
    
    // 否则重定向到登录页
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('reason', 'error');
    return NextResponse.redirect(url);
  }

  // ============================================================
  // Phase 6: 权限检查和路由处理
  // ============================================================
  
  // 如果不是 admin，重定向到 /no-access
  if (!isAdmin) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ADMIN MIDDLEWARE] User is not admin, redirecting to /no-access');
      console.log('[ADMIN MIDDLEWARE] ========================================');
    }
    return NextResponse.redirect(new URL('/no-access', request.url));
  }

  // 如果是 admin 且在登录页，重定向到 dashboard
  if (isAdmin && pathname === '/login') {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ADMIN MIDDLEWARE] Admin on login page, redirecting to /dashboard');
      console.log('[ADMIN MIDDLEWARE] ========================================');
    }
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // 如果是 admin 且在其他保护路径，放行
  if (process.env.NODE_ENV === 'development') {
    console.log('[ADMIN MIDDLEWARE] Admin access granted to:', pathname);
    console.log('[ADMIN MIDDLEWARE] ========================================');
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
