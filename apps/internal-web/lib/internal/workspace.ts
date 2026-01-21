/**
 * Workspace Management Utilities
 * Workspace 管理工具函数
 */

import { createClient } from '@/lib/supabase/server';
import type { Workspace } from './auth';

/**
 * 设置默认 workspace
 * @param merchantId 商户 ID
 * @param venueId 场地 ID (可选)
 */
export async function setDefaultWorkspace(
  merchantId: string,
  venueId?: string
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('UNAUTHENTICATED');
  }

  // 验证 membership 存在
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

  // 验证 venue（如果指定）
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

  // 更新 profile
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
 * 获取活跃 workspace（从 profile.default 或 session）
 * @returns Workspace 或 null
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

  // 获取 merchant 名称
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

  // 获取 role
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
