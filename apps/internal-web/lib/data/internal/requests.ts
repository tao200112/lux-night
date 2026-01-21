/**
 * Requests Data Fetching Utilities
 * 请求数据获取工具
 */

import { createClient } from '@/lib/supabase/server';

export async function getRequests(merchantId?: string, status?: string, type?: string) {
  const supabase = await createClient();
  
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
  
  if (type) {
    query = query.eq('type', type);
  }
  
  const { data: requests, error } = await query;
  
  if (error) {
    throw error;
  }
  
  return requests || [];
}

export async function getRequestById(requestId: string) {
  const supabase = await createClient();
  
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

export async function createRequest(data: any) {
  const supabase = await createClient();
  
  const { data: request, error } = await supabase
    .from('requests')
    .insert(data)
    .select()
    .single();
  
  if (error) {
    throw error;
  }
  
  return request;
}
