/**
 * Shared Supabase Server Client
 * 支持自定义 cookie 前缀以隔离不同 app 的 session
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export type AppType = 'customer' | 'internal' | 'admin';

interface CreateClientOptions {
  appType: AppType;
}

export async function createClient(options: CreateClientOptions) {
  const { appType } = options;
  const cookieStore = await cookies();

  // Cookie 前缀用于隔离不同 app
  const cookiePrefix = `sb-${appType}`;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // 获取所有 cookies，但只返回该 app 的 cookies
          const allCookies = cookieStore.getAll();
          
          // DEBUG: 开发环境打印所有 cookie（限制日志长度）
          if (process.env.NODE_ENV === 'development' && allCookies.length > 0) {
            const authCookies = allCookies.filter(c => c.name.includes('sb-') || c.name.includes('auth'));
            if (authCookies.length > 0) {
              console.log(`[SUPABASE SERVER ${appType.toUpperCase()}] Total cookies:`, allCookies.length, '| Auth cookies:', authCookies.map(c => c.name));
            }
          }
          
          // 只匹配该 app 的 cookie（严格过滤）
          const filtered = allCookies.filter(cookie => {
            // 优先匹配带前缀的 cookie（setAll 写入的格式）
            // sb-customer-xxx-auth-token 或 sb-internal-xxx-auth-token 或 sb-admin-xxx-auth-token
            if (cookie.name.startsWith(cookiePrefix + '-')) {
              return true;
            }
            // 匹配包含 appType 的 cookie（备用格式）
            if (cookie.name.includes(`-${appType}-`)) {
              return true;
            }
            // 如果没找到带前缀的 cookie，也匹配标准的 Supabase cookie（sb-xxx-auth-token）
            // 这样可以兼容旧的 cookie 格式
            const hasPrefixedCookie = allCookies.some(c => c.name.startsWith(cookiePrefix + '-'));
            if (!hasPrefixedCookie && cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')) {
              return true;
            }
            return false;
          }).map(cookie => {
            // 如果 cookie 名称带有前缀，需要还原为 Supabase 期望的格式
            // Supabase 期望的格式是 'sb-<project-ref>-auth-token'
            // 我们写入的格式可能是 'sb-internal-<project-ref>-auth-token'
            // 读取时需要去掉 'internal-' 或 'customer-' 前缀
            if (cookie.name.startsWith(cookiePrefix + '-')) {
              // 去掉前缀：sb-internal-xxx -> sb-xxx
              const originalName = cookie.name.replace(`sb-${appType}-`, 'sb-');
              return {
                name: originalName,
                value: cookie.value,
              };
            }
            return cookie;
          });
          
          // 限制返回的 cookie 数量（只返回最新的 session cookie）
          // Supabase 通常只需要 access_token 和 refresh_token
          const limited = filtered.slice(0, 4); // 最多返回 4 个 cookie
          
          // DEBUG: 开发环境打印过滤后的 cookie
          if (process.env.NODE_ENV === 'development' && filtered.length > 0) {
            console.log(`[SUPABASE SERVER ${appType.toUpperCase()}] Filtered cookies (${filtered.length} -> ${limited.length}):`, limited.map(c => c.name));
          }
          
          return limited;
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            // 先清理旧的同名 cookie（无前缀版本）
            // 这样可以避免 cookie 累积
            cookiesToSet.forEach(({ name }) => {
              // 如果设置的是标准格式的 cookie（sb-xxx-auth-token），先清理可能存在的无前缀版本
              if (name.startsWith('sb-') && !name.includes(`-${appType}-`)) {
                try {
                  // 尝试删除旧的无前缀 cookie（如果存在）
                  const allCookies = cookieStore.getAll();
                  const oldCookies = allCookies.filter(c => 
                    c.name === name && 
                    !c.name.startsWith(cookiePrefix + '-')
                  );
                  // 注意：Next.js cookies() API 没有直接的 delete 方法
                  // 我们通过设置空值和过期时间来清理
                  oldCookies.forEach(oldCookie => {
                    cookieStore.set(oldCookie.name, '', {
                      expires: new Date(0),
                      path: '/',
                    });
                  });
                } catch (err) {
                  // 忽略清理错误
                }
              }
            });
            
            // 设置新的 cookie
            cookiesToSet.forEach(({ name, value, options }) => {
              // 确保 cookie 名称有正确的前缀
              let prefixedName = name;
              
              // 如果 cookie 名称是 Supabase 的标准格式（sb-xxx-auth-token），添加前缀
              if (name.startsWith('sb-') && !name.includes(`-${appType}-`)) {
                // 替换前缀: sb-xxx-auth-token -> sb-internal-xxx-auth-token
                prefixedName = name.replace(/^sb-/, `sb-${appType}-`);
              } else if (!name.startsWith(cookiePrefix)) {
                // 如果完全没有 sb- 前缀，添加完整前缀
                prefixedName = `${cookiePrefix}-${name}`;
              }
              
              // 设置 cookie（带前缀的版本）
              cookieStore.set(prefixedName, value, {
                ...options,
                httpOnly: options?.httpOnly ?? true,
                secure: options?.secure ?? process.env.NODE_ENV === 'production',
                sameSite: options?.sameSite ?? 'lax',
                path: options?.path ?? '/',
              });
              
              // DEBUG: 开发环境打印设置的 cookie（限制日志）
              if (process.env.NODE_ENV === 'development' && cookiesToSet.length <= 4) {
                console.log(`[SUPABASE SERVER ${appType.toUpperCase()}] Set cookie:`, prefixedName, '(original:', name + ')');
              }
            });
          } catch (err) {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
            if (process.env.NODE_ENV === 'development') {
              console.error(`[SUPABASE SERVER ${appType.toUpperCase()}] Error setting cookies:`, err);
            }
          }
        },
      },
    }
  );
}
