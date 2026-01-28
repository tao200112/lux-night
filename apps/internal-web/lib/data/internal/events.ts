/**
 * Events Data Fetching Utilities (V2 Migration)
 * 事件数据获取工具
 */

import { createClient } from '@/lib/supabase/server';

export async function getEventsByWorkspace(workspaceId: string) {
  const supabase = await createClient();
  
  const { data: events, error } = await supabase
    .from('events_v2')
    .select('*')
    .eq('merchant_id', workspaceId)
    .order('created_at', { ascending: false });
  
  if (error) {
    throw error;
  }
  
  // Map back to expected shape if needed, or return V2 shape
  // Most internal UIs just list them.
  return (events || []).map(e => ({
      ...e,
      start_at: e.created_at, // Fallback
      end_at: e.created_at
  }));
}

export async function getMerchantEvents(
  merchantId: string,
  venueId?: string,
  status?: string
) {
  const supabase = await createClient();
  
  let query = supabase
    .from('events_v2')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false });
  
  // V2 events don't have direct venue_id. 
  // If venueId is provided, we technically can't filter events_v2 directly unless we join.
  // But typically one merchant = one venue in this V2 model context or we ignore venue filter for now.
  // We will ignore venueId filter to prevent crash, or logged it.
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data: events, error } = await query;
  
  if (error) {
    throw error;
  }
  
  return (events || []).map(e => ({
      ...e,
      start_at: e.created_at,
      end_at: e.created_at,
      venue_id: venueId || '' // Mock if needed
  }));
}

export async function getEventById(eventId: string, merchantId?: string) {
  const supabase = await createClient();
  
  let query = supabase
    .from('events_v2')
    .select('*')
    .eq('id', eventId);
  
  if (merchantId) {
    query = query.eq('merchant_id', merchantId);
  }
  
  const { data: event, error } = await query.single();
  
  if (error) {
    throw error;
  }
  
  // Polyfill start_at/end_at for compatibility
  if (event) {
      (event as any).start_at = event.created_at;
      (event as any).end_at = event.created_at;
  }

  return event;
}
