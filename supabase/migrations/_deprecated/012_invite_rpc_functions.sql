-- =========================================================
-- Invite System RPC Functions
-- 邀请码系统 RPC 函数
-- =========================================================

-- =========================================================
-- Helper: 检查用户是否有权限管理商户
-- =========================================================

CREATE OR REPLACE FUNCTION public.can_manage_merchant_for_invite(p_merchant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RETURN false;
  END IF;
  
  -- 检查是否是 admin
  IF EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = v_user AND is_active = true
  ) THEN
    RETURN true;
  END IF;
  
  -- 检查是否是 owner/manager/admin 角色
  RETURN EXISTS (
    SELECT 1 FROM public.merchant_members
    WHERE user_id = v_user
      AND merchant_id = p_merchant_id
      AND role IN ('owner','manager','admin')
      AND is_active = true
  );
END;
$$;

-- =========================================================
-- RPC 1: redeem_preview - 预览邀请码（不写库）
-- =========================================================

CREATE OR REPLACE FUNCTION public.redeem_preview(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invites%rowtype;
  v_merchant public.merchants%rowtype;
  v_venue public.venues%rowtype;
  v_status TEXT;
BEGIN
  -- 统一 token 大小写
  p_token := UPPER(TRIM(p_token));
  
  -- 查找邀请码
  SELECT * INTO v_inv
  FROM public.invites
  WHERE token = p_token;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'status', 'INVALID',
      'message', 'Invite token not found'
    );
  END IF;
  
  -- 检查状态
  IF v_inv.disabled THEN
    v_status := 'DISABLED';
  ELSIF NOT v_inv.is_active THEN
    v_status := 'DISABLED';
  ELSIF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < NOW() THEN
    v_status := 'EXPIRED';
  ELSIF v_inv.used_count >= v_inv.max_uses THEN
    v_status := 'USED_UP';
  ELSE
    v_status := 'VALID';
  END IF;
  
  -- 获取商户信息
  SELECT * INTO v_merchant
  FROM public.merchants
  WHERE id = v_inv.merchant_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'status', 'MERCHANT_NOT_FOUND',
      'message', 'Merchant not found'
    );
  END IF;
  
  -- 获取场地信息（如果有）
  IF v_inv.venue_id IS NOT NULL THEN
    SELECT * INTO v_venue
    FROM public.venues
    WHERE id = v_inv.venue_id;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'valid', false,
        'status', 'VENUE_NOT_FOUND',
        'message', 'Venue not found'
      );
    END IF;
    
    -- 校验场地是否属于该商户
    IF v_venue.merchant_id != v_inv.merchant_id THEN
      RETURN jsonb_build_object(
        'valid', false,
        'status', 'VENUE_MISMATCH',
        'message', 'Venue does not belong to the merchant'
      );
    END IF;
  END IF;
  
  -- 返回预览信息
  RETURN jsonb_build_object(
    'valid', v_status = 'VALID',
    'status', v_status,
    'merchant', jsonb_build_object(
      'id', v_merchant.id,
      'name', v_merchant.name
    ),
    'venue', CASE 
      WHEN v_venue.id IS NOT NULL THEN jsonb_build_object(
        'id', v_venue.id,
        'name', v_venue.name
      )
      ELSE NULL
    END,
    'role', v_inv.intended_role,
    'max_uses', v_inv.max_uses,
    'used_count', v_inv.used_count,
    'remaining_uses', GREATEST(0, v_inv.max_uses - v_inv.used_count),
    'expires_at', v_inv.expires_at
  );
END;
$$;

