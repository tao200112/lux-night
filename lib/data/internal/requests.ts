/**
 * Internal Requests Data Queries
 * 内部端申请数据查询函数
 */

import { createClient } from '@/lib/supabase/server';

export interface Request {
  id: string;
  merchantId: string;
  venueId: string | null;
  requestedBy: string;
  type: 'venue_edit' | 'new_event' | 'price_change' | 'inventory_change';
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  payload: any; // JSONB
  adminNote: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 获取merchant的申请列表
 */
export async function getRequests(
  merchantId: string,
  status?: string,
  type?: string
): Promise<Request[]> {
  const supabase = await createClient();

  let query = supabase
    .from('requests')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  if (type) {
    query = query.eq('type', type);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map((req: any) => ({
    id: req.id,
    merchantId: req.merchant_id,
    venueId: req.venue_id,
    requestedBy: req.requested_by,
    type: req.type,
    status: req.status,
    payload: req.payload,
    adminNote: req.admin_note,
    decidedBy: req.decided_by,
    decidedAt: req.decided_at,
    createdAt: req.created_at,
    updatedAt: req.updated_at,
  }));
}

/**
 * 获取单个申请详情
 */
export async function getRequestById(requestId: string): Promise<Request | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    merchantId: data.merchant_id,
    venueId: data.venue_id,
    requestedBy: data.requested_by,
    type: data.type,
    status: data.status,
    payload: data.payload,
    adminNote: data.admin_note,
    decidedBy: data.decided_by,
    decidedAt: data.decided_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * 创建申请
 */
export async function createRequest(
  merchantId: string,
  type: 'venue_edit' | 'new_event' | 'price_change' | 'inventory_change',
  payload: any,
  venueId?: string
): Promise<Request> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('UNAUTHORIZED');
  }

  const { data, error } = await supabase
    .from('requests')
    .insert({
      merchant_id: merchantId,
      venue_id: venueId || null,
      requested_by: user.id,
      type,
      status: 'pending',
      payload,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error('CREATE_FAILED');
  }

  // 创建request_event记录
  await supabase
    .from('request_events')
    .insert({
      request_id: data.id,
      event_type: 'created',
      before: null,
      after: payload,
      created_by: user.id,
    });

  return {
    id: data.id,
    merchantId: data.merchant_id,
    venueId: data.venue_id,
    requestedBy: data.requested_by,
    type: data.type,
    status: data.status,
    payload: data.payload,
    adminNote: data.admin_note,
    decidedBy: data.decided_by,
    decidedAt: data.decided_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
