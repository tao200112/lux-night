/**
 * Admin Web Supabase SSR Client
 * 用于 middleware 的 SSR Supabase 客户端（必须使用 NextRequest）
 */

import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * 创建 SSR Supabase 客户端（用于 middleware）
 * @param request NextRequest 对象
 * @returns { supabase, response } - supabase 客户端和 response 对象
 */
export function createServerSupabaseClient(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // 使用 admin cookie 前缀
  const cookiePrefix = 'sb-admin';

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // 从 request.cookies 获取所有 cookies
          const allCookies = request.cookies.getAll();
          
          // 过滤出带前缀的 admin cookies，或标准的 sb-xxx cookies
          const filtered = allCookies
            .filter(cookie => {
              // 匹配带前缀的 cookie（sb-admin-xxx）
              if (cookie.name.startsWith(cookiePrefix + '-')) {
                return true;
              }
              // 也匹配标准的 Supabase cookie（sb-xxx），如果没有带前缀的
              if (cookie.name.startsWith('sb-') && !cookie.name.includes('-admin-') && !cookie.name.includes('-customer-') && !cookie.name.includes('-internal-')) {
                return true;
              }
              return false;
            })
            .map(cookie => {
              // 如果 cookie 名称带有前缀，还原为 Supabase 期望的格式
              if (cookie.name.startsWith(cookiePrefix + '-')) {
                return {
                  name: cookie.name.replace(`sb-admin-`, 'sb-'),
                  value: cookie.value,
                };
              }
              // 标准格式直接返回
              return cookie;
            });
          
          if (process.env.NODE_ENV === 'development' && filtered.length > 0) {
            console.log('[SSR CLIENT] Cookies found:', filtered.map(c => c.name));
          }
          
          return filtered;
        },
        setAll(cookiesToSet) {
          // 将 Supabase 设置的 cookies 写回 response，并加上前缀
          cookiesToSet.forEach(({ name, value, options }) => {
            const prefixedName = name.replace('sb-', `sb-admin-`);
            // 设置到 response cookies
            response.cookies.set(prefixedName, value, {
              ...options,
              httpOnly: true,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
              path: '/',
            });
          });
        },
      },
    }
  );

  return { supabase, response };
}
