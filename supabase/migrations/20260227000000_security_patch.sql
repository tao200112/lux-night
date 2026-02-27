-- =========================================================
-- 20260227000000 Security Patch
-- P0/P1 fixes: get_user_emails, checkin_ticket, GRANT/REVOKE
-- =========================================================

-- 1. get_user_emails: 强制 is_admin 或 service_role
CREATE OR REPLACE FUNCTION public.get_user_emails(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  RETURN QUERY
  SELECT u.id AS user_id, u.email
  FROM auth.users u
  WHERE u.id = ANY(p_user_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_emails(uuid[]) FROM public;
REVOKE ALL ON FUNCTION public.get_user_emails(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_emails(uuid[]) TO service_role;

-- 2. checkin_ticket: 增加 venue 权限校验
CREATE OR REPLACE FUNCTION public.checkin_ticket(
  p_ticket_id UUID,
  p_action TEXT DEFAULT 'ENTRY',
  p_venue_id UUID DEFAULT NULL,
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
  v_user_id UUID;
  v_ticket RECORD;
  v_event RECORD;
  v_result TEXT;
  v_success BOOLEAN := false;
  v_message TEXT;
  v_existing_checkin RECORD;
  v_checkin_id UUID;
  v_merchant_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'result', 'NOT_AUTHENTICATED',
      'message', 'Must be logged in to check in tickets'
    );
  END IF;
  
  IF p_action NOT IN ('ENTRY', 'DRINK') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'result', 'INVALID_ACTION',
      'message', 'Action must be ENTRY or DRINK'
    );
  END IF;
  
  SELECT t.*, tt.redeem_limit, tt.category
  INTO v_ticket
  FROM public.tickets t
  INNER JOIN public.ticket_types tt ON tt.id = t.ticket_type_id
  WHERE t.id = p_ticket_id;
  
  IF NOT FOUND THEN
    v_result := 'INVALID';
    v_message := 'Ticket not found';
  ELSE
    IF NOT (
      public.is_admin()
      OR COALESCE(p_venue_id, v_ticket.venue_id) = ANY(public.my_venue_ids())
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'result', 'NOT_ALLOWED',
        'message', 'Insufficient venue permission'
      );
    END IF;
    IF v_ticket.status = 'refunded' THEN
      v_result := 'REFUNDED';
      v_message := 'Ticket has been refunded';
    ELSIF v_ticket.status = 'void' THEN
      v_result := 'INVALID';
      v_message := 'Ticket is void';
    ELSIF v_ticket.status = 'expired' THEN
      v_result := 'EXPIRED';
      v_message := 'Ticket has expired';
    ELSIF p_venue_id IS NOT NULL AND v_ticket.venue_id != p_venue_id THEN
      v_result := 'WRONG_VENUE';
      v_message := 'Ticket is not valid for this venue';
    ELSE
      SELECT * INTO v_event
      FROM public.events
      WHERE id = v_ticket.event_id;
      
      IF v_event.end_at < NOW() THEN
        v_result := 'EXPIRED';
        v_message := 'Event has ended';
      ELSE
        SELECT * INTO v_existing_checkin
        FROM public.checkins
        WHERE ticket_id = p_ticket_id
          AND action = p_action
          AND success = true
        LIMIT 1;
        
        IF FOUND THEN
          v_result := 'ALREADY_USED';
          v_message := 'Ticket already used for this action';
        ELSIF v_ticket.redeemed_count >= v_ticket.redeem_limit THEN
          v_result := 'ALREADY_USED';
          v_message := 'Ticket redeem limit reached';
        ELSE
          v_result := 'OK';
          v_success := true;
          v_message := 'Check-in successful';
          UPDATE public.tickets
          SET redeemed_count = redeemed_count + 1,
              status = CASE
                WHEN redeemed_count + 1 >= redeem_limit THEN 'used'
                ELSE status
              END,
              updated_at = NOW()
          WHERE id = p_ticket_id;
        END IF;
      END IF;
    END IF;
  END IF;
  
  IF v_ticket.id IS NOT NULL AND v_ticket.event_id IS NOT NULL THEN
    SELECT e.merchant_id INTO v_merchant_id
    FROM public.events e
    WHERE e.id = v_ticket.event_id
    LIMIT 1;
  END IF;
  
  IF v_merchant_id IS NULL AND v_ticket.id IS NOT NULL AND (p_venue_id IS NOT NULL OR v_ticket.venue_id IS NOT NULL) THEN
    SELECT v.merchant_id INTO v_merchant_id
    FROM public.venues v
    WHERE v.id = COALESCE(p_venue_id, v_ticket.venue_id)
    LIMIT 1;
  END IF;
  
  INSERT INTO public.checkins(
    ticket_id,
    action,
    result,
    success,
    actor_user_id,
    actor_merchant_id,
    actor_venue_id,
    device_id,
    client_ts,
    note
  )
  VALUES (
    p_ticket_id,
    p_action,
    v_result,
    v_success,
    v_user_id,
    v_merchant_id,
    COALESCE(p_venue_id, v_ticket.venue_id),
    p_device_id,
    p_client_ts,
    p_note
  )
  RETURNING id INTO v_checkin_id;
  
  RETURN jsonb_build_object(
    'ok', v_success,
    'checkin_id', v_checkin_id,
    'result', v_result,
    'message', v_message,
    'ticket', CASE WHEN v_ticket.id IS NOT NULL THEN
      jsonb_build_object(
        'id', v_ticket.id,
        'status', v_ticket.status,
        'redeemed_count', CASE WHEN v_success THEN v_ticket.redeemed_count + 1 ELSE v_ticket.redeemed_count END,
        'redeem_limit', v_ticket.redeem_limit
      )
      ELSE NULL
    END
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'result', 'INTERNAL_ERROR',
      'message', SQLERRM
    );
END;
$$;
