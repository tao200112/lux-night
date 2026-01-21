-- =========================================================
-- 930 SEED TEST INVITES
-- 测试数据：生成通用商家邀请码 token='1461'
-- =========================================================
-- 说明：
-- 1. 此脚本幂等：可重复执行
-- 2. 自动创建 test region → test merchant → test venue
-- 3. 生成 token='1461' 的 OWNER 邀请码
-- 4. 适用于本地测试和开发环境
-- =========================================================

DO $$
DECLARE
  v_region_id UUID;
  v_merchant_id UUID;
  v_venue_id UUID;
  v_user_id UUID;
BEGIN
  -- =========================================================
  -- 1. 确保存在 test region
  -- =========================================================
  
  SELECT id INTO v_region_id
  FROM public.regions
  WHERE name = 'Test Region'
  LIMIT 1;
  
  IF v_region_id IS NULL THEN
    INSERT INTO public.regions(name, state, country, is_active)
    VALUES ('Test Region', 'CA', 'US', true)
    RETURNING id INTO v_region_id;
    
    RAISE NOTICE '✓ Created test region: %', v_region_id;
  ELSE
    RAISE NOTICE '✓ Test region already exists: %', v_region_id;
  END IF;
  
  -- =========================================================
  -- 2. 确保存在 test merchant（使用 upsert 避免冲突）
  -- =========================================================
  
  -- 先尝试查找现有 merchant
  SELECT id INTO v_merchant_id
  FROM public.merchants
  WHERE name = 'Test Merchant (Invite 1461)'
    AND region_id = v_region_id
  LIMIT 1;
  
  IF v_merchant_id IS NULL THEN
    -- 如果不存在，创建新的
    INSERT INTO public.merchants(region_id, name, status)
    VALUES (v_region_id, 'Test Merchant (Invite 1461)', 'active')
    ON CONFLICT (region_id, name) DO NOTHING
    RETURNING id INTO v_merchant_id;
    
    -- 如果 INSERT 因为 CONFLICT 没有返回 ID，再次查询
    IF v_merchant_id IS NULL THEN
      SELECT id INTO v_merchant_id
      FROM public.merchants
      WHERE name = 'Test Merchant (Invite 1461)'
        AND region_id = v_region_id
      LIMIT 1;
      
      RAISE NOTICE '✓ Test merchant already exists: %', v_merchant_id;
    ELSE
      RAISE NOTICE '✓ Created test merchant: %', v_merchant_id;
    END IF;
  ELSE
    RAISE NOTICE '✓ Test merchant already exists: %', v_merchant_id;
  END IF;
  
  -- =========================================================
  -- 3. 确保存在 test venue（使用 upsert 避免冲突）
  -- =========================================================
  
  SELECT id INTO v_venue_id
  FROM public.venues
  WHERE merchant_id = v_merchant_id
    AND name = 'Test Venue'
  LIMIT 1;
  
  IF v_venue_id IS NULL THEN
    INSERT INTO public.venues(
      merchant_id,
      region_id,
      name,
      address,
      timezone,
      is_active
    )
    VALUES (
      v_merchant_id,
      v_region_id,
      'Test Venue',
      '123 Test Street, Test City, CA 90001',
      'America/Los_Angeles',
      true
    )
    ON CONFLICT (merchant_id, name) DO NOTHING
    RETURNING id INTO v_venue_id;
    
    -- 如果 INSERT 因为 CONFLICT 没有返回 ID，再次查询
    IF v_venue_id IS NULL THEN
      SELECT id INTO v_venue_id
      FROM public.venues
      WHERE merchant_id = v_merchant_id
        AND name = 'Test Venue'
      LIMIT 1;
      
      RAISE NOTICE '✓ Test venue already exists: %', v_venue_id;
    ELSE
      RAISE NOTICE '✓ Created test venue: %', v_venue_id;
    END IF;
  ELSE
    RAISE NOTICE '✓ Test venue already exists: %', v_venue_id;
  END IF;
  
  -- =========================================================
  -- 4. 获取 created_by 用户（admin 或 first user）
  -- =========================================================
  
  -- 优先使用 active admin
  SELECT au.user_id INTO v_user_id
  FROM public.admin_users au
  WHERE au.is_active = true
  ORDER BY au.created_at ASC
  LIMIT 1;
  
  -- 如果没有 admin，使用第一个用户
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id
    FROM auth.users
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;
  
  -- 如果连用户都没有，设为 NULL（允许 system created）
  IF v_user_id IS NULL THEN
    RAISE NOTICE '⚠ No users found, created_by will be NULL';
  ELSE
    RAISE NOTICE '✓ Using user as creator: %', v_user_id;
  END IF;
  
  -- =========================================================
  -- 5. 生成商家邀请码 token='1461'
  -- =========================================================
  
  -- 使用 upsert 确保幂等
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
  )
  VALUES (
    '1461',                    -- token（大写）
    v_merchant_id,             -- 关联 test merchant
    NULL,                      -- venue_id 为空（所有场地）
    'owner',                   -- 角色：OWNER
    'admin',                   -- 由 admin 创建
    999999,                    -- 几乎无限使用
    0,                         -- 初始使用次数
    NULL,                      -- 永不过期
    false,                     -- 未禁用
    true,                      -- 激活
    v_user_id                  -- 创建者
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
    updated_at = NOW();
  
  RAISE NOTICE '✓ Invite code ''1461'' is ready (role=owner, merchant=%)!', v_merchant_id;
  
  -- =========================================================
  -- 6. 输出测试信息
  -- =========================================================
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '🎉 Test data seeded successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Test Invite Code: 1461';
  RAISE NOTICE '   - Merchant: Test Merchant (Invite 1461)';
  RAISE NOTICE '   - Venue: Test Venue';
  RAISE NOTICE '   - Role: owner';
  RAISE NOTICE '   - Type: admin (merchant invite)';
  RAISE NOTICE '';
  RAISE NOTICE '🧪 Usage:';
  RAISE NOTICE '   1. Google login to internal app';
  RAISE NOTICE '   2. Enter invite code: 1461';
  RAISE NOTICE '   3. You will become OWNER of Test Merchant';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
END $$;

-- =========================================================
-- 验证查询（可选）
-- =========================================================

-- 查看创建的邀请码
SELECT 
  i.token,
  i.intended_role,
  i.issued_by_type,
  i.max_uses,
  i.used_count,
  i.expires_at,
  i.disabled,
  i.is_active,
  m.name AS merchant_name,
  v.name AS venue_name
FROM public.invites i
JOIN public.merchants m ON m.id = i.merchant_id
LEFT JOIN public.venues v ON v.id = i.venue_id
WHERE i.token = '1461';
