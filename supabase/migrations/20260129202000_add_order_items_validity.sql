
-- Add validity snapshot fields to order_items
-- This allows us to lock in the validity window at Checkout time,
-- preventing Webhook from miscalculating based on dynamic configuration changes
-- or incorrect day logic.

ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS event_week_day_id UUID REFERENCES public.event_week_days(id),
ADD COLUMN IF NOT EXISTS valid_start_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS valid_end_at TIMESTAMPTZ;

COMMENT ON COLUMN public.order_items.event_week_day_id IS 'Snapshot of the specific day configuration selected by user';
COMMENT ON COLUMN public.order_items.valid_start_at IS 'Calculated start time at moment of checkout';
COMMENT ON COLUMN public.order_items.valid_end_at IS 'Calculated end time at moment of checkout';
