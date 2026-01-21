-- =========================================================
-- Seed Example: 正确的种子数据示例（无硬编码 UUID）
-- =========================================================
-- 
-- 使用说明：
-- 1. 在 Supabase Dashboard SQL Editor 中执行
-- 2. 首先确保有管理员用户（admin_users）
-- 3. 按顺序执行：merchants -> venues -> invites (通过 RPC)
--

-- =========================================================
-- 步骤 1: 创建商户（示例）
-- =========================================================

-- 示例：创建商户（返回生成的 ID）
-- ⚠️  注意：merchants 表需要 region_id，请先查询或选择一个 region_id
-- 
-- 先查询 regions 表获取 region_id:
-- SELECT id, name FROM public.regions WHERE is_active = true LIMIT 1;
--
-- 然后使用以下 SQL 创建商户（替换 YOUR_REGION_ID）:
-- INSERT INTO public.merchants (region_id, name, status)
-- VALUES ('YOUR_REGION_ID', '示例商户', 'active')
-- RETURNING id, name, created_at;

-- 或者使用子查询自动选择第一个 active region:
-- INSERT INTO public.merchants (region_id, name, status)
-- SELECT id, '示例商户', 'active'
-- FROM public.regions
-- WHERE is_active = true
-- LIMIT 1
-- RETURNING id, name, created_at;

-- 保存返回的 merchant_id，用于后续步骤
-- 例如：假设返回的 merchant_id 是 'abc123...'

-- =========================================================
-- 步骤 2: 创建场地（示例）
-- =========================================================

-- 示例：为商户创建场地（替换 YOUR_MERCHANT_ID 为实际值）
-- 注意：venues 表需要 region_id，先查询 regions 表获取 region_id
-- INSERT INTO public.venues (merchant_id, region_id, name, address, timezone, is_active)
-- VALUES (
--   'YOUR_MERCHANT_ID',  -- 替换为步骤 1 返回的 merchant_id
--   'YOUR_REGION_ID',    -- 替换为实际的 region_id（从 regions 表查询）
--   '示例场地',
--   '示例地址',
--   'Asia/Shanghai',
--   true                 -- is_active (boolean)
-- )
-- RETURNING id, name, merchant_id, created_at;

-- 保存返回的 venue_id（如果需要为特定场地创建邀请码）

-- =========================================================
-- 步骤 3: 通过 RPC 创建邀请码（推荐方式）
-- =========================================================

-- 注意：必须先有一个已登录的用户（owner/manager/admin）
-- 如果是首次创建商户，需要：
-- 1. 先手动创建一个 owner 用户（通过 admin_users 或直接插入 merchant_members）
-- 2. 然后用该用户登录，调用 create_invite_code RPC

-- 示例 1: 创建 STAFF 邀请码（适用于所有场地，30天有效）
-- SELECT public.create_invite_code(
--   'YOUR_MERCHANT_ID',     -- merchant_id
--   NULL,                    -- venue_id (NULL = 所有场地)
--   'staff',                 -- role (小写)
--   10,                      -- max_uses
--   30                       -- expires_days
-- );

-- 示例 2: 创建 MANAGER 邀请码（特定场地，90天有效）
-- SELECT public.create_invite_code(
--   'YOUR_MERCHANT_ID',     -- merchant_id
--   'YOUR_VENUE_ID',        -- venue_id (特定场地)
--   'manager',              -- role
--   5,                      -- max_uses
--   90                      -- expires_days
-- );

-- 示例 3: 创建 OWNER 邀请码（永久有效，无限使用）
-- SELECT public.create_invite_code(
--   'YOUR_MERCHANT_ID',     -- merchant_id
--   NULL,                    -- venue_id (NULL = 所有场地)
--   'owner',                -- role
--   999999,                 -- max_uses (非常大的数字)
--   NULL                    -- expires_days (NULL = 永不过期)
-- );

