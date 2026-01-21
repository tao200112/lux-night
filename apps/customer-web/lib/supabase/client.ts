/**
 * Customer Web Supabase Browser Client
 * 使用 @supabase/ssr 的 createBrowserClient
 * 
 * 注意：createBrowserClient 默认使用 localStorage 存储 session
 * 但 PKCE verifier 会通过 cookies 选项存储在 cookies 中
 * 这样服务器端可以读取 verifier，避免 PKCE verifier missing 错误
 */

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return document.cookie.split('; ').map(cookie => {
            const [name, ...rest] = cookie.split('=');
            return {
              name: decodeURIComponent(name),
              value: decodeURIComponent(rest.join('=')),
            };
          });
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // httpOnly cookies 不能在客户端设置，跳过
            if (options?.httpOnly) {
              return;
            }
            
            // 构建 cookie 字符串
            let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
            
            if (options) {
              if (options.maxAge) cookieString += `; Max-Age=${options.maxAge}`;
              if (options.domain) cookieString += `; Domain=${options.domain}`;
              if (options.path) cookieString += `; Path=${options.path || '/'}`;
              if (options.secure) cookieString += `; Secure`;
              if (options.sameSite) {
                cookieString += `; SameSite=${options.sameSite}`;
              }
            }
            
            document.cookie = cookieString;
          });
        },
      },
    }
  );
}
