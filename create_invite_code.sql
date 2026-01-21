-- =========================================================
-- 创建商家邀请码 SQL
-- =========================================================
-- 
-- 使用说明：
-- 1. 先查询你的商户和用户 ID：
--    SELECT id, name FROM public.merchants;
--    SELECT id, email FROM auth.users;
--
-- 2. 将以下示例中的 UUID 替换为实际的 ID
-- 3. 根据需求修改邀请码参数（token, role, max_uses, expires_at）
--

-- =========================================================
-- 第一步：查询商户和用户 ID（请先执行这部分）
-- =========================================================

-- 查询所有商户
SELECT 
  id AS merchant_id,
  name AS merchant_name,
  status,
  created_at
FROM public.merchants
ORDER BY created_at DESC;

-- 查询所有场地（如果需要为特定场地创建邀请码）
SELECT 
  v.id AS venue_id,
  v.name AS venue_name,
  m.name AS merchant_name,
  v.is_active,
  v.created_at
FROM public.venues v
JOIN public.merchants m ON m.id = v.merchant_id
ORDER BY v.created_at DESC;

-- 查询当前用户 ID（如果使用 Supabase Dashboard SQL Editor）
SELECT auth.uid() AS current_user_id;

-- =========================================================
-- 第二步：创建邀请码（根据实际情况修改以下参数）
-- =========================================================
-- 
-- ⚠️  警告：以下示例 SQL 语句已被注释，请不要直接执行！
-- 请复制这些示例，修改 UUID 和参数后再执行。
-- 
-- 推荐使用 RPC 函数 create_invite_code（见文件末尾）
--

-- 示例 1: 为商户创建 STAFF 角色的邀请码（适用于所有场地）
-- INSERT INTO public.invites (
--   token,
--   merchant_id,
--   venue_id,
--   intended_role,
--   max_uses,
--   used_count,
--   expires_at,
--   disabled,
--   is_active,
--   created_by
-- ) VALUES (
--   'STAFF-2024-001',                    -- token: 邀请码（必须是唯一的，建议使用大写字母和数字）
--   'YOUR_MERCHANT_ID_HERE',             -- merchant_id: 替换为实际的商户 UUID
--   NULL,                                 -- venue_id: NULL 表示适用于该商户下所有场地
--   'staff',                              -- intended_role: 'staff' | 'manager' | 'owner' | 'admin' (小写)
--   10,                                   -- max_uses: 最大使用次数（建议 >= 1）
--   0,                                    -- used_count: 已使用次数（初始为 0）
--   NOW() + INTERVAL '30 days',          -- expires_at: 过期时间（30天后，NULL 表示永不过期）
--   false,                                -- disabled: 是否禁用
--   true,                                 -- is_active: 是否激活（true 表示激活）
--   auth.uid()                            -- created_by: 创建者用户 ID（使用 auth.uid() 获取当前用户）
-- );

-- 示例 2: 为特定场地创建 MANAGER 角色的邀请码
-- INSERT INTO public.invites (
--   token,
--   merchant_id,
--   venue_id,
--   intended_role,
--   max_uses,
--   used_count,
--   expires_at,
--   disabled,
--   is_active,
--   created_by
-- ) VALUES (
--   'MGR-VENUE-001',
--   'YOUR_MERCHANT_ID_HERE',              -- merchant_id: 替换为实际的商户 UUID
--   'YOUR_VENUE_ID_HERE',                 -- venue_id: 特定场地的 UUID（替换为实际值）
--   'manager',                            -- intended_role: 使用小写
--   5,                                    -- 最多使用 5 次
--   0,
--   NOW() + INTERVAL '90 days',          -- 90天后过期
--   false,
--   true,
--   auth.uid()
-- );

-- 示例 3: 创建 OWNER 角色的永久邀请码（不过期，无限使用）
-- INSERT INTO public.invites (
--   token,
--   merchant_id,
--   venue_id,
--   intended_role,
--   max_uses,
--   used_count,
--   expires_at,
--   disabled,
--   is_active,
--   created_by
-- ) VALUES (
--   'OWNER-PERM-001',
--   'YOUR_MERCHANT_ID_HERE',              -- merchant_id: 替换为实际的商户 UUID
--   NULL,                                 -- NULL 表示所有场地
--   'owner',                              -- intended_role: 使用小写
--   999999,                               -- 非常大的数字表示无限使用
--   0,
--   NULL,                                 -- NULL 表示永不过期
--   false,
--   true,
--   auth.uid()
-- );

