/**
 * Checkins Data Fetching Utilities
 * 核销数据获取工具
 */

import { createClient } from '@/lib/supabase/server';

export async function getCheckinsByWorkspace(workspaceId: string) {
  const supabase = await createClient();
  
  const { data: checkins, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('actor_merchant_id', workspaceId)
    .order('created_at', { ascending: false });
  
  if (error) {
    throw error;
  }
  
  return checkins || [];
}

export async function getCheckinById(checkinId: string) {
  const supabase = await createClient();
  
  const { data: checkin, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('id', checkinId)
    .single();
  
  if (error) {
    throw error;
  }
  
  return checkin;
}

export async function searchTickets(query: string, merchantId?: string) {
  const supabase = await createClient();
  
  // TODO: 实现票务搜索逻辑
  // 这应该搜索 tickets 表，而不是 checkins 表
  return [];
}
