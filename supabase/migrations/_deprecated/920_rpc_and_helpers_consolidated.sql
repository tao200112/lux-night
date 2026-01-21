-- =========================================================
-- 920 RPC AND HELPERS CONSOLIDATED
-- 统一管理所有 RPC 函数和 Helper 函数
-- =========================================================
-- 说明：
-- 1. 所有函数使用 CREATE OR REPLACE（自动幂等）
-- 2. SECURITY DEFINER 函数避免 RLS 递归
-- 3. 设置 search_path = public 确保安全
-- =========================================================

-- =========================================================
-- PART 1: Helper Functions（避免 RLS 递归）
-- =========================================================

-- 1. 检查当前用户是否是 admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = auth.uid() AND au.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 2. 检查用户是否有 merchant_membership（避免递归）
CREATE OR REPLACE FUNCTION public.has_merchant_membership_check(
  p_user_id UUID,
  p_merchant_id UUID,
  p_roles TEXT[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN EXISTS (
    SELECT 1
    FROM public.merchant_members mm
    WHERE mm.user_id = p_user_id
      AND mm.merchant_id = p_merchant_id
      AND mm.role = ANY(p_roles)
      AND mm.is_active = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_merchant_membership_check(UUID, UUID, TEXT[]) FROM public;
GRANT EXECUTE ON FUNCTION public.has_merchant_membership_check(UUID, UUID, TEXT[]) TO authenticated;

-- 3. 获取 member 的 merchant_id（避免递归）
CREATE OR REPLACE FUNCTION public.get_member_merchant_id(p_member_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT merchant_id
  FROM public.merchant_members
  WHERE id = p_member_id;
$$;

REVOKE ALL ON FUNCTION public.get_member_merchant_id(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_member_merchant_id(UUID) TO authenticated;

-- =========================================================
-- PART 2: Invite RPC（邀请码兑换与创建）
-- =========================================================

-- 1. 邀请码预览（不写库，用于登录前查看）
CREATE OR REPLACE FUNCTION public.redeem_preview(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_merchant RECORD;
  v_venue RECORD;
  v_status TEXT;
BEGIN
  -- 规范化 token
  p_token := UPPER(TRIM(p_token));
  
  -- 查询邀请码
  SELECT * INTO v_inv
  FROM public.invites
  WHERE token = p_token;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'not_found',
      'error', 'INVALID_TOKEN'
    );
  END IF;
  
  -- 检查状态
  IF v_inv.disabled THEN
    v_status := 'disabled';
  ELSIF NOT v_inv.is_active THEN
    v_status := 'inactive';
  ELSIF v_inv.expires_at IS NOT NULL AND NOW() > v_inv.expires_at THEN
    v_status := 'expired';
  ELSIF v_inv.used_count >= v_inv.max_uses THEN
    v_status := 'used_up';
  ELSE
    v_status := 'valid';
  END IF;
  
  -- 查询 merchant 和 venue 信息
  SELECT id, name, status INTO v_merchant
  FROM public.merchants
  WHERE id = v_inv.merchant_id;
  
  IF v_inv.venue_id IS NOT NULL THEN
    SELECT id, name, address INTO v_venue
    FROM public.venues
    WHERE id = v_inv.venue_id;
  END IF;
  
  RETURN jsonb_build_object(
    'ok', true,
    'status', v_status,
    'merchant', jsonb_build_object(
      'id', v_merchant.id,
      'name', v_merchant.name,
      'status', v_merchant.status
    ),
    'venue', CASE 
      WHEN v_venue.id IS NOT NULL THEN
        jsonb_build_object(
          'id', v_venue.id,
          'name', v_venue.name,
          'address', v_venue.address
        )
      ELSE NULL
    END,
    'intended_role', v_inv.intended_role,
    'issued_by_type', v_inv.issued_by_type,
    'used_count', v_inv.used_count,
    'max_uses', v_inv.max_uses,
    'expires_at', v_inv.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_preview(TEXT) TO anon, authenticated;

-- 2. 邀请码兑换（写库，加入 merchant_members）
CREATE OR REPLACE FUNCTION public.redeem_invite_code(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_user UUID := auth.uid();
  v_member_id UUID;
  v_existing_role TEXT;
BEGIN
  -- 必须已登录
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  
  -- 规范化 token
  p_token := UPPER(TRIM(p_token));
  
  -- 锁定邀请码行
  SELECT * INTO v_inv
  FROM public.invites
  WHERE token = p_token
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_TOKEN');
  END IF;
  
  -- 验证状态
  IF v_inv.disabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DISABLED');
  END IF;
  
  IF NOT v_inv.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INACTIVE');
  END IF;
  
  IF v_inv.expires_at IS NOT NULL AND NOW() > v_inv.expires_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'EXPIRED');
  END IF;
  
  IF v_inv.used_count >= v_inv.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'USED_UP');
  END IF;
  
  -- 验证 merchant 存在
  IF NOT EXISTS (SELECT 1 FROM public.merchants WHERE id = v_inv.merchant_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MERCHANT_NOT_FOUND');
  END IF;
  
  -- 验证 venue 归属（如果指定）
  IF v_inv.venue_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.venues 
      WHERE id = v_inv.venue_id 
        AND merchant_id = v_inv.merchant_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'VENUE_MISMATCH');
    END IF;
  END IF;
  
  -- 检查现有角色（不降级）
  SELECT role INTO v_existing_role
  FROM public.merchant_members
  WHERE user_id = v_user AND merchant_id = v_inv.merchant_id;
  
  -- 角色优先级：owner > manager > staff
  IF v_existing_role = 'owner' THEN
    -- 已是 owner，不变
    NULL;
  ELSIF v_existing_role = 'manager' AND v_inv.intended_role = 'staff' THEN
    -- 不降级为 staff
    NULL;
  ELSE
    -- Upsert membership
    INSERT INTO public.merchant_members(merchant_id, user_id, role, is_active)
    VALUES (v_inv.merchant_id, v_user, v_inv.intended_role, true)
    ON CONFLICT (merchant_id, user_id)
    DO UPDATE SET 
      role = EXCLUDED.role,
      is_active = true,
      updated_at = NOW()
    RETURNING id INTO v_member_id;
  END IF;
  
  -- 如果没有获取到 member_id（因为没有 upsert），查询现有的
  IF v_member_id IS NULL THEN
    SELECT id INTO v_member_id
    FROM public.merchant_members
    WHERE user_id = v_user AND merchant_id = v_inv.merchant_id;
  END IF;
  
  -- 如果邀请码指定了 venue，添加 member_venues 关联
  IF v_inv.venue_id IS NOT NULL AND v_member_id IS NOT NULL THEN
    INSERT INTO public.member_venues(member_id, venue_id)
    VALUES (v_member_id, v_inv.venue_id)
    ON CONFLICT (member_id, venue_id) DO NOTHING;
  END IF;
  
  -- 增加使用计数
  UPDATE public.invites
  SET used_count = used_count + 1, updated_at = NOW()
  WHERE id = v_inv.id;
  
  -- 返回用户的所有 memberships
  RETURN jsonb_build_object(
    'ok', true,
    'merchant_id', v_inv.merchant_id,
    'role', v_inv.intended_role,
    'venue_id', v_inv.venue_id,
    'memberships', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'merchant_id', mm.merchant_id,
          'role', mm.role,
          'is_active', mm.is_active
        )
      )
      FROM public.merchant_members mm
      WHERE mm.user_id = v_user AND mm.is_active = true
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_invite_code(TEXT) TO authenticated;

-- 3. 创建员工邀请码（merchant owner/manager 使用）
CREATE OR REPLACE FUNCTION public.create_staff_invite(
  p_merchant_id UUID,
  p_role TEXT,
  p_max_uses INT DEFAULT 1,
  p_expires_days INT DEFAULT 7,
  p_venue_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_token TEXT;
  v_invite_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- 必须已登录
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  
  -- 权限检查：owner/manager/admin 可创建
  IF NOT (
    public.is_admin()
    OR public.has_merchant_membership_check(v_user, p_merchant_id, ARRAY['owner','manager'])
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  
  -- 验证 role（员工邀请码只能是 staff 或 manager）
  IF p_role NOT IN ('staff', 'manager') THEN
    RAISE EXCEPTION 'INVALID_ROLE';
  END IF;
  
  -- 验证 merchant 存在
  IF NOT EXISTS (SELECT 1 FROM public.merchants WHERE id = p_merchant_id) THEN
    RAISE EXCEPTION 'MERCHANT_NOT_FOUND';
  END IF;
  
  -- 验证 venue 归属（如果指定）
  IF p_venue_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.venues 
      WHERE id = p_venue_id AND merchant_id = p_merchant_id
    ) THEN
      RAISE EXCEPTION 'VENUE_MISMATCH';
    END IF;
  END IF;
  
  -- 生成短码 token（8位大写字母+数字）
  v_token := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));
  
  -- 计算过期时间
  IF p_expires_days > 0 THEN
    v_expires_at := NOW() + (p_expires_days || ' days')::INTERVAL;
  ELSE
    v_expires_at := NULL; -- 永不过期
  END IF;
  
  -- 插入邀请码
  INSERT INTO public.invites(
    token,
    merchant_id,
    venue_id,
    intended_role,
    issued_by_type,
    max_uses,
    used_count,
    expires_at,
    disabled,
    is_active,
    created_by
  ) VALUES (
    v_token,
    p_merchant_id,
    p_venue_id,
    p_role,
    'merchant',
    p_max_uses,
    0,
    v_expires_at,
    false,
    true,
    v_user
  )
  RETURNING id INTO v_invite_id;
  
  RETURN jsonb_build_object(
    'ok', true,
    'invite_id', v_invite_id,
    'token', v_token,
    'merchant_id', p_merchant_id,
    'venue_id', p_venue_id,
    'role', p_role,
    'max_uses', p_max_uses,
    'expires_at', v_expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_staff_invite(UUID, TEXT, INT, INT, UUID) TO authenticated;

-- =========================================================
-- PART 3: Workspace RPC
-- =========================================================

-- 获取用户的所有 workspaces
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

GRANT EXECUTE ON FUNCTION public.get_user_workspaces() TO authenticated;

-- =========================================================
-- PART 4: Checkin RPC（票务核销）
-- =========================================================

CREATE OR REPLACE FUNCTION public.checkin_ticket(
  p_ticket_id UUID,
  p_action TEXT,
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
  v_user UUID := auth.uid();
  v_ticket RECORD;
  v_event RECORD;
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
  SELECT * INTO v_ticket 
  FROM public.tickets 
  WHERE id = p_ticket_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'result', 'INVALID', 'error', 'TICKET_NOT_FOUND');
  END IF;

  -- Resolve merchant via event
  SELECT * INTO v_event FROM public.events WHERE id = v_ticket.event_id;
  v_merchant_id := v_event.merchant_id;

  -- 验证 venue 匹配
  IF p_venue_id IS NOT NULL AND v_ticket.venue_id != p_venue_id THEN
    v_result := 'WRONG_VENUE';
    INSERT INTO public.checkins(ticket_id, action, result, success, actor_user_id, actor_merchant_id, actor_venue_id, device_id, client_ts, note)
    VALUES (v_ticket.id, p_action, v_result, false, v_user, v_merchant_id, COALESCE(p_venue_id, v_ticket.venue_id), p_device_id, p_client_ts, p_note);
    RETURN jsonb_build_object('ok', false, 'result', v_result);
  END IF;

  -- Permission: must be staff+ of merchant
  IF NOT (
    public.is_admin() 
    OR public.has_merchant_membership_check(v_user, v_merchant_id, ARRAY['staff','manager','owner'])
  ) THEN
    v_result := 'NOT_ALLOWED';
    INSERT INTO public.checkins(ticket_id, action, result, success, actor_user_id, actor_merchant_id, actor_venue_id, device_id, client_ts, note)
    VALUES (v_ticket.id, p_action, v_result, false, v_user, v_merchant_id, v_ticket.venue_id, p_device_id, p_client_ts, p_note);
    RETURN jsonb_build_object('ok', false, 'result', v_result);
  END IF;

  -- 幂等性检查
  SELECT id INTO v_existing_checkin_id
  FROM public.checkins
  WHERE ticket_id = p_ticket_id
    AND action = p_action
    AND success = true
  LIMIT 1;

  IF v_existing_checkin_id IS NOT NULL THEN
    SELECT (redeem_limit - redeemed_count) INTO v_remaining FROM public.tickets WHERE id = v_ticket.id;
    RETURN jsonb_build_object('ok', false, 'result', 'ALREADY_USED', 'remaining', v_remaining);
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
      UPDATE public.tickets SET redeemed_count = redeemed_count + 1, updated_at = NOW() WHERE id = v_ticket.id;
    END IF;
  END IF;

  SELECT (redeem_limit - redeemed_count) INTO v_remaining FROM public.tickets WHERE id = v_ticket.id;

  -- Audit log
  BEGIN
    INSERT INTO public.checkins(ticket_id, action, result, success, actor_user_id, actor_merchant_id, actor_venue_id, device_id, client_ts, note)
    VALUES (v_ticket.id, p_action, v_result, v_success, v_user, v_merchant_id, v_ticket.venue_id, p_device_id, p_client_ts, p_note);
  EXCEPTION WHEN unique_violation THEN
    IF v_success THEN
      RETURN jsonb_build_object('ok', false, 'result', 'ALREADY_USED', 'remaining', v_remaining);
    END IF;
  END;

  RETURN jsonb_build_object('ok', v_success, 'result', v_result, 'ticket_id', v_ticket.id, 'remaining', v_remaining);
END;
$$;

GRANT EXECUTE ON FUNCTION public.checkin_ticket(UUID, TEXT, UUID, UUID, BIGINT, TEXT) TO authenticated;