-- =========================================================
-- 第三步：验证创建的邀请码
-- =========================================================

-- 查询所有邀请码（包含商户和场地信息）
SELECT 
  i.id,
  i.token,
  m.name AS merchant_name,
  v.name AS venue_name,
  i.intended_role,
  i.max_uses,
  i.used_count,
  (i.max_uses - i.used_count) AS remaining_uses,
  i.expires_at,
  CASE 
    WHEN i.expires_at IS NULL THEN '永久有效'
    WHEN i.expires_at < NOW() THEN '已过期'
    ELSE to_char(i.expires_at, 'YYYY-MM-DD HH24:MI:SS') || ' 过期'
  END AS expires_info,
  CASE 
    WHEN i.disabled THEN '已禁用'
    WHEN NOT i.is_active THEN '未激活'
    WHEN i.expires_at IS NOT NULL AND i.expires_at < NOW() THEN '已过期'
    WHEN i.used_count >= i.max_uses THEN '已用完'
    ELSE '有效'
  END AS status,
  u.email AS created_by_email,
  i.created_at
FROM public.invites i
LEFT JOIN public.merchants m ON i.merchant_id = m.id
LEFT JOIN public.venues v ON i.venue_id = v.id
LEFT JOIN auth.users u ON i.created_by = u.id
ORDER BY i.created_at DESC;

-- 查询特定商户的所有邀请码
-- SELECT 
--   i.token,
--   COALESCE(v.name, '所有场地') AS venue_name,
--   i.intended_role,
--   i.max_uses,
--   i.used_count,
--   (i.max_uses - i.used_count) AS remaining_uses,
--   i.expires_at,
--   CASE 
--     WHEN i.expires_at IS NULL THEN '永久有效'
--     WHEN i.expires_at < NOW() THEN '已过期'
--     ELSE to_char(i.expires_at, 'YYYY-MM-DD HH24:MI:SS') || ' 过期'
--   END AS expires_info,
--   CASE 
--     WHEN i.disabled THEN '已禁用'
--     WHEN NOT i.is_active THEN '未激活'
--     WHEN i.expires_at IS NOT NULL AND i.expires_at < NOW() THEN '已过期'
--     WHEN i.used_count >= i.max_uses THEN '已用完'
--     ELSE '✅ 有效'
--   END AS status
-- FROM public.invites i
-- LEFT JOIN public.venues v ON i.venue_id = v.id
-- WHERE i.merchant_id = 'YOUR_MERCHANT_ID_HERE'  -- 替换为实际的商户 UUID
-- ORDER BY i.created_at DESC;

-- 查询有效的邀请码（可用于兑换）
SELECT 
  i.token,
  m.name AS merchant_name,
  COALESCE(v.name, '所有场地') AS venue_name,
  i.intended_role,
  (i.max_uses - i.used_count) AS remaining_uses
FROM public.invites i
JOIN public.merchants m ON i.merchant_id = m.id
LEFT JOIN public.venues v ON i.venue_id = v.id
WHERE i.is_active = true
  AND i.disabled = false
  AND (i.expires_at IS NULL OR i.expires_at > NOW())
  AND i.used_count < i.max_uses
ORDER BY i.created_at DESC;

-- =========================================================
-- 便捷函数：快速创建邀请码（可选）
-- =========================================================
-- 如果经常需要创建邀请码，可以使用以下函数简化操作

