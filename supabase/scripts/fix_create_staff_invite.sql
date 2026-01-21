-- =========================================================
-- 修复 create_staff_invite 函数中的 v_venue 未赋值错误
-- 问题：当 p_venue_id 为 NULL 时，v_venue 记录未被赋值，
--       但在返回结果时访问了 v_venue.name
-- =========================================================

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
  -- 修复：使用 CASE 语句，只在 p_venue_id IS NOT NULL 时访问 v_venue.name
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
