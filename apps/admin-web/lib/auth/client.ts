/**
 * Admin Web Auth Client Utilities
 * Admin Portal 客户端认证工具（邮箱密码登录）
 */

import { createClient } from '@/lib/supabase/client';

export async function signInWithEmailPassword(email: string, password: string) {
  const supabase = createClient();
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  if (error) {
    throw error;
  }
  
  // 确保 session 写入 cookie
  // createBrowserClient 会自动处理，但我们可以显式等待
  if (data.session) {
    // 等待一下让 cookie 写入
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return data;
}

export async function signOut() {
  const supabase = createClient();
  
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  
  if (error) {
    throw error;
  }
}

export async function getUser() {
  const supabase = createClient();
  
  const { data: { user }, error } = await supabase.auth.getUser();
  
  // 不抛出错误，只返回 null（允许未登录状态）
  if (error) {
    return null;
  }
  
  return user;
}

export async function getSession() {
  const supabase = createClient();
  
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error) {
    throw error;
  }
  
  return session;
}
