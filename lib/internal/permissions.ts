/**
 * Permission Checking Utilities
 * 权限检查工具函数
 */

import { createClient } from '@/lib/supabase/server';
import type { InternalUser } from './auth';

/**
 * 检查用户是否有指定merchant的管理权限
 */
export async function canManageMerchant(merchantId: string): Promise<boolean> {
  const supabase = await createClient();
  
  // 使用已有的RLS函数
  const { data, error } = await supabase
    .rpc('can_manage_merchant', { p_merchant_id: merchantId });

  return !error && data === true;
}

/**
 * 检查用户是否有指定merchant的成员身份
 */
export async function hasMerchantRole(
  merchantId: string,
  roles: ('OWNER' | 'MANAGER' | 'STAFF' | 'admin')[]
): Promise<boolean> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .rpc('has_merchant_role', {
      p_merchant_id: merchantId,
      p_roles: roles,
    });

  return !error && data === true;
}

/**
 * 检查用户是否是admin
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .rpc('is_admin');

  return !error && data === true;
}

/**
 * 检查用户是否可以访问指定venue
 */
export async function canAccessVenue(
  venueId: string,
  merchantId?: string
): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  // 如果是admin，允许访问
  if (await isAdmin()) {
    return true;
  }

  // 获取venue的merchant_id
  if (!merchantId) {
    const { data: venue } = await supabase
      .from('venues')
      .select('merchant_id')
      .eq('id', venueId)
      .single();

    if (!venue) {
      return false;
    }
    merchantId = venue.merchant_id;
  }

  // 检查是否有merchant成员身份
  const { data: membership } = await supabase
    .from('merchant_members')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
    .single();

  if (!membership) {
    return false;
  }

  // 如果是OWNER或MANAGER，可以访问所有venue
  if (membership.role === 'OWNER' || membership.role === 'MANAGER') {
    return true;
  }

  // 如果是STAFF，检查是否有member_venues限制
  const { data: memberVenues } = await supabase
    .from('member_venues')
    .select('venue_id')
    .eq('member_id', membership.id);

  // 如果没有member_venues记录，说明可以访问所有venue
  if (!memberVenues || memberVenues.length === 0) {
    return true;
  }

  // 检查是否有该venue的权限
  return memberVenues.some(mv => mv.venue_id === venueId);
}

/**
 * 检查用户是否可以执行某个操作（基于role）
 */
export function canPerformAction(
  userRole: string,
  requiredRoles: string[]
): boolean {
  return requiredRoles.includes(userRole);
}

/**
 * 从InternalUser获取指定merchant的role
 */
export function getRoleForMerchant(
  internalUser: InternalUser,
  merchantId: string
): string | null {
  const membership = internalUser.memberships.find(
    m => m.merchantId === merchantId && m.isActive
  );
  return membership?.role || null;
}
