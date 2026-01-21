/**
 * Requests Data Fetching Utilities for Admin
 * Admin 端请求数据获取工具
 */

import { createAdminClient } from '@/lib/supabase/admin';

export async function getRequestById(requestId: string) {
  const supabase = createAdminClient();
  
  const { data: request, error } = await supabase
    .from('requests')
    .select('*')
    .eq('id', requestId)
    .single();
  
  if (error) {
    throw error;
  }
  
  return request;
}

export async function getRequests(merchantId?: string, status?: string) {
  const supabase = createAdminClient();
  
  let query = supabase
    .from('requests')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (merchantId) {
    query = query.eq('merchant_id', merchantId);
  }
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data: requests, error } = await query;
  
  if (error) {
    throw error;
  }
  
  return requests || [];
}