-- =========================================================
-- 步骤 4: 手动创建 owner 用户（首次创建商户时）
-- =========================================================

-- 如果需要手动创建第一个 owner 用户（例如管理员创建商户时）
-- 注意：这需要你知道用户的 auth.users.id

-- 1. 查询用户的 ID（替换 email）
-- SELECT id, email FROM auth.users WHERE email = 'owner@example.com';

-- 2. 插入 merchant_members（替换 YOUR_USER_ID 和 YOUR_MERCHANT_ID）
-- INSERT INTO public.merchant_members (merchant_id, user_id, role, is_active)
-- VALUES (
--   'YOUR_MERCHANT_ID',     -- merchant_id
--   'YOUR_USER_ID',         -- user_id (从 auth.users 查询得到)
--   'owner',                -- role (小写)
--   true                    -- is_active
-- )
-- ON CONFLICT (merchant_id, user_id)
-- DO UPDATE SET 
--   role = EXCLUDED.role,
--   is_active = true,
--   updated_at = NOW();

-- =========================================================
-- 完整示例流程（在 Supabase Dashboard 中执行）
-- =========================================================

-- 步骤 1: 创建商户
-- ⚠️  注意：merchants 表需要 region_id，以下示例会自动选择第一个 active region
DO $$
DECLARE
  v_merchant_id UUID;
  v_user_id UUID;
  v_region_id UUID;
BEGIN
  -- 先获取一个 active region_id（如果存在）
  SELECT id INTO v_region_id
  FROM public.regions
  WHERE is_active = true
  LIMIT 1;
  
  -- 如果没有 active region，抛出错误
  IF v_region_id IS NULL THEN
    RAISE EXCEPTION 'No active region found. Please create a region first.';
  END IF;
  
  -- 创建商户（使用 region_id）
  INSERT INTO public.merchants (region_id, name, status)
  VALUES (v_region_id, '测试商户', 'active')
  RETURNING id INTO v_merchant_id;
  
  -- 获取当前用户（如果是管理员创建）
  v_user_id := auth.uid();
  
  -- 如果当前用户存在，设置为 owner
  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.merchant_members (merchant_id, user_id, role, is_active)
    VALUES (v_merchant_id, v_user_id, 'owner', true)
    ON CONFLICT (merchant_id, user_id)
    DO UPDATE SET 
      role = 'owner',
      is_active = true,
      updated_at = NOW();
  END IF;
  
  -- 输出商户 ID（用于后续步骤）
  RAISE NOTICE 'Merchant created: %', v_merchant_id;
END $$;

-- 步骤 2: 创建场地（可选）
-- 注意：venues 表需要 region_id，先查询 regions 表获取 region_id
-- DO $$
-- DECLARE
--   v_venue_id UUID;
--   v_merchant_id UUID := 'YOUR_MERCHANT_ID';  -- 替换为实际值
--   v_region_id UUID;                          -- 需要从 regions 表获取
-- BEGIN
--   -- 先获取一个 region_id（或使用商户的 region_id）
--   SELECT region_id INTO v_region_id
--   FROM public.merchants
--   WHERE id = v_merchant_id
--   LIMIT 1;
--   
--   IF v_region_id IS NULL THEN
--     RAISE EXCEPTION 'Merchant not found or has no region_id';
--   END IF;
--   
--   INSERT INTO public.venues (merchant_id, region_id, name, address, timezone, is_active)
--   VALUES (v_merchant_id, v_region_id, '测试场地', '测试地址', 'Asia/Shanghai', true)
--   RETURNING id INTO v_venue_id;
--   
--   RAISE NOTICE 'Venue created: %', v_venue_id;
-- END $$;

-- 步骤 3: 创建邀请码（通过 RPC，需要已登录的用户）
-- 在应用中使用登录用户调用：
-- SELECT public.create_invite_code(
--   'YOUR_MERCHANT_ID',
--   NULL,
--   'staff',
--   10,
--   30
-- );