-- 授权
REVOKE ALL ON FUNCTION public.redeem_preview(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_preview(TEXT) TO authenticated, anon;

-- =========================================================
-- RPC 2: redeem_invite_code - 兑换邀请码（写库）
-- =========================================================

CREATE OR REPLACE FUNCTION public.redeem_invite_code(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invites%rowtype;
  v_user UUID := auth.uid();
  v_member_id UUID;
  v_merchant_id UUID;
  v_existing_role TEXT;
  v_new_role TEXT;
  v_memberships JSONB;
BEGIN
  -- 必须已登录
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  
  -- 统一 token 大小写
  p_token := UPPER(TRIM(p_token));
  
  -- 查找邀请码（带锁，防止并发）
  SELECT * INTO v_inv
  FROM public.invites
  WHERE token = p_token
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID: Invite token not found';
  END IF;
  
  -- 校验状态
  IF v_inv.disabled THEN
    RAISE EXCEPTION 'DISABLED: Invite token is disabled';
  END IF;
  
  IF NOT v_inv.is_active THEN
    RAISE EXCEPTION 'DISABLED: Invite token is not active';
  END IF;
  
  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < NOW() THEN
    RAISE EXCEPTION 'EXPIRED: Invite token has expired';
  END IF;
  
  IF v_inv.used_count >= v_inv.max_uses THEN
    RAISE EXCEPTION 'USED_UP: Invite token has reached max uses';
  END IF;
  
  -- 校验商户存在
  IF NOT EXISTS (
    SELECT 1 FROM public.merchants WHERE id = v_inv.merchant_id
  ) THEN
    RAISE EXCEPTION 'MERCHANT_NOT_FOUND: Merchant does not exist';
  END IF;
  
  -- 校验场地归属（如果指定了场地）
  IF v_inv.venue_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.venues
      WHERE id = v_inv.venue_id
        AND merchant_id = v_inv.merchant_id
    ) THEN
      RAISE EXCEPTION 'VENUE_MISMATCH: Venue does not belong to the merchant';
    END IF;
  END IF;
  
  v_merchant_id := v_inv.merchant_id;
  
  -- 检查是否已有该商户的 membership
  SELECT role INTO v_existing_role
  FROM public.merchant_members
  WHERE user_id = v_user
    AND merchant_id = v_merchant_id;
  
  -- 角色升级规则：只能提升，不能降级
  -- owner > manager > staff > admin（admin 是特殊角色，不影响）
  v_new_role := v_inv.intended_role;
  
  IF v_existing_role IS NOT NULL THEN
    -- 已有角色，判断是否需要升级
    IF v_existing_role = 'admin' THEN
      -- admin 角色保持不变
      v_new_role := 'admin';
    ELSIF v_existing_role = 'owner' THEN
      -- owner 是最高角色，保持不变
      v_new_role := 'owner';
    ELSIF v_existing_role = 'manager' AND v_inv.intended_role = 'staff' THEN
      -- 已有 manager，不能降级为 staff
      v_new_role := 'manager';
    ELSIF v_existing_role = 'staff' AND v_inv.intended_role IN ('manager','owner') THEN
      -- 可以升级到 manager 或 owner
      v_new_role := v_inv.intended_role;
    END IF;
  END IF;
  
  -- Upsert membership
  INSERT INTO public.merchant_members(merchant_id, user_id, role, is_active)
  VALUES (v_merchant_id, v_user, v_new_role, true)
  ON CONFLICT (merchant_id, user_id)
  DO UPDATE SET 
    role = v_new_role,
    is_active = true,
    updated_at = NOW()
  RETURNING id INTO v_member_id;
  
  -- 如果邀请码指定了 venue，添加 member_venues 关联
  IF v_inv.venue_id IS NOT NULL THEN
    INSERT INTO public.member_venues(member_id, venue_id)
    VALUES (v_member_id, v_inv.venue_id)
    ON CONFLICT (member_id, venue_id) DO NOTHING;
  END IF;
  
  -- 更新邀请码使用计数
  UPDATE public.invites
  SET used_count = used_count + 1,
      updated_at = NOW()
  WHERE id = v_inv.id;
  
  -- 获取用户的所有 memberships
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
              'venue_name', v.name
            )
          )
          FROM public.venues v
          WHERE v.merchant_id = mm.merchant_id
            AND v.is_active = true
        ),
        '[]'::jsonb
      )
    )
  ) INTO v_memberships
  FROM public.merchant_members mm
  JOIN public.merchants m ON m.id = mm.merchant_id
  WHERE mm.user_id = v_user
    AND mm.is_active = true;
  
  -- 返回结果
  RETURN jsonb_build_object(
    'success', true,
    'merchant_id', v_merchant_id,
    'venue_id', v_inv.venue_id,
    'role', v_new_role,
    'memberships', COALESCE(v_memberships, '[]'::jsonb)
  );
