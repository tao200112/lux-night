import { createClient } from '@/lib/supabase/client';

export interface TicketType {
  id: string;
  event_id: string;
  name: string;
  description?: string | null;
  category: 'ENTRY' | 'DRINK' | 'VIP' | 'SKIP_LINE';
  price_cents: number;
  currency: string;
  inventory_limit: number | null;
  quantity_total?: number | null;
  sold_count: number;
  redeem_limit: number;
  max_per_order?: number;
  is_active: boolean;
  age_requirement?: 'NONE' | '18_PLUS' | '21_PLUS';
  status?: 'DRAFT' | 'ACTIVE' | 'HIDDEN';
  sort_order?: number;
  sales_start_at?: string | null;
  sales_end_at?: string | null;
  created_at: string;
  updated_at: string;
}

export async function getTicketTypes(eventId: string): Promise<TicketType[]> {
  const supabase = createClient();
  
  const now = new Date().toISOString();
  
  // 只获取 ACTIVE 状态的票种，且在销售窗口内（如果设置了销售窗口）
  let query = supabase
    .from('ticket_types')
    .select('*')
    .eq('event_id', eventId)
    .eq('status', 'ACTIVE')
    .order('sort_order', { ascending: true });
  
  // 过滤销售窗口：如果没有设置销售窗口，或者当前时间在窗口内
  // 使用 OR 条件：sales_start_at IS NULL OR sales_start_at <= now
  // 并且 sales_end_at IS NULL OR sales_end_at >= now
  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching ticket types:', error);
    throw new Error('Failed to fetch ticket types');
  }

  // 客户端过滤销售窗口（因为 Supabase 的 OR 条件比较复杂）
  const filtered = (data || []).filter((tt: any) => {
    const salesStart = tt.sales_start_at ? new Date(tt.sales_start_at) : null;
    const salesEnd = tt.sales_end_at ? new Date(tt.sales_end_at) : null;
    const nowDate = new Date();
    
    // 如果没有设置销售窗口，则始终可用
    if (!salesStart && !salesEnd) return true;
    
    // 检查是否在销售窗口内
    if (salesStart && nowDate < salesStart) return false;
    if (salesEnd && nowDate > salesEnd) return false;
    
    return true;
  });

  return filtered;
}

export async function getTicketType(id: string): Promise<TicketType | null> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('Error fetching ticket type:', error);
    return null;
  }

  return data;
}