CREATE OR REPLACE FUNCTION create_merchant_invite(
  p_token TEXT,
  p_merchant_id UUID,
  p_venue_id UUID DEFAULT NULL,
  p_role TEXT DEFAULT 'STAFF',
  p_max_uses INT DEFAULT 10,
  p_expires_days INT DEFAULT 30
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite_id UUID;
  v_user_id UUID;
BEGIN
  -- 获取当前用户 ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;
  
  -- 检查用户是否有权限创建邀请码（OWNER 或 MANAGER）
  IF NOT EXISTS (
    SELECT 1 FROM public.merchant_members mm
    WHERE mm.user_id = v_user_id
      AND mm.merchant_id = p_merchant_id
      AND mm.role IN ('OWNER', 'MANAGER', 'admin')
      AND mm.is_active = true
  ) THEN
    RAISE EXCEPTION 'User does not have permission to create invites for this merchant';
  END IF;
  
  -- 验证 role
  IF p_role NOT IN ('STAFF', 'MANAGER', 'OWNER', 'admin') THEN
    RAISE EXCEPTION 'Invalid role. Must be one of: STAFF, MANAGER, OWNER, admin';
  END IF;
  
  -- 验证 max_uses
  IF p_max_uses < 1 THEN
    RAISE EXCEPTION 'max_uses must be >= 1';
  END IF;
  
  -- 检查 token 是否已存在
  IF EXISTS (SELECT 1 FROM public.invites WHERE token = UPPER(p_token)) THEN
    RAISE EXCEPTION 'Invite token already exists: %', UPPER(p_token);
  END IF;
  
  -- 创建邀请码
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
    UPPER(p_token),
    p_merchant_id,
    p_venue_id,
    p_role,
    p_max_uses,
    0,
    CASE 
      WHEN p_expires_days IS NULL THEN NULL
      ELSE NOW() + (p_expires_days || ' days')::INTERVAL
    END,
    false,
    true,
    v_user_id
  )
  RETURNING id INTO v_invite_id;
  
  RETURN v_invite_id;
END;
$$;

-- 授权函数执行权限
REVOKE ALL ON FUNCTION create_merchant_invite(TEXT, UUID, UUID, TEXT, INT, INT) FROM public;
GRANT EXECUTE ON FUNCTION create_merchant_invite(TEXT, UUID, UUID, TEXT, INT, INT) TO authenticated;

-- =========================================================
-- 使用函数创建邀请码（推荐方式）
-- =========================================================

-- 示例：创建一个 STAFF 邀请码
-- SELECT create_merchant_invite(
--   'STAFF-2024-002',                    -- token
--   'YOUR_MERCHANT_ID_HERE',             -- merchant_id
--   NULL,                                 -- venue_id (NULL 表示所有场地)
--   'STAFF',                              -- role
--   10,                                   -- max_uses
--   30                                    -- expires_days (NULL 表示永不过期)
-- );

-- 示例：创建一个 MANAGER 邀请码（特定场地，90天有效）
-- SELECT create_merchant_invite(
--   'MGR-VENUE-002',                     -- token（必须是唯一的）
--   'YOUR_MERCHANT_ID_HERE',             -- merchant_id（替换为实际的商户 UUID）
--   'YOUR_VENUE_ID_HERE',                -- venue_id（替换为实际的场地 UUID）
--   'manager',                            -- role（使用小写）
--   5,
--   90
-- );

-- 示例：创建一个永久 OWNER 邀请码（不过期）
-- SELECT create_merchant_invite(
--   'OWNER-PERM-002',                    -- token（必须是唯一的）
--   'YOUR_MERCHANT_ID_HERE',             -- merchant_id（替换为实际的商户 UUID）
--   NULL,
--   'owner',                              -- role（使用小写）
--   999999,
--   NULL                                  -- NULL 表示永不过期
-- );

-- =========================================================
-- 管理邀请码（禁用、删除等）
-- =========================================================
-- 
-- ⚠️  警告：以下 SQL 语句已被注释，请修改参数后再执行！
-- 

-- 禁用邀请码（不删除，只是禁用）
-- UPDATE public.invites
-- SET disabled = true, updated_at = NOW()
-- WHERE token = 'STAFF-2024-001';  -- 替换为实际的 token

-- 启用邀请码
-- UPDATE public.invites
-- SET disabled = false, updated_at = NOW()
-- WHERE token = 'STAFF-2024-001';  -- 替换为实际的 token

-- 延长邀请码有效期（例如再延长30天）
-- UPDATE public.invites
-- SET expires_at = expires_at + INTERVAL '30 days', updated_at = NOW()
-- WHERE token = 'STAFF-2024-001';  -- 替换为实际的 token

-- 删除邀请码（谨慎使用）
-- DELETE FROM public.invites
-- WHERE token = 'STAFF-2024-001';  -- 替换为实际的 token
