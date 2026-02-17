-- Add sold_count to ticket_types_v2 for inventory tracking (M3 #2 oversell prevention)
ALTER TABLE public.ticket_types_v2
ADD COLUMN IF NOT EXISTS sold_count INT NOT NULL DEFAULT 0;

ALTER TABLE public.ticket_types_v2
ADD CONSTRAINT ticket_types_v2_sold_count_non_negative
CHECK (sold_count >= 0);

COMMENT ON COLUMN public.ticket_types_v2.sold_count IS 'Number of tickets sold for this type (atomic increment in webhook)';

-- Atomic increment RPC for ticket_types_v2
CREATE OR REPLACE FUNCTION public.increment_ticket_type_v2_sold(
  p_ticket_type_id UUID,
  p_quantity INT
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ticket_types_v2
  SET sold_count = sold_count + p_quantity,
      updated_at = NOW()
  WHERE id = p_ticket_type_id;
$$;

COMMENT ON FUNCTION public.increment_ticket_type_v2_sold IS 'Atomically increment sold_count for ticket_types_v2 (webhook V2)';
