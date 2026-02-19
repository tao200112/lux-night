/**
 * merchant_change_requests 表数据模型
 * DB 表名: merchant_change_requests (唯一来源，event_change_requests 已删除)
 *
 * 字段映射:
 * - payload / changes → payload
 * - before_snapshot → before_snapshot
 * - status → status
 * - type → request_type
 * - target_id → event_id (+ target_week_start_date for week_config)
 * - approved_by → reviewed_by_admin
 * - approved_at → reviewed_at
 * - rejection_reason → review_note
 */

export interface MerchantChangeRequest {
  id: string;
  merchant_id: string;
  event_id: string;
  target_week_start_date: string | null;
  payload: Record<string, unknown>;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewed_by_admin: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  request_type: string | null;
  submitted_by: string | null;
  before_snapshot: Record<string, unknown> | null;
}

export type MerchantChangeRequestStatus = MerchantChangeRequest['status'];
