-- =========================================================
-- Seed Test Merchant Invite (token='1461')
-- 生成测试商家邀请码（token='1461'）
-- =========================================================
-- 
-- ⚠️  重要：此脚本依赖 Migration 017（添加 issued_by_type 列）
-- 请确保先执行 017_complete_invite_system.sql
-- 
-- 此脚本用于创建测试商家邀请码，token='1461'
-- 可重复运行，不会报错（使用 ON CONFLICT）
--

DO $$
DECLARE
  v_test_merchant_id UUID;
  v_region_id UUID;
  v_created_by UUID;
  v_invite_id UUID;
  v_has_issued_by_type BOOLEAN;
BEGIN
  -- 检查 issued_by_type 列是否存在
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'invites' 
    AND column_name = 'issued_by_type'
  ) INTO v_has_issued_by_type;
  
  IF NOT v_has_issued_by_type THEN
    RAISE EXCEPTION 'Migration 017 must be executed first. Please run 017_complete_invite_system.sql before this script.';
  END IF;
  -- =========================================================
  -- 步骤 1: 获取或创建测试 region
  -- =========================================================
  
  SELECT id INTO v_region_id
  FROM public.regions
  WHERE name = '测试城市' AND state IS NULL AND country = 'TEST'
  LIMIT 1;
  
  IF v_region_id IS NULL THEN
    INSERT INTO public.regions (name, state, country, lat, lng, is_active)
    VALUES ('测试城市', NULL, 'TEST', 0, 0, true)
    RETURNING id INTO v_region_id;
    
    RAISE NOTICE '✅ 已创建测试 region: %', v_region_id;
  ELSE
    RAISE NOTICE '✅ 使用现有 region: %', v_region_id;
  END IF;
  
  -- =========================================================
  -- 步骤 2: 获取或创建测试 merchant
  -- =========================================================
  
  SELECT id INTO v_test_merchant_id
  FROM public.merchants
  WHERE region_id = v_region_id AND name = '测试商家（通用测试）'
  LIMIT 1;
  
  IF v_test_merchant_id IS NULL THEN
    INSERT INTO public.merchants (region_id, name, status)
    VALUES (v_region_id, '测试商家（通用测试）', 'active')
    RETURNING id INTO v_test_merchant_id;
    
    RAISE NOTICE '✅ 已创建测试 merchant: %', v_test_merchant_id;
  ELSE
    RAISE NOTICE '✅ 使用现有 merchant: %', v_test_merchant_id;
  END IF;
  
  -- =========================================================
  -- 步骤 3: 获取 created_by 用户 ID
  -- =========================================================
  
  -- 优先查找 admin 用户
  SELECT au.user_id INTO v_created_by
  FROM public.admin_users au
  WHERE au.is_active = true
  LIMIT 1;
  
  -- 如果没有 admin，查找第一个用户
  IF v_created_by IS NULL THEN
    SELECT id INTO v_created_by
    FROM auth.users
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;
  
  -- 如果还是没有，使用 NULL（外键允许 NULL）
  IF v_created_by IS NULL THEN
    RAISE NOTICE '⚠️  警告：未找到任何用户，created_by 将设置为 NULL';
  ELSE
    RAISE NOTICE '✅ 使用 created_by 用户 ID: %', v_created_by;
  END IF;
  
  -- =========================================================
  -- 步骤 4: 创建或更新 token='1461' 的邀请码
  -- =========================================================
  
  -- 使用动态 SQL 确保 issued_by_type 列存在时才插入
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
    '1461'::TEXT,  -- token（纯数字，会自动 UPPER 规范化）
    v_test_merchant_id,
    NULL::UUID,    -- venue_id (NULL = 所有场地)
    'owner'::TEXT, -- intended_role: owner（商家创建者角色）
    'admin'::TEXT, -- issued_by_type: admin（管理员创建）
    999999,        -- max_uses（大量使用次数）
    0,             -- used_count
    NULL::TIMESTAMPTZ,  -- expires_at (NULL = 永不过期)
    false,         -- disabled
    true,          -- is_active
    v_created_by   -- created_by
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
  
  -- 输出结果
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ 测试商家邀请码创建/更新成功！';
  RAISE NOTICE '========================================';
  RAISE NOTICE '邀请码 Token: 1461';
  RAISE NOTICE '商户 ID: %', v_test_merchant_id;
  RAISE NOTICE '商户名称: 测试商家（通用测试）';
  RAISE NOTICE '角色: owner (商家创建者)';
  RAISE NOTICE '创建来源: admin';
  RAISE NOTICE '最大使用次数: 999999';
  RAISE NOTICE '过期时间: 永不过期';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '📋 使用说明：';
  RAISE NOTICE '1. 在商家注册页面（/invite）输入邀请码: 1461';
  RAISE NOTICE '2. 用户兑换后将自动成为该商户的 owner（商家创建者）';
  RAISE NOTICE '3. 之后可以在商户设置中修改商户名称等信息';
  RAISE NOTICE '';
  
END $$;

-- =========================================================
-- 查询创建的邀请码（验证）
-- =========================================================

SELECT 
  i.token AS invite_token,
  m.name AS merchant_name,
  i.intended_role AS role,
  i.issued_by_type AS issued_by,
  i.max_uses,
  i.used_count,
  (i.max_uses - i.used_count) AS remaining_uses,
  i.expires_at,
  CASE 
    WHEN i.disabled THEN '已禁用'
    WHEN NOT i.is_active THEN '未激活'
    WHEN i.expires_at IS NOT NULL AND i.expires_at < NOW() THEN '已过期'
    WHEN i.used_count >= i.max_uses THEN '已用完'
    ELSE '✅ 有效'
  END AS status,
  u.email AS created_by_email,
  i.created_at
FROM public.invites i
JOIN public.merchants m ON i.merchant_id = m.id
LEFT JOIN auth.users u ON i.created_by = u.id
WHERE i.token = '1461'
ORDER BY i.created_at DESC
LIMIT 1;
