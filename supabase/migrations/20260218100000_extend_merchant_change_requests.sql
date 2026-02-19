-- Extend merchant_change_requests to support price/inventory/poster change requests
-- (previously in dropped event_change_requests table)
-- request_type: null = week_config (legacy), 'price_change'|'inventory_change'|'poster_change'|'event_edit' = general
-- submitted_by: who submitted (for audit)
-- target_week_start_date: nullable for non-week requests

ALTER TABLE public.merchant_change_requests
  ADD COLUMN IF NOT EXISTS request_type TEXT,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.merchant_change_requests
  ALTER COLUMN target_week_start_date DROP NOT NULL;

COMMENT ON COLUMN public.merchant_change_requests.request_type IS 'price_change|inventory_change|poster_change|event_edit|null(week_config)';
COMMENT ON COLUMN public.merchant_change_requests.submitted_by IS 'User who submitted the request';
