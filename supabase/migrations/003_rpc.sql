-- =========================================================
-- 003 RPC - Remote Procedure Calls
-- 核心业务函数（最终态）
-- =========================================================
-- 说明：
-- - 所有函数幂等可重复执行（CREATE OR REPLACE）
-- - 使用 SECURITY DEFINER 绕开 RLS，内部自行校验
-- - 包含邀请码兑换、创建、核销等核心功能
-- =========================================================

-- =========================================================
-- 1. Invite System - 邀请码兑换与创建
-- =========================================================

-- 1.1 redeem_invite - 兑换邀请码（加入 merchant）
CREATE OR REPLACE FUNCTION public.redeem_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_invite RECORD;
  v_merchant RECORD;
  v_venue RECORD;
  v_existing_member RECORD;
  v_member_id UUID;
  v_result JSONB;
BEGIN
  -- 1. 校验必须已登录
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'NOT_AUTHENTICATED',
      'message', 'Must be logged in to redeem invite'
    );
  END IF;
  
  -- 2. 规范化 token 并查询 invite
  SELECT *
  INTO v_invite
  FROM public.invites
  WHERE token = UPPER(TRIM(p_token))
    AND is_active = true
  FOR UPDATE; -- 锁行，避免并发问题
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'INVALID_TOKEN',
      'message', 'Invite code not found or inactive'
    );
  END IF;
  
  -- 3. 校验 invite 有效性
  IF v_invite.disabled THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'DISABLED',
      'message', 'This invite code has been disabled'
    );
  END IF;
  
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'EXPIRED',
      'message', 'This invite code has expired'
    );
  END IF;
  
  IF v_invite.used_count >= v_invite.max_uses THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'USED_UP',
      'message', 'This invite code has reached maximum uses'
    );
  END IF;
  
  -- 4. 校验 merchant 存在
  SELECT * INTO v_merchant
  FROM public.merchants
  WHERE id = v_invite.merchant_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'MERCHANT_NOT_FOUND',
      'message', 'Associated merchant not found'
    );
  END IF;
  
  -- 5. 校验 venue（如果指定）
  IF v_invite.venue_id IS NOT NULL THEN
    SELECT * INTO v_venue
    FROM public.venues
    WHERE id = v_invite.venue_id
      AND merchant_id = v_invite.merchant_id;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'VENUE_MISMATCH',
        'message', 'Venue does not belong to merchant'
      );
    END IF;
  END IF;
  
  -- 6. 检查是否已是该商户成员
  SELECT * INTO v_existing_member
  FROM public.merchant_members
  WHERE user_id = v_user_id
    AND merchant_id = v_invite.merchant_id;
  
  -- 7. Upsert merchant_members（不降级权限）
  IF FOUND THEN
    -- 已存在：只在 role 升级时更新
    DECLARE
      v_current_role_rank INT;
      v_new_role_rank INT;
    BEGIN
      -- 定义 role 优先级：owner > manager > staff
      v_current_role_rank := CASE v_existing_member.role
        WHEN 'owner' THEN 4
        WHEN 'manager' THEN 3
        WHEN 'staff' THEN 2
        ELSE 1
      END;
      
      v_new_role_rank := CASE v_invite.intended_role
        WHEN 'owner' THEN 4
        WHEN 'manager' THEN 3
        WHEN 'staff' THEN 2
        ELSE 1
      END;
      
      IF v_new_role_rank > v_current_role_rank THEN
        UPDATE public.merchant_members
        SET role = v_invite.intended_role,
            is_active = true,
            updated_at = NOW()
        WHERE id = v_existing_member.id;
        
        v_member_id := v_existing_member.id;
      ELSE
        -- 不降级，仅确保 is_active
        UPDATE public.merchant_members
        SET is_active = true,
            updated_at = NOW()
        WHERE id = v_existing_member.id;
        
        v_member_id := v_existing_member.id;
      END IF;
    END;
  ELSE
    -- 新成员：插入
    INSERT INTO public.merchant_members(
      merchant_id,
      user_id,
      role,
      is_active
    )
    VALUES (
      v_invite.merchant_id,
      v_user_id,
      v_invite.intended_role,
      true
    )
    RETURNING id INTO v_member_id;
  END IF;
  
  -- 8. 如果指定了 venue，写入 member_venues
  IF v_invite.venue_id IS NOT NULL THEN
    INSERT INTO public.member_venues(member_id, venue_id)
    VALUES (v_member_id, v_invite.venue_id)
    ON CONFLICT (member_id, venue_id) DO NOTHING;
  END IF;
  
  -- 9. 更新 invite used_count、redeemed_by、redeemed_at（并发安全）
  UPDATE public.invites
  SET used_count = used_count + 1,
      redeemed_by = v_user_id,
      redeemed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_invite.id;
  
  -- 10. 返回成功结果
  v_result := jsonb_build_object(
    'ok', true,
    'merchant_id', v_invite.merchant_id,
    'merchant_name', v_merchant.name,
    'role', v_invite.intended_role,
    'venue_id', v_invite.venue_id,
    'venue_name', CASE WHEN v_invite.venue_id IS NOT NULL THEN v_venue.name ELSE NULL END,
    'member_id', v_member_id,
    'message', 'Successfully joined ' || v_merchant.name
  );
  
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'INTERNAL_ERROR',
      'message', SQLERRM
    );
