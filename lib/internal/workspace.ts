/**
 * Workspace Management Utilities
 * Workspace 管理工具函数
 */

import { createClient } from '@/lib/supabase/server';
import type { Workspace } from './auth';

/**
 * 设置默认workspace
 */
export async function setDefaultWorkspace(
  merchantId: string,
  venueId?: string
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('UNAUTHORIZED');
  }

  // 验证用户是否有该merchant的membership
  const { data: membership } = await supabase
    .from('merchant_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
    .single();

  if (!membership) {
    throw new Error('NO_ACCESS');
  }

  // 如果指定了venue，验证该venue是否属于该merchant
  if (venueId) {
    const { data: venue } = await supabase
      .from('venues')
      .select('id')
      .eq('id', venueId)
      .eq('merchant_id', merchantId)
      .single();

    if (!venue) {
      throw new Error('INVALID_VENUE');
    }
  }

  // 更新profile
  const { error } = await supabase
    .from('profiles')
    .update({
      default_merchant_id: merchantId,
      default_venue_id: venueId || null,
    })
    .eq('id', user.id);

  if (error) {
    throw new Error('UPDATE_FAILED');
  }
}

/**
 * 获取当前活跃的workspace（从session或profile）
 */
export async function getActiveWorkspace(): Promise<Workspace | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_merchant_id, default_venue_id')
    .eq('id', user.id)
    .single();

  if (!profile?.default_merchant_id) {
    return null;
  }

  // 获取merchant和venue信息
  const { data: merchant } = await supabase
    .from('merchants')
    .select('name')
    .eq('id', profile.default_merchant_id)
    .single();

  if (!merchant) {
    return null;
  }

  let venueName: string | undefined;
  if (profile.default_venue_id) {
    const { data: venue } = await supabase
      .from('venues')
      .select('name')
      .eq('id', profile.default_venue_id)
      .single();
    
    venueName = venue?.name;
  }

  // 获取role
  const { data: membership } = await supabase
    .from('merchant_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('merchant_id', profile.default_merchant_id)
    .eq('is_active', true)
    .single();

  return {
    merchantId: profile.default_merchant_id,
    merchantName: merchant.name,
    venueId: profile.default_venue_id || undefined,
    venueName,
    role: membership?.role || 'STAFF',
  };
}
