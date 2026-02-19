-- Add display_name override to merchant_members for per-merchant display (owner/manager can set)
ALTER TABLE public.merchant_members
  ADD COLUMN IF NOT EXISTS display_name TEXT;

COMMENT ON COLUMN public.merchant_members.display_name IS 'Optional override for display name within this merchant (falls back to profiles.display_name)';
