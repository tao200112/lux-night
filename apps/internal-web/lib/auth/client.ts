/**
 * Internal Web Auth Client
 * Internal 端认证客户端函数
 */

'use client';

import { createClient } from '@/lib/supabase/client';

/**
 * 获取 Internal App 的 OAuth 回调 URL
 * 
 * 重要：始终使用当前浏览器的 origin，确保在哪个端口登录就回到哪个端口
 * 不依赖环境变量，避免跨域重定向问题
 */
const getCallbackUrl = () => {
  // 始终使用当前页面的 origin，确保回调到同一个应用
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  // 服务端渲染时的 fallback（实际不应该在服务端调用此函数）
  return 'http://localhost:3001/auth/callback';
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
