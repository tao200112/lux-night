/**
 * Internal Workspace Data Queries
 * 内部端 Workspace 数据查询函数
 */

import { createClient } from '@/lib/supabase/server';

export interface WorkspaceData {
  merchantId: string;
  merchantName: string;
  role: string;
  isActive: boolean;
  venues: Array<{
    venueId: string;
    venueName: string;
    isAssigned: boolean;
  }>;
}

/**
 * 获取用户的workspace列表
 */
export async function getUserWorkspaces(): Promise<WorkspaceData[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase.rpc('get_user_workspaces');

  if (error || !data) {
    return [];
  }

  return data.map((ws: any) => ({
    merchantId: ws.merchant_id,
    merchantName: ws.merchant_name,
    role: ws.role,
    isActive: ws.is_active,
    venues: ws.venues || [],
  }));
}
