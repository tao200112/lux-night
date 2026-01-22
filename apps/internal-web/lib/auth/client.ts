/**
 * Internal Web Auth Client
 * Internal 端认证客户端函数
 * 
 * 使用 @lux-night/shared 的统一认证工具
 */

'use client';

import { createClient } from '@/lib/supabase/client';
import { getOAuthRedirectTo } from '@lux-night/shared/auth';

export const APP_NAME = 'internal';
export const DEFAULT_AFTER_LOGIN = '/workspaces';

/**
 * Google 登录
 * 
 * 使用统一的 OAuth 回调 URL，不再支持自定义 redirectTo
 * 登录前的目标路径通过 setPostAuthRedirect 设置
 */
export async function signInWithGoogle(): Promise<void> {
  const supabase = createClient();
  
  // 使用统一的回调 URL 生成器
  const redirectTo = getOAuthRedirectTo(window.location.origin);
  
  console.log('[Google OAuth] Initiating with redirectTo:', redirectTo);
  
  // 使用最简参数，不添加额外的 queryParams
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
    },
  });

  if (error) {
    console.error('[Google OAuth] Error:', error);
    throw error;
  }
}

/**
 * Apple 登录
 * 
 * 使用统一的 OAuth 回调 URL，不再支持自定义 redirectTo
 * 登录前的目标路径通过 setPostAuthRedirect 设置
 */
export async function signInWithApple(): Promise<void> {
  const supabase = createClient();
  
  // 使用统一的回调 URL 生成器
  const redirectTo = getOAuthRedirectTo(window.location.origin);
  
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo,
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
