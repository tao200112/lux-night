/**
 * Internal Web Auth Client
 * Internal 端认证客户端函数
 */

'use client';

import { createClient } from '@/lib/supabase/client';

/**
 * 获取 Internal App 的 OAuth 回调 URL
 */
const getCallbackUrl = () => {
  // 优先使用 NEXT_PUBLIC_* 环境变量（Vercel 生产环境）
  // 客户端组件只能访问 NEXT_PUBLIC_* 前缀的环境变量
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || 
                 (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
  return `${origin}/auth/callback`;
};

/**
 * Google 登录
 * @param redirectTo 登录成功后重定向的 URL（可选，默认使用当前应用的 /auth/callback）
 */
export async function signInWithGoogle(redirectTo?: string): Promise<void> {
  const supabase = createClient();
  
  // 确保 redirectTo 使用当前应用的 origin
  const callbackUrl = redirectTo || getCallbackUrl();
  
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
}

/**
 * Apple 登录
 * @param redirectTo 登录成功后重定向的 URL（可选，默认使用当前应用的 /auth/callback）
 */
export async function signInWithApple(redirectTo?: string): Promise<void> {
  const supabase = createClient();
  
  // 确保 redirectTo 使用当前应用的 origin
  const callbackUrl = redirectTo || getCallbackUrl();
  
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: callbackUrl,
    },
  });

  if (error) {
    console.error('Error signing in with Apple:', error);
    throw error;
  }
}

/**
 * 登出当前用户
 * @param redirectTo 登出后重定向的 URL（可选，默认重定向到登录页）
 */
export async function signOut(redirectTo?: string): Promise<void> {
  const supabase = createClient();
  
  const { error } = await supabase.auth.signOut({
    scope: 'global', // 清除所有会话
  });

  if (error) {
    console.error('Error signing out:', error);
    throw error;
  }

  // 登出成功后重定向
  if (typeof window !== 'undefined') {
    const targetUrl = redirectTo || '/login';
    window.location.href = targetUrl;
  }
}
