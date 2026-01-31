-- 20260131160000_fix_admin_schema.sql

-- 1. Fix Orders Relationship with Events V2
-- Add explicit V2 foreign key column to avoid conflict with legacy events table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS event_v2_id UUID REFERENCES public.events_v2(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_event_v2 ON public.orders(event_v2_id);

-- Polyfill: For existing orders where event_id matches an event in events_v2, copy it to event_v2_id
-- This allows recent V2 orders to link correctly immediately
UPDATE public.orders
SET event_v2_id = event_id
WHERE event_v2_id IS NULL 
  AND event_id IS NOT NULL 
  AND EXISTS (SELECT 1 FROM public.events_v2 WHERE id = orders.event_id);

-- 2. Ensure Approvals Table Exists (using the name from 034 migration)
-- Just ensuring it's accessible. No schema change needed if 034 applied, but the code was using wrong name.
-- We will fix the code to use 'merchant_change_requests'.

-- 3. Fix Helper Functions if needed
-- (None needed for strictly schema relationships)
