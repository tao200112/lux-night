/**
 * Customer Web Auth Client
 * 确保 OAuth 回调指向 customer app
 */

'use client';

import { createClient } from '@/lib/supabase/client';

const getCallbackUrl = () => {
  // 优先使用 NEXT_PUBLIC_* 环境变量（Vercel 生产环境）
  // 客户端组件只能访问 NEXT_PUBLIC_* 前缀的环境变量
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || 
                 (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  return `${origin}/auth/callback`;
};

export async function signInWithGoogle(redirectTo?: string): Promise<void> {
  const supabase = createClient();
  const callbackUrl = redirectTo || getCallbackUrl();
  
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl,
    },
  });

  if (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
}

export async function signInWithApple(redirectTo?: string): Promise<void> {
  const supabase = createClient();
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

export async function signOut(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}

export async function getUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
