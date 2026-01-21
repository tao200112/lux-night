-- =========================================================
-- 创建商家邀请码（手动指定用户 ID 版本）
-- =========================================================
-- 
-- 此脚本用于创建商家邀请码（owner 角色），用于商家注册
-- 适用于：还没有注册用户，需要手动指定 created_by 用户 ID
--
-- 使用方法：
-- 1. 先查询是否有用户：SELECT id, email FROM auth.users LIMIT 1;
-- 2. 如果没有用户，先通过应用注册一个用户（访问登录页面，使用 Google/Apple 登录）
-- 3. 获取用户 ID 后，修改脚本中的 v_user_id 变量
-- 4. 执行脚本
--

-- =========================================================
-- 步骤 1: 查询现有用户（可选）
-- =========================================================

-- 查询现有用户（用于获取用户 ID）
SELECT id, email, created_at 
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 5;

-- 如果上面查询有结果，复制一个用户 ID，用于下面的脚本
-- 如果查询没有结果，请先通过应用注册一个用户

-- =========================================================
-- 步骤 2: 创建商家邀请码（修改 v_user_id 后执行）
-- =========================================================

DO $$
DECLARE
  v_region_id UUID;
  v_merchant_id UUID;
  v_user_id UUID;  -- ⚠️ 如果没有自动找到用户，请手动设置这里！
  v_token TEXT;
  v_invite_id UUID;
BEGIN
  -- =========================================================
  -- ⚠️ 重要：手动指定用户 ID（如果需要）
  -- =========================================================
  -- 如果上面的用户查询有结果，取消注释下面一行，并替换为实际的用户 ID
  -- v_user_id := 'YOUR_USER_ID_HERE'::UUID;
  
  -- 尝试自动获取用户 ID
  -- 方式 1: 尝试从 auth.uid() 获取（如果已登录）
  IF v_user_id IS NULL THEN
    v_user_id := auth.uid();
  END IF;
  
  -- 方式 2: 查找管理员用户
  IF v_user_id IS NULL THEN
    SELECT au.user_id INTO v_user_id
    FROM public.admin_users au
    WHERE au.is_active = true
    LIMIT 1;
  END IF;
  
  -- 方式 3: 查找任意一个用户（最新的）
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id
    FROM auth.users
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;
  
  -- 检查是否找到用户
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 
      '未找到任何用户。请先通过应用注册一个用户（访问登录页面，使用 Google/Apple 登录），然后重新执行此脚本。或者手动指定 v_user_id 变量。';
  END IF;
  
  RAISE NOTICE '✅ 使用用户 ID: %', v_user_id;
  
  -- =========================================================
  -- 步骤 1: 创建或获取测试 region
  -- =========================================================
  
  -- 查找或创建测试 region
  SELECT id INTO v_region_id
  FROM public.regions
  WHERE name = '测试城市' AND state IS NULL AND country = 'TEST'
  LIMIT 1;
  
  IF v_region_id IS NULL THEN
    -- 创建测试 region
    INSERT INTO public.regions (name, state, country, lat, lng, is_active)
    VALUES ('测试城市', NULL, 'TEST', 0, 0, true)
    RETURNING id INTO v_region_id;
    
    RAISE NOTICE '✅ 已创建测试 region: %', v_region_id;
  ELSE
    RAISE NOTICE '✅ 使用现有 region: %', v_region_id;
  END IF;
  
  -- =========================================================
  -- 步骤 2: 创建或获取测试商户
  -- =========================================================
  
  -- 查找或创建测试商户（用于绑定邀请码）
  SELECT id INTO v_merchant_id
  FROM public.merchants
  WHERE region_id = v_region_id AND name = '新商家（待注册）'
  LIMIT 1;
  
  IF v_merchant_id IS NULL THEN
    -- 创建测试商户（这个商户用于绑定邀请码，新商家注册后可以更名）
    INSERT INTO public.merchants (region_id, name, status)
    VALUES (v_region_id, '新商家（待注册）', 'active')
    RETURNING id INTO v_merchant_id;
    
    RAISE NOTICE '✅ 已创建测试商户: %', v_merchant_id;
  ELSE
    RAISE NOTICE '✅ 使用现有商户: %', v_merchant_id;
  END IF;
  
  -- =========================================================
  -- 步骤 3: 创建商家邀请码（owner 角色）
  -- =========================================================
  
  -- 生成唯一 token（格式: OWNER-YYYYMMDD-XXXX）
  LOOP
    v_token := 'OWNER-' || 
               to_char(NOW(), 'YYYYMMDD') || '-' || 
               UPPER(SUBSTRING(encode(gen_random_bytes(3), 'base32'), 1, 4));
    
    -- 检查是否已存在
    IF NOT EXISTS (
      SELECT 1 FROM public.invites WHERE token = v_token
    ) THEN
      EXIT;  -- 找到唯一 token，退出循环
    END IF;
  END LOOP;
  
  -- 直接插入邀请码（绕过 RPC 权限检查，适用于 Dashboard SQL Editor）
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
    v_merchant_id,
    NULL,                      -- venue_id (NULL = 所有场地)
    'owner',                   -- role: owner（商家创建者角色）
    10,                        -- max_uses（最多使用 10 次）
    0,                         -- used_count
    NOW() + INTERVAL '365 days',  -- expires_at (1年有效)
    false,                     -- disabled
    true,                      -- is_active
    v_user_id                  -- created_by
  )
  RETURNING id, token INTO v_invite_id, v_token;
  
  -- 输出结果
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ 商家邀请码创建成功！';
  RAISE NOTICE '========================================';
  RAISE NOTICE '邀请码 Token: %', v_token;
  RAISE NOTICE '商户 ID: %', v_merchant_id;
  RAISE NOTICE '商户名称: 新商家（待注册）';
  RAISE NOTICE '角色: owner (商家创建者)';
  RAISE NOTICE '最大使用次数: 10';
  RAISE NOTICE '过期时间: %', (NOW() + INTERVAL '365 days')::TEXT;
  RAISE NOTICE '创建者用户 ID: %', v_user_id;
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '📋 使用说明：';
  RAISE NOTICE '1. 复制上面的邀请码 Token: %', v_token;
  RAISE NOTICE '2. 在商家注册页面（/invite）输入邀请码';
  RAISE NOTICE '3. 用户兑换后将自动成为该商户的 owner（商家创建者）';
  RAISE NOTICE '4. 之后可以在商户设置中修改商户名称等信息';
  RAISE NOTICE '';
  
END $$;

-- =========================================================
-- 查询创建的邀请码（查看详细信息）
-- =========================================================

SELECT 
  i.token AS invite_token,
  m.name AS merchant_name,
  i.intended_role AS role,
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
WHERE m.name = '新商家（待注册）'
ORDER BY i.created_at DESC
LIMIT 5;
