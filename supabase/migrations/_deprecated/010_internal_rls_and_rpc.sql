-- =========================================================
-- Internal Merchant RLS and RPC Updates
-- 更新RLS策略和RPC函数以支持商家端功能
-- =========================================================

-- 1. 更新 redeem_invite RPC：支持 venue_id 和 member_venues
CREATE OR REPLACE FUNCTION public.redeem_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invites%rowtype;
  v_user UUID := auth.uid();
  v_member_id UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT * INTO v_inv
  FROM public.invites
  WHERE token = p_token
    AND is_active = true
    AND disabled = false
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
  DO UPDATE SET role = EXCLUDED.role, is_active = true, updated_at = NOW()
  RETURNING id INTO v_member_id;

  -- 如果邀请码指定了venue，则添加member_venues关联
  IF v_inv.venue_id IS NOT NULL THEN
    INSERT INTO public.member_venues(member_id, venue_id)
    VALUES (v_member_id, v_inv.venue_id)
    ON CONFLICT (member_id, venue_id) DO NOTHING;
  END IF;

  UPDATE public.invites
  SET used_count = used_count + 1, updated_at = NOW()
  WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'merchant_id', v_inv.merchant_id,
    'venue_id', v_inv.venue_id,
    'role', v_inv.intended_role
  );
END;
$$;

-- 2. 更新 checkin_ticket RPC：支持venue权限校验、幂等性和success标记
CREATE OR REPLACE FUNCTION public.checkin_ticket(
  p_ticket_id UUID,
  p_action TEXT,
  p_venue_id UUID DEFAULT NULL,
  p_device_id UUID DEFAULT NULL,
  p_client_ts BIGINT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
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
  v_success BOOLEAN := false;
  v_existing_checkin_id UUID;
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
    RETURN jsonb_build_object('result', v_result, 'reason', 'TICKET_NOT_FOUND');
  END IF;

  -- Resolve merchant/venue via event
  SELECT * INTO v_event FROM public.events WHERE id = v_ticket.event_id;
  SELECT * INTO v_venue FROM public.venues WHERE id = v_ticket.venue_id;
  v_merchant_id := v_event.merchant_id;

  -- 如果指定了venue_id，验证是否匹配
  IF p_venue_id IS NOT NULL AND v_ticket.venue_id != p_venue_id THEN
    v_result := 'WRONG_VENUE';
    -- audit failure
    INSERT INTO public.checkins(ticket_id, action, result, success, actor_user_id, actor_merchant_id, actor_venue_id, device_id, client_ts, note)
    VALUES (v_ticket.id, p_action, v_result, false, v_user, v_merchant_id, COALESCE(p_venue_id, v_ticket.venue_id), p_device_id, p_client_ts, p_note);
    RETURN jsonb_build_object('result', v_result, 'reason', 'WRONG_VENUE');
  END IF;

  -- Permission: must be staff of merchant (or admin)
  -- 如果member_venues存在，验证该staff是否有权限访问该venue
  IF NOT (
    public.is_admin() 
    OR (
      public.has_merchant_role(v_merchant_id, ARRAY['OWNER','MANAGER','STAFF'])
      AND (
        -- 如果member_venues为空，说明该成员可访问所有venue
        NOT EXISTS (
          SELECT 1 FROM public.merchant_members mm
          JOIN public.member_venues mv ON mv.member_id = mm.id
          WHERE mm.user_id = v_user AND mm.merchant_id = v_merchant_id
        )
        OR EXISTS (
          SELECT 1 FROM public.merchant_members mm
          JOIN public.member_venues mv ON mv.member_id = mm.id
          WHERE mm.user_id = v_user 
            AND mm.merchant_id = v_merchant_id
            AND mv.venue_id = v_ticket.venue_id
        )
      )
    )
  ) THEN
    v_result := 'NOT_ALLOWED';
    -- audit failure
    INSERT INTO public.checkins(ticket_id, action, result, success, actor_user_id, actor_merchant_id, actor_venue_id, device_id, client_ts, note)
    VALUES (v_ticket.id, p_action, v_result, false, v_user, v_merchant_id, v_ticket.venue_id, p_device_id, p_client_ts, p_note);
    RETURN jsonb_build_object('result', v_result, 'reason', 'NOT_ALLOWED');
  END IF;

  -- 幂等性检查：如果已经存在成功的记录，直接返回
  SELECT id INTO v_existing_checkin_id
  FROM public.checkins
  WHERE ticket_id = p_ticket_id
    AND action = p_action
    AND success = true
  LIMIT 1;

  IF v_existing_checkin_id IS NOT NULL THEN
    -- 已经成功核销过
    v_result := 'ALREADY_USED';
    SELECT (redeem_limit - redeemed_count) INTO v_remaining
    FROM public.tickets WHERE id = v_ticket.id;
    RETURN jsonb_build_object(
      'result', v_result,
      'reason', 'ALREADY_USED',
      'ticket_id', v_ticket.id,
      'remaining', v_remaining
    );
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
      v_success := true;
      UPDATE public.tickets SET status = 'used', updated_at = NOW() WHERE id = v_ticket.id;
    END IF;
  ELSIF p_action = 'DRINK' THEN
    IF v_ticket.redeemed_count >= v_ticket.redeem_limit THEN
      v_result := 'ALREADY_USED';
    ELSE
      v_result := 'OK';
      v_success := true;
      UPDATE public.tickets
      SET redeemed_count = redeemed_count + 1, updated_at = NOW()
      WHERE id = v_ticket.id;
    END IF;
  END IF;

  -- Compute remaining
  SELECT (redeem_limit - redeemed_count) INTO v_remaining
  FROM public.tickets WHERE id = v_ticket.id;

  -- Audit log (success = true的唯一记录受uq_checkins_success_once保护)
  BEGIN
    INSERT INTO public.checkins(ticket_id, action, result, success, actor_user_id, actor_merchant_id, actor_venue_id, device_id, client_ts, note)
    VALUES (v_ticket.id, p_action, v_result, v_success, v_user, v_merchant_id, v_ticket.venue_id, p_device_id, p_client_ts, p_note);
  EXCEPTION WHEN unique_violation THEN
    -- 幂等性冲突：其他请求已经插入成功记录
    IF v_success THEN
      v_result := 'ALREADY_USED';
      SELECT (redeem_limit - redeemed_count) INTO v_remaining
      FROM public.tickets WHERE id = v_ticket.id;
      RETURN jsonb_build_object(
        'result', v_result,
        'reason', 'ALREADY_USED',
        'ticket_id', v_ticket.id,
        'remaining', v_remaining
      );
    END IF;
  END;

  RETURN jsonb_build_object(
    'result', v_result,
    'reason', v_result,
    'ticket_id', v_ticket.id,
    'remaining', v_remaining,
    'success', v_success
  );
END;
$$;

-- 3. 创建 RPC：获取用户的 workspace 列表
CREATE OR REPLACE FUNCTION public.get_user_workspaces()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'merchant_id', mm.merchant_id,
        'merchant_name', m.name,
        'role', mm.role,
        'is_active', mm.is_active,
        'venues', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'venue_id', v.id,
                'venue_name', v.name,
                'is_assigned', EXISTS(
                  SELECT 1 FROM public.member_venues mv
                  WHERE mv.member_id = mm.id AND mv.venue_id = v.id
                )
              )
            )
            FROM public.venues v
            WHERE v.merchant_id = mm.merchant_id AND v.is_active = true
          ),
          '[]'::jsonb
        )
      )
    )
    FROM public.merchant_members mm
    JOIN public.merchants m ON m.id = mm.merchant_id
    WHERE mm.user_id = v_user AND mm.is_active = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_workspaces() FROM public;
