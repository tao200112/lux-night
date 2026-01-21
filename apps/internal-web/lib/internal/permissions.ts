/**
 * Internal Permissions Utilities
 * 商家端权限检查工具
 */
import { createClient } from '@/lib/supabase/server';

/**
 * 检查用户是否是商户成员
 */
export async function isMerchantMember(merchantId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data, error } = await supabase
    .from('merchant_members')
    .select('id')
    .eq('merchant_id', merchantId)
    .eq('user_id', user.id)
    .single();

  return !!data && !error;
}

/**
 * 检查用户是否是商户 Owner
 */
export async function isMerchantOwner(merchantId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data, error } = await supabase
    .from('merchant_members')
    .select('id')
    .eq('merchant_id', merchantId)
    .eq('user_id', user.id)
    .eq('role', 'OWNER')
    .single();

  return !!data && !error;
}

/**
 * 检查用户是否是 Admin
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  // Use RPC to check admin status
  const { data, error } = await supabase.rpc('is_admin');

  return data === true && !error;
}

/**
 * 检查用户是否可以管理商户（Owner 或 Manager）
 */
export async function canManageMerchant(merchantId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data, error } = await supabase
    .from('merchant_members')
    .select('role')
    .eq('merchant_id', merchantId)
    .eq('user_id', user.id)
    .single();

  return !!data && !error && (data.role === 'OWNER' || data.role === 'MANAGER');
}
