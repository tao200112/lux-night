-- =========================================================
-- 为特定用户创建商家邀请码脚本
-- 用途：为 taoliu001711@gmail.com 创建一个独立的商家邀请码
-- =========================================================

-- 步骤 1: 查找用户的 ID（如果已存在）
-- SELECT id, email FROM auth.users WHERE email = 'taoliu001711@gmail.com';

-- 步骤 2: 创建一个新的 merchant（如果需要）
-- 注意：这里我们创建一个新的 merchant，让该用户成为 owner
-- 如果该用户已经有一个 merchant，可以跳过此步骤

-- 插入新的 region（如果 "Los Angeles (CA)" 不存在）
-- 注意：regions 表的唯一约束是 (name, state, country)
INSERT INTO public.regions (id, name, state, country, is_active)
VALUES 
  (
    COALESCE((SELECT id FROM public.regions WHERE name = 'Los Angeles (CA)' AND state = 'CA' AND country = 'US' LIMIT 1), gen_random_uuid()),
    'Los Angeles (CA)',
    'CA',
    'US',
    true
  )
ON CONFLICT (name, state, country) DO NOTHING;

-- 获取 region ID
DO $$
DECLARE
  v_region_id UUID;
  v_merchant_id UUID;
  v_invite_token TEXT;
BEGIN
  -- 获取 region ID
  SELECT id INTO v_region_id
  FROM public.regions
  WHERE name = 'Los Angeles (CA)' AND state = 'CA' AND country = 'US'
  LIMIT 1;

  -- 创建新的 merchant（如果不存在）
  -- 注意：merchants 表的唯一约束是 (region_id, name)
  INSERT INTO public.merchants (id, name, region_id, status)
  VALUES (
    gen_random_uuid(),
    'Merchant for taoliu001711@gmail.com',
    v_region_id,
    'active'
  )
  ON CONFLICT (region_id, name) DO NOTHING
  RETURNING id INTO v_merchant_id;

  -- 如果 merchant 已存在，获取其 ID
  IF v_merchant_id IS NULL THEN
    SELECT id INTO v_merchant_id
    FROM public.merchants
    WHERE name = 'Merchant for taoliu001711@gmail.com'
    LIMIT 1;
  END IF;

  -- 生成唯一的邀请码（6位）
  LOOP
    v_invite_token := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));
    
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.invites WHERE token = v_invite_token
    );
  END LOOP;

  -- 创建 ADMIN_TO_MERCHANT 邀请码（无限制使用）
  INSERT INTO public.invites (
    id,
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
    note
  )
  VALUES (
    gen_random_uuid(),
    v_invite_token,
    v_merchant_id,
    NULL,
    'owner',
    'admin',
    999999,  -- 无限制使用
    0,
    NULL,    -- 永不过期
    false,
    true,
    'Created for taoliu001711@gmail.com - Independent merchant invite'
  )
  ON CONFLICT (token) DO NOTHING;

  -- 输出结果
  RAISE NOTICE 'Merchant ID: %', v_merchant_id;
  RAISE NOTICE 'Invite Token: %', v_invite_token;
  RAISE NOTICE '';
  RAISE NOTICE '请使用以下邀请码为 taoliu001711@gmail.com 创建独立商家身份:';
  RAISE NOTICE 'Invite Code: %', v_invite_token;
END $$;

-- 步骤 3: 查询生成的邀请码（用于验证）
SELECT 
  i.token,
  i.intended_role,
  i.max_uses,
  i.used_count,
  i.expires_at,
  m.name AS merchant_name,
  i.note
FROM public.invites i
INNER JOIN public.merchants m ON m.id = i.merchant_id
WHERE i.note LIKE '%taoliu001711@gmail.com%'
ORDER BY i.created_at DESC
LIMIT 1;
