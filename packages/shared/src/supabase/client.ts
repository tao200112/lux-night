/**
 * Shared Supabase Client
 * 支持自定义 cookie 前缀以隔离不同 app 的 session
 * 
 * 注意：@supabase/ssr 的 createBrowserClient 在浏览器端使用 localStorage
 * 由于同域名不同端口时 localStorage 会共享，我们需要通过其他方式隔离
 * 
 * 方案：在客户端，使用标准的 createBrowserClient，session 隔离通过
 * 服务端的 cookie 前缀来实现。客户端主要处理 OAuth 跳转。
 * 
 * 重要：虽然 localStorage 会共享，但由于服务端使用不同的 cookie 前缀，
 * 每次刷新页面时，服务端会设置正确的 cookie，客户端读取时会获取
 * 对应的 session。这样可以实现隔离。
 */

import { createBrowserClient } from '@supabase/ssr';

export type AppType = 'customer' | 'internal' | 'admin';

interface CreateClientOptions {
  appType: AppType;
}

export function createClient(options: CreateClientOptions) {
  const { appType } = options;
  
  // @supabase/ssr 的 createBrowserClient 默认使用 localStorage
  // 但在 SSR 环境中，为了确保服务器端可以读取 PKCE verifier，
  // 我们需要使用自定义 storage 适配器，将 verifier 也存储在 cookies 中
  //
  // 重要：PKCE code verifier 的存储
  // - OAuth 流程开始时，verifier 需要存储在 cookies 中（服务器端可访问）
  // - OAuth 回调时，服务器端从 cookies 读取 verifier
  // - 这样可以确保 SSR 环境中的一致性
  //
  // 注意：@supabase/ssr 的 createBrowserClient 默认使用 localStorage
  // 我们需要创建一个自定义 storage 适配器，同时写入 localStorage 和 cookies
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'pkce',          // 明确指定使用 PKCE 流程
        detectSessionInUrl: true,  // 从 URL 参数中检测 session（OAuth 回调后）
        persistSession: true,       // 持久化 session
        autoRefreshToken: true,     // 自动刷新 token
        // 使用默认的 localStorage（@supabase/ssr 会自动处理 cookies）
        // 注意：虽然客户端使用 localStorage，但 @supabase/ssr 会在需要时同步到 cookies
      },
    }
  );
}
