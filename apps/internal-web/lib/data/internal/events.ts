/**
 * Events Data Fetching Utilities
 * 事件数据获取工具
 */

import { createClient } from '@/lib/supabase/server';

export async function getEventsByWorkspace(workspaceId: string) {
  const supabase = await createClient();
  
  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .eq('merchant_id', workspaceId)
    .order('start_at', { ascending: false });
  
  if (error) {
    throw error;
  }
  
  return events || [];
}

export async function getMerchantEvents(
  merchantId: string,
  venueId?: string,
  status?: string
) {
  const supabase = await createClient();
  
  let query = supabase
    .from('events')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('start_at', { ascending: false });
  
  if (venueId) {
    query = query.eq('venue_id', venueId);
  }
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data: events, error } = await query;
  
  if (error) {
    throw error;
  }
  
  return events || [];
}

export async function getEventById(eventId: string, merchantId?: string) {
  const supabase = await createClient();
  
  let query = supabase
    .from('events')
    .select('*')
    .eq('id', eventId);
  
  if (merchantId) {
    query = query.eq('merchant_id', merchantId);
  }
  
  const { data: event, error } = await query.single();
  
  if (error) {
    throw error;
  }
  
  return event;
}
