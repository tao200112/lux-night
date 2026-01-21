/**
 * Internal Check-in Data Queries
 * 内部端核销数据查询函数
 */

import { createClient } from '@/lib/supabase/server';

export interface CheckinResult {
  result: 'OK' | 'ALREADY_USED' | 'WRONG_VENUE' | 'REFUNDED' | 'EXPIRED' | 'INVALID' | 'NOT_ALLOWED';
  reason: string;
  ticketId?: string;
  remaining?: number;
  success?: boolean;
}

/**
 * 核销票据
 */
export async function checkinTicket(
  ticketId: string,
  action: 'ENTRY' | 'DRINK',
  venueId?: string,
  deviceId?: string,
  clientTs?: number,
  note?: string,
  idempotencyKey?: string
): Promise<CheckinResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('checkin_ticket', {
    p_ticket_id: ticketId,
    p_action: action,
    p_venue_id: venueId || null,
    p_device_id: deviceId || null,
    p_client_ts: clientTs || null,
    p_note: note || null,
    p_idempotency_key: idempotencyKey || null,
  });

  if (error) {
    // 处理错误
    if (error.message === 'UNAUTHORIZED') {
      return { result: 'NOT_ALLOWED', reason: 'UNAUTHORIZED' };
    }
    return { result: 'INVALID', reason: error.message };
  }

  return {
    result: data.result,
    reason: data.reason || data.result,
    ticketId: data.ticket_id,
    remaining: data.remaining,
    success: data.success,
  };
}

/**
 * 通过票据代码查找票据
 */
export async function findTicketByCode(
  code: string,
  venueId?: string
): Promise<any | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // 首先尝试通过short_code查找（如果tickets表有short_code字段）
  // 或者通过qr_seed查找
  const { data: ticket, error } = await supabase
    .from('tickets')
    .select(`
      id,
      user_id,
      event_id,
      venue_id,
      ticket_type_id,
      status,
      redeem_limit,
      redeemed_count,
      qr_seed,
      created_at,
      events!inner(
        id,
        title,
        start_at,
        end_at,
        merchant_id,
        venues!inner(
          id,
          name,
          merchant_id
        )
      ),
      ticket_types!inner(
        id,
        name,
        category
      )
    `)
    .or(`qr_seed.eq.${code},id.eq.${code}`)
    .maybeSingle();

  if (error || !ticket) {
    return null;
  }

  // 如果指定了venueId，验证是否匹配
  if (venueId && ticket.venue_id !== venueId) {
    return null;
  }

  return ticket;
}

/**
 * 搜索票据（手动查找）
 */
export async function searchTickets(
  query: string,
  venueId?: string
): Promise<any[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  // 构建查询
  let ticketQuery = supabase
    .from('tickets')
    .select(`
      id,
      user_id,
      event_id,
      venue_id,
      ticket_type_id,
      status,
      redeem_limit,
      redeemed_count,
      qr_seed,
      created_at,
      events!inner(
        id,
        title,
        start_at,
        end_at,
        merchant_id,
        venues!inner(
          id,
          name,
          merchant_id
        )
      ),
      ticket_types!inner(
        id,
        name,
        category
      ),
      profiles!inner(
        id,
        display_name
      )
    `);

  // 如果指定了venueId，添加过滤
  if (venueId) {
    ticketQuery = ticketQuery.eq('venue_id', venueId);
  }

  // 搜索：通过qr_seed或id（使用or查询）
  if (query) {
    ticketQuery = ticketQuery.or(`qr_seed.ilike.%${query}%,id.ilike.%${query}%`);
  }

  // 限制结果数量
  ticketQuery = ticketQuery.limit(20);

  const { data, error } = await ticketQuery;

  if (error) {
    return [];
  }

  return data || [];
}
