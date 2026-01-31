-- 20260201130000_add_ticket_type_v2_fk_to_order_items.sql
-- Force add ticket_type_v2_id column and relationship to order_items as explicitly requested

-- 1. Add column ticket_type_v2_id (if not exists)
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS ticket_type_v2_id UUID;

-- 2. Add FK to ticket_types_v2
-- Drop existing constraint if it exists (to be safe/clean)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'order_items_ticket_type_v2_id_fkey') THEN
    ALTER TABLE public.order_items DROP CONSTRAINT order_items_ticket_type_v2_id_fkey;
  END IF;
END $$;

ALTER TABLE public.order_items
ADD CONSTRAINT order_items_ticket_type_v2_id_fkey
FOREIGN KEY (ticket_type_v2_id) REFERENCES public.ticket_types_v2(id)
ON DELETE SET NULL;

-- 3. Add Index
CREATE INDEX IF NOT EXISTS idx_order_items_ticket_type_v2_id ON public.order_items(ticket_type_v2_id);

-- 4. Polyfill/Backfill Strategy
-- Attempt to backfill ticket_type_v2_id from ticket_type_id IF the ID exists in ticket_types_v2
-- This handles the case where data was written to the old column but is actually a v2 ticket ID
UPDATE public.order_items
SET ticket_type_v2_id = ticket_type_id
WHERE ticket_type_v2_id IS NULL
  AND ticket_type_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.ticket_types_v2 WHERE id = order_items.ticket_type_id);

-- 5. Grant permissions
GRANT SELECT ON public.order_items TO authenticated;
GRANT SELECT ON public.order_items TO service_role;