END;
$$;

-- 授权
REVOKE ALL ON FUNCTION public.redeem_invite_code(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_invite_code(TEXT) TO authenticated;

-- =========================================================
-- RPC 3: create_invite_code - 创建邀请码（owner/manager 使用）
-- =========================================================

CREATE OR REPLACE FUNCTION public.create_invite_code(
  p_merchant_id UUID,
  p_venue_id UUID DEFAULT NULL,
  p_role TEXT DEFAULT 'staff',
  p_max_uses INT DEFAULT 10,
  p_expires_days INT DEFAULT 30
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
  
  -- 权限检查：只有 owner/manager/admin 可以创建邀请码
  IF NOT public.can_manage_merchant_for_invite(p_merchant_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED: Only owner, manager, or admin can create invite codes';
  END IF;
  
  -- 校验商户存在
  IF NOT EXISTS (
    SELECT 1 FROM public.merchants WHERE id = p_merchant_id
  ) THEN
    RAISE EXCEPTION 'MERCHANT_NOT_FOUND: Merchant does not exist';
  END IF;
  
  -- 校验角色
  IF p_role NOT IN ('staff','manager','owner','admin') THEN
    RAISE EXCEPTION 'INVALID_ROLE: Role must be one of: staff, manager, owner, admin';
  END IF;
  
  -- 校验 max_uses
  IF p_max_uses < 1 THEN
    RAISE EXCEPTION 'INVALID_MAX_USES: max_uses must be >= 1';
  END IF;
  
  -- 校验场地归属（如果指定了场地）
  IF p_venue_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.venues
      WHERE id = p_venue_id
        AND merchant_id = p_merchant_id
    ) THEN
      RAISE EXCEPTION 'VENUE_MISMATCH: Venue does not belong to the merchant';
    END IF;
  END IF;
  
  -- 计算过期时间
  IF p_expires_days IS NULL THEN
    v_expires_at := NULL;  -- 永不过期
  ELSE
    v_expires_at := NOW() + (p_expires_days || ' days')::INTERVAL;
  END IF;
  
  -- 生成唯一 token（格式: ROLE-YYYYMMDD-XXXX）
  -- 如果冲突则重试
  LOOP
    v_token := p_role || '-' || 
               to_char(NOW(), 'YYYYMMDD') || '-' || 
               UPPER(SUBSTRING(encode(gen_random_bytes(3), 'base32'), 1, 4));
    
    -- 检查是否已存在
    IF NOT EXISTS (
      SELECT 1 FROM public.invites WHERE token = v_token
    ) THEN
      EXIT;  -- 找到唯一 token，退出循环
    END IF;
  END LOOP;
  
  -- 插入邀请码
  INSERT INTO public.invites (
    token,
    merchant_id,
    venue_id,
    intended_role,
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
    p_max_uses,
    0,
    v_expires_at,
    false,
    true,
    v_user
  )
  RETURNING id INTO v_invite_id;
  
  -- 返回创建的邀请码信息
  RETURN jsonb_build_object(
    'success', true,
    'id', v_invite_id,
    'token', v_token,
    'merchant_id', p_merchant_id,
    'venue_id', p_venue_id,
    'role', p_role,
    'max_uses', p_max_uses,
    'expires_at', v_expires_at
  );
END;
$$;

-- 授权
REVOKE ALL ON FUNCTION public.create_invite_code(UUID, UUID, TEXT, INT, INT) FROM public;
GRANT EXECUTE ON FUNCTION public.create_invite_code(UUID, UUID, TEXT, INT, INT) TO authenticated;
