/**
 * Customer Web Auth Client
 * 
 * 使用 @lux-night/shared 的统一认证工具
 */

'use client';

import { createClient } from '@/lib/supabase/client';
import { getOAuthRedirectTo } from '@lux-night/shared/auth';

export const APP_NAME = 'customer';
export const DEFAULT_AFTER_LOGIN = '/';

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
  
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
    },
  });

  if (error) {
    console.error('Error signing in with Google:', error);
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
 */
export async function signOut(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}

/**
 * 获取当前用户
 */
export async function getUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
