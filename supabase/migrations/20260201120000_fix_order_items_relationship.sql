-- 20260201120000_fix_order_items_relationship.sql
-- Force fix for order_items relationships and ticket referencing

-- 1. Ensure order_items has ticket_type_id_v2 (UUID)
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS ticket_type_id_v2 UUID;

-- 2. Add Foreign Key for ticket_type_id_v2 -> ticket_types_v2(id)
-- First drop if exists to ensure we have the correct constraint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'order_items_ticket_type_id_v2_fkey') THEN
    ALTER TABLE public.order_items DROP CONSTRAINT order_items_ticket_type_id_v2_fkey;
  END IF;
END $$;

-- Clean up any bad data before adding constraint if needed (set invalid to NULL)
UPDATE public.order_items
SET ticket_type_id_v2 = NULL
WHERE ticket_type_id_v2 IS NOT NULL
  AND ticket_type_id_v2 NOT IN (SELECT id FROM public.ticket_types_v2);

-- Add constraint
ALTER TABLE public.order_items
ADD CONSTRAINT order_items_ticket_type_id_v2_fkey
FOREIGN KEY (ticket_type_id_v2) REFERENCES public.ticket_types_v2(id)
ON DELETE SET NULL;

-- 3. Index for ticket_type_id_v2
CREATE INDEX IF NOT EXISTS idx_order_items_ticket_type_id_v2 ON public.order_items(ticket_type_id_v2);

-- 4. Ensure order_items -> orders FK exists and is indexed
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'order_items_order_id_fkey') THEN
    ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id)
    ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- 5. Fix Merchants API column mismatch (if any) by adding a generated column or view if strictly needed,
-- but typically we fix the code. However, let's ensure order_items has other needed columns.
-- Ensure amount_cents exists on orders vs total_cents. 
-- We typically won't rename columns in migration unless we know for sure. 
-- But existing code uses amount_cents in one place and total_cents in another.
-- Let's inspect orders columns via a safe helper (no-op but useful comment)
-- (No SQL action for column rename to avoid data loss, will fix in code)

-- 6. Grant permissions just in case
GRANT SELECT ON public.order_items TO authenticated;
GRANT SELECT ON public.order_items TO service_role;
