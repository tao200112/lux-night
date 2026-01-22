-- Create event_change_requests table for merchant event edit approval workflow
-- 商家编辑活动审批流数据表

CREATE TABLE IF NOT EXISTS event_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  payload_json JSONB NOT NULL, -- 保存商家提交的修改内容（完整 patch 或 diff）
  submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_event_change_requests_merchant_id ON event_change_requests(merchant_id);
CREATE INDEX idx_event_change_requests_event_id ON event_change_requests(event_id);
CREATE INDEX idx_event_change_requests_status ON event_change_requests(status);
CREATE INDEX idx_event_change_requests_submitted_by ON event_change_requests(submitted_by);

-- RLS Policies
ALTER TABLE event_change_requests ENABLE ROW LEVEL SECURITY;

-- Merchants can view their own requests
CREATE POLICY "Merchants can view their own event change requests"
  ON event_change_requests
  FOR SELECT
  USING (
    merchant_id IN (
      SELECT merchant_id FROM merchant_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Merchants can create requests for their own events
CREATE POLICY "Merchants can create event change requests for their events"
  ON event_change_requests
  FOR INSERT
  WITH CHECK (
    merchant_id IN (
      SELECT merchant_id FROM merchant_members
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND event_id IN (
      SELECT id FROM events WHERE merchant_id = event_change_requests.merchant_id
    )
  );

-- Admins can view all requests
CREATE POLICY "Admins can view all event change requests"
  ON event_change_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Admins can update requests (approve/reject)
CREATE POLICY "Admins can update event change requests"
  ON event_change_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_event_change_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_event_change_requests_updated_at
  BEFORE UPDATE ON event_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_event_change_requests_updated_at();