GRANT EXECUTE ON FUNCTION public.get_user_workspaces() TO authenticated;

-- 4. 更新 RLS 策略：允许 staff 插入 checkins（通过RPC，不需要直接INSERT权限）
-- 但保留RLS策略以防直接INSERT
DROP POLICY IF EXISTS "checkins_insert_admin_only" ON public.checkins;
DROP POLICY IF EXISTS "checkins_insert_staff" ON public.checkins;
CREATE POLICY "checkins_insert_staff"
ON public.checkins FOR INSERT
WITH CHECK (
  public.is_admin()
  OR public.has_merchant_role(actor_merchant_id, ARRAY['OWNER','MANAGER','STAFF'])
);

-- 5. 为 member_venues 启用 RLS
ALTER TABLE public.member_venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_venues_read" ON public.member_venues;
CREATE POLICY "member_venues_read"
ON public.member_venues FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_members mm
    WHERE mm.id = member_venues.member_id
      AND (mm.user_id = auth.uid() OR public.can_manage_merchant(
        (SELECT merchant_id FROM public.merchant_members WHERE id = member_venues.member_id)
      ))
  )
);

DROP POLICY IF EXISTS "member_venues_manage" ON public.member_venues;
CREATE POLICY "member_venues_manage"
ON public.member_venues FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_members mm
    WHERE mm.id = member_venues.member_id
      AND public.can_manage_merchant(
        (SELECT merchant_id FROM public.merchant_members WHERE id = member_venues.member_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.merchant_members mm
    WHERE mm.id = member_venues.member_id
      AND public.can_manage_merchant(
        (SELECT merchant_id FROM public.merchant_members WHERE id = member_venues.member_id)
      )
  )
);

-- 6. 为 requests 启用 RLS
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "requests_read" ON public.requests;
CREATE POLICY "requests_read"
ON public.requests FOR SELECT
USING (
  requested_by = auth.uid()
  OR public.can_manage_merchant(merchant_id)
  OR public.is_admin()
);

DROP POLICY IF EXISTS "requests_insert" ON public.requests;
CREATE POLICY "requests_insert"
ON public.requests FOR INSERT
WITH CHECK (
  requested_by = auth.uid()
  AND public.has_merchant_role(merchant_id, ARRAY['OWNER','MANAGER'])
);

DROP POLICY IF EXISTS "requests_update" ON public.requests;
CREATE POLICY "requests_update"
ON public.requests FOR UPDATE
USING (
  (requested_by = auth.uid() AND status = 'pending') -- 提交者可以撤回
  OR public.is_admin() -- admin可以审批
)
WITH CHECK (
  (requested_by = auth.uid() AND status IN ('pending','withdrawn')) -- 提交者只能撤回
  OR (public.is_admin() AND status IN ('approved','rejected')) -- admin可以审批
);

-- 7. 为 request_events 启用 RLS
ALTER TABLE public.request_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "request_events_read" ON public.request_events;
CREATE POLICY "request_events_read"
ON public.request_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = request_events.request_id
      AND (
        r.requested_by = auth.uid()
        OR public.can_manage_merchant(r.merchant_id)
        OR public.is_admin()
      )
  )
);

DROP POLICY IF EXISTS "request_events_insert" ON public.request_events;
CREATE POLICY "request_events_insert"
ON public.request_events FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = request_events.request_id
      AND (
        r.requested_by = auth.uid()
        OR public.is_admin()
      )
  )
);

-- 8. 更新 invites RLS：允许 staff 查看（但通过 RPC redeem）
-- invites 的 INSERT/UPDATE 仍然需要 owner/manager/admin
