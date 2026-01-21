-- =========================================================
-- 8) RPC: redeem invite (recommended)
-- =========================================================
CREATE OR REPLACE FUNCTION public.redeem_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invites%rowtype;
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT * INTO v_inv
  FROM public.invites
  WHERE token = p_token
    AND is_active = true
    AND NOW() < expires_at
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  IF v_inv.used_count >= v_inv.max_uses THEN
    RAISE EXCEPTION 'CONFLICT';
  END IF;

  -- upsert membership
  INSERT INTO public.merchant_members(merchant_id, user_id, role, is_active)
  VALUES (v_inv.merchant_id, v_user, v_inv.intended_role, true)
  ON CONFLICT (merchant_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, is_active = true, updated_at = NOW();

  UPDATE public.invites
  SET used_count = used_count + 1, updated_at = NOW()
  WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'merchant_id', v_inv.merchant_id,
    'role', v_inv.intended_role
  );
END;
$$;

-- Allow authenticated users to call redeem_invite
REVOKE ALL ON FUNCTION public.redeem_invite(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_invite(TEXT) TO authenticated;

-- =========================================================
-- 9) RPC: check-in (recommended, enforces "second click confirm" server-side)
-- =========================================================
CREATE OR REPLACE FUNCTION public.checkin_ticket(
  p_ticket_id UUID,
  p_action TEXT,
  p_device_id UUID DEFAULT NULL,
  p_client_ts BIGINT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_ticket public.tickets%rowtype;
  v_event public.events%rowtype;
  v_venue public.venues%rowtype;
  v_merchant_id UUID;
  v_result TEXT;
  v_remaining INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_action NOT IN ('ENTRY','DRINK') THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT';
  END IF;

  -- Load ticket
  SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    v_result := 'INVALID';
    RETURN jsonb_build_object('result', v_result);
  END IF;

  -- Resolve merchant/venue via event
  SELECT * INTO v_event FROM public.events WHERE id = v_ticket.event_id;
  SELECT * INTO v_venue FROM public.venues WHERE id = v_ticket.venue_id;
  v_merchant_id := v_event.merchant_id;

  -- Permission: must be staff of merchant (or admin)
  IF NOT (public.is_admin() OR public.has_merchant_role(v_merchant_id, ARRAY['OWNER','MANAGER','STAFF'])) THEN
    v_result := 'NOT_ALLOWED';
    -- audit failure too
    INSERT INTO public.checkins(ticket_id, action, result, actor_user_id, actor_merchant_id, actor_venue_id, device_id, client_ts, note)
    VALUES (v_ticket.id, p_action, v_result, v_user, v_merchant_id, v_ticket.venue_id, p_device_id, p_client_ts, p_note);
    RETURN jsonb_build_object('result', v_result);
  END IF;

  -- Ticket status checks
  IF v_ticket.status IN ('refunded','void') THEN
    v_result := 'REFUNDED';
  ELSIF v_ticket.status = 'expired' THEN
    v_result := 'EXPIRED';
  ELSIF p_action = 'ENTRY' THEN
    IF v_ticket.status = 'used' THEN
      v_result := 'ALREADY_USED';
    ELSE
      v_result := 'OK';
      UPDATE public.tickets SET status = 'used', updated_at = NOW() WHERE id = v_ticket.id;
    END IF;
  ELSIF p_action = 'DRINK' THEN
    IF v_ticket.redeemed_count >= v_ticket.redeem_limit THEN
      v_result := 'ALREADY_USED';
    ELSE
      v_result := 'OK';
      UPDATE public.tickets
      SET redeemed_count = redeemed_count + 1, updated_at = NOW()
      WHERE id = v_ticket.id;
    END IF;
  END IF;

  -- Compute remaining
  SELECT (redeem_limit - redeemed_count) INTO v_remaining
  FROM public.tickets WHERE id = v_ticket.id;

  -- Audit log (OK unique protected by uq_checkins_ok_once)
  INSERT INTO public.checkins(ticket_id, action, result, actor_user_id, actor_merchant_id, actor_venue_id, device_id, client_ts, note)
  VALUES (v_ticket.id, p_action, v_result, v_user, v_merchant_id, v_ticket.venue_id, p_device_id, p_client_ts, p_note);

  RETURN jsonb_build_object(
    'result', v_result,
    'ticket_id', v_ticket.id,
    'remaining', v_remaining
  );
END;
$$;

REVOKE ALL ON FUNCTION public.checkin_ticket(UUID, TEXT, UUID, BIGINT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.checkin_ticket(UUID, TEXT, UUID, BIGINT, TEXT) TO authenticated;
