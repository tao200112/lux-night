-- =========================================================
-- 004 SEED - Test Data & Invite Code 1461
-- 测试数据（最终态）
-- =========================================================
-- 说明：
-- - 创建测试 region、merchant、venue
-- - 生成测试邀请码 token='1461'（OWNER 角色）
-- - 所有语句幂等可重复执行
-- - 不使用硬编码 UUID
-- =========================================================

DO $$
DECLARE
  v_region_id UUID;
  v_merchant_id UUID;
  v_venue_id UUID;
  v_invite_id UUID;
  v_created_by UUID;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Starting seed data creation...';
  RAISE NOTICE '========================================';
  
  -- =========================================================
  -- 1. 确保存在 test region
  -- =========================================================
  
  SELECT id INTO v_region_id
  FROM public.regions
  WHERE name = 'Los Angeles'
    AND state = 'CA'
    AND country = 'US'
  LIMIT 1;
  
  IF v_region_id IS NULL THEN
    INSERT INTO public.regions(name, state, country, lat, lng, is_active)
    VALUES ('Los Angeles', 'CA', 'US', 34.0522, -118.2437, true)
    ON CONFLICT (name, state, country) DO UPDATE
    SET is_active = true,
        updated_at = NOW()
    RETURNING id INTO v_region_id;
    
    RAISE NOTICE '✓ Created region: Los Angeles (CA)';
  ELSE
    RAISE NOTICE '✓ Region already exists: Los Angeles (CA)';
  END IF;
  
  -- =========================================================
  -- 2. 确保存在 test merchant
  -- =========================================================
  
  SELECT id INTO v_merchant_id
  FROM public.merchants
  WHERE name = 'Test Merchant (Invite 1461)'
    AND region_id = v_region_id
  LIMIT 1;
  
  IF v_merchant_id IS NULL THEN
    INSERT INTO public.merchants(region_id, name, status)
    VALUES (v_region_id, 'Test Merchant (Invite 1461)', 'active')
    ON CONFLICT (region_id, name) DO UPDATE
    SET status = 'active',
        updated_at = NOW()
    RETURNING id INTO v_merchant_id;
    
    RAISE NOTICE '✓ Created merchant: Test Merchant (Invite 1461)';
  ELSE
    RAISE NOTICE '✓ Merchant already exists: Test Merchant (Invite 1461)';
  END IF;
  
  -- =========================================================
  -- 3. 确保存在 test venue
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
      lat,
      lng,
      timezone,
      is_active
    )
    VALUES (
      v_merchant_id,
      v_region_id,
      'Test Venue',
      '123 Test Street, Los Angeles, CA 90001',
      34.0522,
      -118.2437,
      'America/Los_Angeles',
      true
    )
    ON CONFLICT (merchant_id, name) DO UPDATE
    SET is_active = true,
        updated_at = NOW()
    RETURNING id INTO v_venue_id;
    
    RAISE NOTICE '✓ Created venue: Test Venue';
  ELSE
    RAISE NOTICE '✓ Venue already exists: Test Venue';
  END IF;
  
  -- =========================================================
  -- 4. 获取 created_by user（用于 invite）
  -- =========================================================
  -- 策略：
  -- 1. 优先使用第一个 admin_users
  -- 2. 否则使用第一个 auth.users
  -- 3. 如果都没有，设为 NULL（invite 支持 NULL created_by）
  
  SELECT au.user_id INTO v_created_by
  FROM public.admin_users au
  WHERE au.is_active = true
  LIMIT 1;
  
  IF v_created_by IS NULL THEN
    SELECT id INTO v_created_by
    FROM auth.users
    WHERE deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;
  
  IF v_created_by IS NOT NULL THEN
    RAISE NOTICE '✓ Using created_by user: %', v_created_by;
  ELSE
    RAISE NOTICE '⚠ No user found, invite will have NULL created_by';
  END IF;
  
  -- =========================================================
  -- 5. 创建/更新测试邀请码 token='1461'
  -- =========================================================
  
  -- 先检查是否已存在
  SELECT id INTO v_invite_id
  FROM public.invites
  WHERE token = '1461'
  LIMIT 1;
  
  IF v_invite_id IS NULL THEN
    -- 不存在，插入新 invite
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
      created_by,
      note
    )
    VALUES (
      '1461',
      v_merchant_id,
      NULL, -- 所有 venues
      'owner',
      'admin',
      999999,
      0,
      NULL, -- 永不过期
      false,
      true,
      v_created_by,
      'Test merchant invite code for development'
    )
    RETURNING id INTO v_invite_id;
    
    RAISE NOTICE '✓ Created invite: token=1461 (OWNER role)';
  ELSE
    -- 已存在，更新为确保配置正确
    UPDATE public.invites
    SET merchant_id = v_merchant_id,
        venue_id = NULL,
        intended_role = 'owner',
        issued_by_type = 'admin',
        max_uses = 999999,
        expires_at = NULL,
        disabled = false,
        is_active = true,
        created_by = COALESCE(created_by, v_created_by),
        note = 'Test merchant invite code for development',
        updated_at = NOW()
    WHERE id = v_invite_id;
    
    RAISE NOTICE '✓ Updated existing invite: token=1461 (OWNER role)';
  END IF;
  
  -- =========================================================
  -- 完成
  -- =========================================================
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Seed data created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Test invite code: 1461';
  RAISE NOTICE '  - Merchant: Test Merchant (Invite 1461)';
  RAISE NOTICE '  - Role: OWNER';
  RAISE NOTICE '  - Max uses: 999999';
  RAISE NOTICE '  - Expires: Never';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Login to internal app';
  RAISE NOTICE '  2. Enter invite code: 1461';
  RAISE NOTICE '  3. You will become OWNER of test merchant';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Seed failed: %', SQLERRM;
END $$;
