-- =========================================================
-- Insert Admin User into admin_users table
-- 插入 Admin 用户到 admin_users 表
-- =========================================================
-- 说明：
-- - profiles.is_admin = true 已设置
-- - 但 admin_users 表没有记录
-- - 这个脚本会从 profiles 表中找出所有 is_admin = true 的用户
-- - 然后插入到 admin_users 表中
-- =========================================================

-- 方法 1: 为特定用户（admin123@admin.lux-night.com）插入记录
DO $$
DECLARE
  v_admin_email TEXT := 'admin123@admin.lux-night.com';
  v_user_id UUID;
BEGIN
  -- 查找用户
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_admin_email
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE '⚠️  Admin user not found: %', v_admin_email;
    RAISE NOTICE '请先创建用户：admin123@admin.lux-night.com';
    RETURN;
  END IF;
  
  -- 插入或更新 admin_users 表（注意：admin_users 表没有 updated_at 列）
  INSERT INTO public.admin_users (user_id, is_active)
  VALUES (v_user_id, true)
  ON CONFLICT (user_id) DO UPDATE
  SET 
    is_active = true;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ 已添加/更新 admin_users 记录';
  RAISE NOTICE '   User ID: %', v_user_id;
  RAISE NOTICE '   Email: %', v_admin_email;
  RAISE NOTICE '   is_active: true';
  RAISE NOTICE '';
END $$;

-- 方法 2: 为所有 profiles.is_admin = true 的用户同步到 admin_users 表
DO $$
DECLARE
  v_count INT := 0;
BEGIN
  -- 插入所有 is_admin = true 的用户到 admin_users 表
  INSERT INTO public.admin_users (user_id, is_active)
  SELECT id, true
  FROM public.profiles
  WHERE is_admin = true
  ON CONFLICT (user_id) DO UPDATE
  SET 
    is_active = true;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ 已同步 % 个 admin 用户到 admin_users 表', v_count;
  RAISE NOTICE '';
END $$;

-- 验证：检查 admin_users 表记录
SELECT 
  au.user_id,
  u.email,
  p.display_name,
  p.is_admin as profiles_is_admin,
  au.is_active as admin_users_is_active,
  au.created_at
FROM public.admin_users au
JOIN auth.users u ON u.id = au.user_id
LEFT JOIN public.profiles p ON p.id = u.id
ORDER BY au.created_at DESC;