END;
$$;

-- 1.2 create_staff_invite - 创建员工邀请码（merchant owner/manager 使用）
CREATE OR REPLACE FUNCTION public.create_staff_invite(
  p_merchant_id UUID,
  p_intended_role TEXT DEFAULT 'staff',
  p_max_uses INT DEFAULT 10,
  p_expires_days INT DEFAULT 30,
  p_venue_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_token TEXT;
  v_invite_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_merchant RECORD;
  v_venue RECORD;
BEGIN
  -- 1. 校验必须已登录
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: Must be logged in';
  END IF;
  
  -- 2. 校验 role 有效性（只能创建 staff/manager）
  IF p_intended_role NOT IN ('staff', 'manager') THEN
    RAISE EXCEPTION 'INVALID_ROLE: Can only create staff or manager invites';
  END IF;
  
  -- 3. 校验 merchant 存在
  SELECT * INTO v_merchant
  FROM public.merchants
  WHERE id = p_merchant_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MERCHANT_NOT_FOUND: Merchant does not exist';
  END IF;
  
  -- 4. 校验权限：必须是 owner/manager/admin
  IF NOT (
    public.is_admin()
    OR public.has_merchant_role(p_merchant_id, ARRAY['owner', 'manager'])
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Must be owner or manager to create invites';
  END IF;
  
  -- 5. 校验 venue（如果指定）
  IF p_venue_id IS NOT NULL THEN
    SELECT * INTO v_venue
    FROM public.venues
    WHERE id = p_venue_id
      AND merchant_id = p_merchant_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'VENUE_MISMATCH: Venue does not belong to merchant';
    END IF;
  END IF;
  
  -- 6. 生成唯一短码（6位数字+字母）
  LOOP
    v_token := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));
    
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.invites WHERE token = v_token
    );
  END LOOP;
  
  -- 7. 计算过期时间
  IF p_expires_days IS NOT NULL AND p_expires_days > 0 THEN
    v_expires_at := NOW() + (p_expires_days || ' days')::INTERVAL;
  ELSE
    v_expires_at := NULL;
  END IF;
  
  -- 8. 插入 invite
  INSERT INTO public.invites(
    token,
    merchant_id,
    venue_id,
    intended_role,
    issued_by_type,
    max_uses,
    expires_at,
    created_by,
    note
  )
  VALUES (
    v_token,
    p_merchant_id,
    p_venue_id,
    p_intended_role,
    'merchant',
    p_max_uses,
    v_expires_at,
    v_user_id,
    p_note
  )
  RETURNING id INTO v_invite_id;
  
  -- 9. 返回结果
  RETURN jsonb_build_object(
    'ok', true,
    'invite_id', v_invite_id,
    'token', v_token,
    'merchant_id', p_merchant_id,
    'merchant_name', v_merchant.name,
    'venue_id', p_venue_id,
    'venue_name', CASE WHEN p_venue_id IS NOT NULL THEN v_venue.name ELSE NULL END,
    'intended_role', p_intended_role,
    'max_uses', p_max_uses,
    'expires_at', v_expires_at,
    'message', 'Invite code created successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'CREATE_INVITE_FAILED: %', SQLERRM;
END;
$$;

-- 1.3 get_my_workspaces - 获取当前用户的所有 workspaces
CREATE OR REPLACE FUNCTION public.get_my_workspaces()
RETURNS TABLE (
  merchant_id UUID,
  merchant_name TEXT,
  merchant_status TEXT,
  role TEXT,
  is_active BOOLEAN,
  venues JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT
    m.id AS merchant_id,
    m.name AS merchant_name,
    m.status AS merchant_status,
    mm.role,
    mm.is_active,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'name', v.name,
            'address', v.address,
            'is_active', v.is_active
          )
        )
        FROM public.venues v
        WHERE v.merchant_id = m.id
          AND v.is_active = true
          AND (
            mm.role IN ('owner', 'manager')
            OR EXISTS (
              SELECT 1 FROM public.member_venues mv
              WHERE mv.member_id = mm.id
                AND mv.venue_id = v.id
            )
          )
      ),
      '[]'::jsonb
    ) AS venues
  FROM public.merchant_members mm
  INNER JOIN public.merchants m ON m.id = mm.merchant_id
  WHERE mm.user_id = v_user_id
    AND mm.is_active = true
  ORDER BY mm.created_at ASC;
