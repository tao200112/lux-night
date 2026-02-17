-- Atomic increment for ticket_types.sold_count (only if ticket_types exists - legacy V1)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ticket_types') THEN
    EXECUTE '
      CREATE OR REPLACE FUNCTION public.increment_ticket_type_sold(p_ticket_type_id UUID, p_quantity INT)
      RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $f$
        UPDATE public.ticket_types SET sold_count = sold_count + p_quantity, updated_at = NOW() WHERE id = p_ticket_type_id;
      $f$';
    RAISE NOTICE 'Created increment_ticket_type_sold (ticket_types exists)';
  ELSE
    RAISE NOTICE 'Skipped increment_ticket_type_sold (ticket_types table does not exist)';
  END IF;
END $$;

-- Atomic increment for ambassador_invites.uses_count (prevents race, enforces max_uses)
CREATE OR REPLACE FUNCTION public.increment_ambassador_invite_usage(p_invite_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ambassador_invites
  SET uses_count = uses_count + 1,
      updated_at = NOW()
  WHERE id = p_invite_id
    AND (max_uses IS NULL OR uses_count < max_uses);
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.increment_ambassador_invite_usage IS 'Atomically increment uses_count if under max_uses; returns false if limit reached (race)';
