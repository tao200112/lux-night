-- Add before_snapshot to merchant_change_requests for Admin diff display
-- Store current week config at submit time for Before vs After comparison

ALTER TABLE public.merchant_change_requests
  ADD COLUMN IF NOT EXISTS before_snapshot JSONB;

COMMENT ON COLUMN public.merchant_change_requests.before_snapshot IS 'Current week config snapshot at submit time; same structure as payload for diff display';
