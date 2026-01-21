/**
 * Admin Permissions Utilities
 * Admin 权限检查工具
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 检查当前用户是否是 admin
 * 使用 service role key 查询，绕过 RLS
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    // 使用 admin client 查询用户是否是 admin
    const adminClient = createAdminClient();
    const { data: profile, error } = await adminClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (error || !profile) {
      console.error('Error checking admin status:', error);
      return false;
    }

    return profile.is_admin === true;
  } catch (error) {
    console.error('Error in isAdmin check:', error);
    return false;
  }
}
