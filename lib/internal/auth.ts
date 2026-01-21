/**
 * Internal Authentication Utilities
 * 内部端认证相关工具函数
 */

import { createClient } from '@/lib/supabase/server';
import { User } from '@supabase/supabase-js';

export interface InternalUser {
  user: User;
  memberships: Membership[];
  defaultWorkspace?: Workspace;
}

export interface Membership {
  merchantId: string;
  merchantName: string;
  role: 'OWNER' | 'MANAGER' | 'STAFF' | 'admin';
  isActive: boolean;
  venues: VenueAccess[];
}

export interface VenueAccess {
  venueId: string;
  venueName: string;
  isAssigned: boolean; // 如果为true，表示该成员只能访问这个venue
}

export interface Workspace {
  merchantId: string;
  merchantName: string;
  venueId?: string;
  venueName?: string;
  role: string;
}

/**
 * 获取当前用户的内部端信息（包含memberships）
 */
export async function getInternalUser(): Promise<InternalUser | null> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  // 调用RPC获取workspaces
  const { data: workspaces, error: workspaceError } = await supabase
    .rpc('get_user_workspaces');

  if (workspaceError || !workspaces) {
    return {
      user,
      memberships: [],
    };
  }

  const memberships: Membership[] = workspaces.map((ws: any) => ({
    merchantId: ws.merchant_id,
    merchantName: ws.merchant_name,
    role: ws.role,
    isActive: ws.is_active,
    venues: ws.venues || [],
  }));

  // 获取默认workspace
  const { data: profile } = await supabase
    .from('profiles')
    .select('default_merchant_id, default_venue_id')
    .eq('id', user.id)
    .single();

  let defaultWorkspace: Workspace | undefined;
  if (profile?.default_merchant_id) {
    const membership = memberships.find(m => m.merchantId === profile.default_merchant_id);
    if (membership) {
      const venue = profile.default_venue_id
        ? membership.venues.find(v => v.venueId === profile.default_venue_id)
        : membership.venues[0];
      
      defaultWorkspace = {
        merchantId: membership.merchantId,
        merchantName: membership.merchantName,
        venueId: venue?.venueId,
        venueName: venue?.venueName,
        role: membership.role,
      };
    }
  }

  // 如果没有默认workspace，使用第一个membership
  if (!defaultWorkspace && memberships.length > 0) {
    const first = memberships[0];
    defaultWorkspace = {
      merchantId: first.merchantId,
      merchantName: first.merchantName,
      venueId: first.venues[0]?.venueId,
      venueName: first.venues[0]?.venueName,
      role: first.role,
    };
  }

  return {
    user,
    memberships,
    defaultWorkspace,
  };
}

/**
 * 要求用户已登录（内部端）
 * 如果未登录，抛出错误或重定向
 */
export async function requireInternalAuth(): Promise<InternalUser> {
  const internalUser = await getInternalUser();
  if (!internalUser) {
    throw new Error('UNAUTHORIZED');
  }
  return internalUser;
}

/**
 * 检查用户是否有任何workspace
 */
export async function hasWorkspace(): Promise<boolean> {
  const internalUser = await getInternalUser();
  return internalUser?.memberships.length > 0 ?? false;
}