END;
$$;

-- =========================================================
-- 2. Checkin System - 核销票务
-- =========================================================

-- 2.1 checkin_ticket - 核销票务（幂等）
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
  -- 1. 校验必须已登录
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'result', 'NOT_AUTHENTICATED',
      'message', 'Must be logged in to check in tickets'
    );
  END IF;
  
  -- 2. 校验 action
  IF p_action NOT IN ('ENTRY', 'DRINK') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'result', 'INVALID_ACTION',
      'message', 'Action must be ENTRY or DRINK'
    );
  END IF;
  
  -- 3. 查询 ticket
  SELECT t.*, tt.redeem_limit, tt.category
  INTO v_ticket
  FROM public.tickets t
  INNER JOIN public.ticket_types tt ON tt.id = t.ticket_type_id
  WHERE t.id = p_ticket_id;
  
  IF NOT FOUND THEN
    v_result := 'INVALID';
    v_message := 'Ticket not found';
  ELSE
    -- 3.5 校验 venue 权限：仅 admin 或拥有该场地权限的 staff 可核销
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
      -- 查询 event 检查时间
      SELECT * INTO v_event
      FROM public.events
      WHERE id = v_ticket.event_id;
      
      IF v_event.end_at < NOW() THEN
        v_result := 'EXPIRED';
        v_message := 'Event has ended';
      ELSE
        -- 检查是否已核销（幂等性检查）
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
          -- 成功核销
          v_result := 'OK';
          v_success := true;
          v_message := 'Check-in successful';
          
          -- 更新 ticket 状态
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
  
  -- 获取 merchant_id
  IF v_event.merchant_id IS NOT NULL THEN
    v_merchant_id := v_event.merchant_id;
  ELSE
    SELECT merchant_id INTO v_merchant_id
    FROM public.venues
    WHERE id = COALESCE(p_venue_id, v_ticket.venue_id)
    LIMIT 1;
  END IF;
  
  -- 记录 checkin（无论成功失败）
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
  
  -- 返回结果
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

-- =========================================================
-- 3. Profile Management
-- =========================================================

-- 3.1 ensure_profile - 确保用户有 profile（登录时自动调用）
CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles(id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
  SET display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      updated_at = NOW();
  
  RETURN NEW;
END;
$$;

-- 注册 trigger（在 auth.users 上）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT OR UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.ensure_profile();

-- =========================================================
-- 完成
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ RPC functions created successfully!';
  RAISE NOTICE '   - redeem_invite()';
  RAISE NOTICE '   - create_staff_invite()';
  RAISE NOTICE '   - get_my_workspaces()';
  RAISE NOTICE '   - checkin_ticket()';
  RAISE NOTICE '   - ensure_profile() trigger';
  RAISE NOTICE '========================================';
END $$;
