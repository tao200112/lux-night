/**
 * Internal Web Root Page
 * 根据用户状态重定向到相应页面
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function InternalRootPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  // DEBUG: 开发环境打印用户状态
  if (process.env.NODE_ENV === 'development') {
    console.log('[ROOT PAGE] User:', user ? user.id : 'NULL');
    console.log('[ROOT PAGE] User error:', userError?.message || 'NONE');
  }

  // 如果未登录，重定向到登录页
  if (!user) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ROOT PAGE] No user, redirecting to /login');
    }
    redirect('/login');
  }

  // 检查用户是否有 merchant_members
  const { data: memberships, error: membershipError } = await supabase
    .from('merchant_members')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1);

  // DEBUG: 开发环境打印 membership 查询结果
  if (process.env.NODE_ENV === 'development') {
    console.log('[ROOT PAGE] Memberships:', memberships?.length || 0);
    console.log('[ROOT PAGE] Membership error:', membershipError?.message || 'NONE');
  }

  // 如果没有 membership，重定向到邀请码门禁
  if (!memberships || memberships.length === 0) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ROOT PAGE] No membership, redirecting to /invite');
    }
    redirect('/invite');
  }

  // 根据角色重定向（统一使用小写）
  const role = memberships[0].role?.toLowerCase() || 'staff';
  if (role === 'staff') {
    redirect('/scan');
  } else {
    redirect('/dashboard');
  }
}
