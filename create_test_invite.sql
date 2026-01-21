-- =========================================================
-- 创建商家邀请码（商家注册测试）
-- =========================================================
-- 
-- 此脚本用于创建商家邀请码（owner 角色），用于商家注册：
-- 1. 创建测试 region（如果不存在）
-- 2. 创建测试商户（如果不存在）
-- 3. 创建商家邀请码（owner 角色，用于商家注册）
--
-- ⚠️  注意：此邀请码用于商家注册，角色为 owner
-- 使用此邀请码的用户会成为该商户的 owner（商家创建者）
--
-- 使用方法：
-- 1. 在 Supabase Dashboard SQL Editor 中执行此脚本
-- 2. 如果 auth.uid() 为 NULL，脚本会自动查找或创建一个管理员用户作为创建者
-- 3. 脚本会自动创建测试数据并返回商家邀请码
--

DO $$
DECLARE
  v_region_id UUID;
  v_merchant_id UUID;
  v_user_id UUID;
  v_invite_result JSONB;
  v_token TEXT;
  v_invite_id UUID;
BEGIN
  -- 获取当前用户（如果已登录）
  v_user_id := auth.uid();
  
  -- 如果没有登录上下文，尝试查找一个管理员用户
  IF v_user_id IS NULL THEN
    -- 查找 admin_users 表中的第一个活跃管理员
    SELECT au.user_id INTO v_user_id
    FROM public.admin_users au
    WHERE au.is_active = true
    LIMIT 1;
    
    -- 如果也没有管理员，查找任意一个用户
    IF v_user_id IS NULL THEN
      SELECT id INTO v_user_id
      FROM auth.users
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;
    
    -- 如果还是找不到，使用一个示例 UUID（需要替换为实际的用户 ID）
    IF v_user_id IS NULL THEN
      RAISE NOTICE '⚠️  警告：未找到任何用户。请手动创建一个用户或修改脚本中的 v_user_id。';
      RAISE NOTICE '或者，你可以先执行：SELECT id, email FROM auth.users LIMIT 1; 获取一个用户 ID';
      -- 这里使用 NULL，后续会处理
    ELSE
      RAISE NOTICE '使用找到的用户 ID: %', v_user_id;
    END IF;
  END IF;
  
  -- 如果仍然没有 user_id，使用一个占位符（需要用户手动替换）
  IF v_user_id IS NULL THEN
    -- 允许用户手动指定，这里使用第一个创建的用户（通常是管理员）
    RAISE NOTICE '⚠️  警告：无法自动获取用户 ID。请先执行以下查询获取一个用户 ID：';
    RAISE NOTICE 'SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 1;';
    RAISE NOTICE '然后将下面的 v_user_id 设置为该 ID，或修改脚本直接指定。';
    RAISE EXCEPTION '无法自动获取用户 ID。请先创建用户或手动指定 created_by 用户 ID。';
  END IF;
  
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
    
    RAISE NOTICE '已创建测试 region: %', v_region_id;
  ELSE
    RAISE NOTICE '使用现有 region: %', v_region_id;
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
    
    RAISE NOTICE '已创建测试商户: %', v_merchant_id;
  ELSE
    RAISE NOTICE '使用现有商户: %', v_merchant_id;
  END IF;
  
  -- =========================================================
  -- 步骤 3: 创建商家邀请码（owner 角色）
  -- =========================================================
  
  -- 尝试使用 RPC 函数创建邀请码（如果权限允许）
  BEGIN
    SELECT public.create_invite_code(
      v_merchant_id,        -- merchant_id（绑定到测试商户）
      NULL,                  -- venue_id (NULL = 所有场地)
      'owner',               -- role: owner（商家创建者角色）
      10,                    -- max_uses（最多使用 10 次）
      365                    -- expires_days (1年有效)
    ) INTO v_invite_result;
  EXCEPTION
    WHEN OTHERS THEN
      -- 如果 RPC 失败（权限问题），直接使用 INSERT 创建
      RAISE NOTICE 'RPC 创建失败，使用直接 INSERT 方式创建邀请码...';
      
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
      
      -- 直接插入邀请码（绕过 RPC 权限检查）
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
        NULL,                  -- venue_id (NULL = 所有场地)
        'owner',               -- role: owner（商家创建者角色）
        10,                    -- max_uses（最多使用 10 次）
        0,                     -- used_count
        NOW() + INTERVAL '365 days',  -- expires_at (1年有效)
        false,                 -- disabled
        true,                  -- is_active
        v_user_id              -- created_by
      )
      RETURNING id, token INTO v_invite_id, v_token;
      
      -- 构建结果对象
      v_invite_result := jsonb_build_object(
        'success', true,
        'id', v_invite_id,
        'token', v_token,
        'merchant_id', v_merchant_id,
        'venue_id', NULL,
        'role', 'owner',
        'max_uses', 10,
        'expires_at', (NOW() + INTERVAL '365 days')::TEXT
      );
  END;
  
  -- 输出结果
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ 商家邀请码创建成功！';
  RAISE NOTICE '========================================';
  RAISE NOTICE '邀请码 Token: %', v_invite_result->>'token';
  RAISE NOTICE '商户 ID: %', v_merchant_id;
  RAISE NOTICE '商户名称: %', '新商家（待注册）';
  RAISE NOTICE '角色: % (商家创建者)', v_invite_result->>'role';
  RAISE NOTICE '最大使用次数: %', v_invite_result->>'max_uses';
  RAISE NOTICE '过期时间: %', v_invite_result->>'expires_at';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '📋 使用说明：';
  RAISE NOTICE '1. 复制上面的邀请码 Token';
  RAISE NOTICE '2. 在商家注册页面（/invite）输入邀请码';
  RAISE NOTICE '3. 用户兑换后将自动成为该商户的 owner（商家创建者）';
  RAISE NOTICE '4. 之后可以在商户设置中修改商户名称等信息';
  RAISE NOTICE '';
  
END $$;

-- =========================================================
-- 查询创建的邀请码（可选）
-- =========================================================

-- 查询刚才创建的邀请码（查看详细信息）
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
