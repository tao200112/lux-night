-- =========================================================
-- Update Invite RPC Functions: Add issued_by_type Support
-- 更新邀请码 RPC 函数：添加 issued_by_type 支持
-- =========================================================

-- =========================================================
-- 1. 更新 redeem_preview：返回 issued_by_type
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
  
  -- 返回预览信息（包含 issued_by_type）
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
    'issued_by_type', COALESCE(v_inv.issued_by_type, 'merchant'),  -- 兼容旧数据
    'max_uses', v_inv.max_uses,
    'used_count', v_inv.used_count,
    'remaining_uses', GREATEST(0, v_inv.max_uses - v_inv.used_count),
    'expires_at', v_inv.expires_at
  );
END;
$$;

-- =========================================================
-- 2. 更新 create_invite_code：强制 issued_by_type='merchant'
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
  
  -- 校验角色（merchant 只能创建 staff，可选 manager）
  IF p_role NOT IN ('staff','manager') THEN
    RAISE EXCEPTION 'INVALID_ROLE: Merchant can only create invite codes with role staff or manager';
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
  
  -- 插入邀请码（issued_by_type 强制为 'merchant'）
  INSERT INTO public.invites (
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
    'merchant',  -- 强制 issued_by_type='merchant'
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
    'issued_by_type', 'merchant',
    'max_uses', p_max_uses,
    'expires_at', v_expires_at
  );
END;
$$;

-- =========================================================
-- 3. 创建 admin 创建商家邀请码的 RPC（使用 service role）
-- =========================================================

-- 注意：这个函数应该由 service role 调用，或者在 API route 中使用 service role 直接插入
-- 这里提供一个 RPC 作为备用方案

CREATE OR REPLACE FUNCTION public.create_admin_merchant_invite(
  p_merchant_id UUID,
  p_token TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'owner',
  p_max_uses INT DEFAULT 999999,
  p_expires_days INT DEFAULT NULL,
  p_created_by_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_invite_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_created_by UUID;
BEGIN
  -- 校验角色（admin 可以创建 owner/manager）
  IF p_role NOT IN ('owner','manager') THEN
    RAISE EXCEPTION 'INVALID_ROLE: Admin can only create invite codes with role owner or manager';
  END IF;
  
  -- 校验商户存在
  IF NOT EXISTS (
    SELECT 1 FROM public.merchants WHERE id = p_merchant_id
  ) THEN
    RAISE EXCEPTION 'MERCHANT_NOT_FOUND: Merchant does not exist';
  END IF;
  
  -- 获取 created_by（优先使用传入的，否则使用系统用户）
  IF p_created_by_user_id IS NOT NULL THEN
    v_created_by := p_created_by_user_id;
  ELSE
    SELECT public.get_system_user_id() INTO v_created_by;
  END IF;
  
  -- 生成或使用传入的 token
  IF p_token IS NULL OR p_token = '' THEN
    -- 自动生成 token
    LOOP
      v_token := p_role || '-' || 
                 to_char(NOW(), 'YYYYMMDD') || '-' || 
                 UPPER(SUBSTRING(encode(gen_random_bytes(3), 'base32'), 1, 4));
      
      IF NOT EXISTS (
        SELECT 1 FROM public.invites WHERE token = v_token
      ) THEN
        EXIT;
      END IF;
    END LOOP;
  ELSE
    -- 使用传入的 token（规范化）
    v_token := UPPER(TRIM(p_token));
    
    -- 检查是否已存在
    IF EXISTS (
      SELECT 1 FROM public.invites WHERE token = v_token
    ) THEN
      RAISE EXCEPTION 'TOKEN_EXISTS: Token already exists';
    END IF;
  END IF;
  
  -- 计算过期时间
  IF p_expires_days IS NULL THEN
    v_expires_at := NULL;  -- 永不过期
  ELSE
    v_expires_at := NOW() + (p_expires_days || ' days')::INTERVAL;
  END IF;
  
  -- 插入邀请码（issued_by_type='admin'）
  INSERT INTO public.invites (
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
    NULL,  -- admin 创建的商家邀请码不绑定 venue
    p_role,
    'admin',  -- 强制 issued_by_type='admin'
    p_max_uses,
    0,
    v_expires_at,
    false,
    true,
    v_created_by
  )
  ON CONFLICT (token) 
  DO UPDATE SET
    merchant_id = EXCLUDED.merchant_id,
    intended_role = EXCLUDED.intended_role,
    issued_by_type = EXCLUDED.issued_by_type,
    max_uses = EXCLUDED.max_uses,
    expires_at = EXCLUDED.expires_at,
    disabled = false,
    is_active = true,
    updated_at = NOW()
  RETURNING id INTO v_invite_id;
  
  -- 返回创建的邀请码信息
  RETURN jsonb_build_object(
    'success', true,
    'id', v_invite_id,
    'token', v_token,
    'merchant_id', p_merchant_id,
    'role', p_role,
    'issued_by_type', 'admin',
    'max_uses', p_max_uses,
    'expires_at', v_expires_at
  );
END;
$$;

-- 授权（仅 service role 或 admin 可调用）
REVOKE ALL ON FUNCTION public.create_admin_merchant_invite(UUID, TEXT, TEXT, INT, INT, UUID) FROM public;
-- 注意：这个函数应该只由 service role 调用，不授予 authenticated
-- 如果需要，可以在 API route 中使用 service role 直接调用
