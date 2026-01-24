-- Add stripe_webhook_events table for webhook idempotency and event tracking
-- This table stores all Stripe webhook events to prevent duplicate processing
-- and enable debugging/failure tracking

BEGIN;

-- Create stripe_webhook_events table
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,  -- Stripe event.id (e.g., evt_xxx)
  event_type TEXT NOT NULL,       -- Stripe event.type (e.g., checkout.session.completed)
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  error_message TEXT,
  raw_event JSONB,                 -- Full Stripe event object for debugging
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id ON public.stripe_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_type ON public.stripe_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed ON public.stripe_webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_order_id ON public.stripe_webhook_events(order_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_created_at ON public.stripe_webhook_events(created_at DESC);

-- Add updated_at trigger
DROP TRIGGER IF EXISTS trg_stripe_webhook_events_updated_at ON public.stripe_webhook_events;
CREATE TRIGGER trg_stripe_webhook_events_updated_at
BEFORE UPDATE ON public.stripe_webhook_events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS (Row Level Security)
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only admins can read webhook events (for debugging)
DROP POLICY IF EXISTS "stripe_webhook_events_read_admin" ON public.stripe_webhook_events;
CREATE POLICY "stripe_webhook_events_read_admin"
ON public.stripe_webhook_events FOR SELECT
TO authenticated
USING (public.is_admin());

-- RLS Policy: Service role can insert/update (for webhook handler)
-- Note: Webhook handler uses service role key, so this allows inserts
DROP POLICY IF EXISTS "stripe_webhook_events_insert_service" ON public.stripe_webhook_events;
CREATE POLICY "stripe_webhook_events_insert_service"
ON public.stripe_webhook_events FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "stripe_webhook_events_update_service" ON public.stripe_webhook_events;
CREATE POLICY "stripe_webhook_events_update_service"
ON public.stripe_webhook_events FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

COMMIT;
