-- =========================================================
-- Complete Admin Permissions Fix
-- 完整的 Admin 权限修复脚本
-- =========================================================
-- 说明：
-- 1. 确保 profiles.is_admin 列存在
-- 2. 确保 admin_users 表有记录
-- 3. 设置 Admin 用户 (admin123@admin.lux-night.com) 的权限
-- =========================================================

-- 步骤 1: 确保 profiles.is_admin 列存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
    
    CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin) WHERE is_admin = true;
    
    RAISE NOTICE '✅ Added is_admin column to profiles table';
  ELSE
    RAISE NOTICE '✅ profiles.is_admin column already exists';
  END IF;
END $$;

-- 步骤 2: 查找或设置 Admin 用户
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
    RAISE NOTICE '请先在 Supabase Dashboard → Authentication → Users 中创建用户';
    RETURN;
  END IF;
  
  RAISE NOTICE '✅ Found admin user: % (ID: %)', v_admin_email, v_user_id;
  
  -- 步骤 3: 设置 profiles.is_admin = true
  INSERT INTO public.profiles (id, display_name, is_admin)
  VALUES (v_user_id, 'Admin', true)
  ON CONFLICT (id) DO UPDATE
  SET
    is_admin = true,
    display_name = COALESCE(profiles.display_name, 'Admin'),
    updated_at = NOW();
  
  RAISE NOTICE '✅ Set profiles.is_admin = true';
  
  -- 步骤 4: 确保 admin_users 表存在且有记录
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN
    INSERT INTO public.admin_users (user_id, is_active)
    VALUES (v_user_id, true)
    ON CONFLICT (user_id) DO UPDATE
    SET is_active = true;
    
    RAISE NOTICE '✅ Added/updated record in admin_users table';
  ELSE
    RAISE NOTICE '⚠️  admin_users table does not exist (this is OK, profiles.is_admin will be used)';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Admin 用户权限设置完成！';
  RAISE NOTICE '   Email: %', v_admin_email;
  RAISE NOTICE '   User ID: %', v_user_id;
  RAISE NOTICE '   profiles.is_admin: true';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;

-- 步骤 5: 验证设置
SELECT 
  'Verification' as check_type,
  u.id as user_id,
  u.email,
  p.display_name,
  COALESCE(p.is_admin, false) as profiles_is_admin,
  CASE 
    WHEN EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = u.id) 
    THEN true
    ELSE false
  END as in_admin_users_table,
  au.is_active as admin_users_is_active
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.admin_users au ON au.user_id = u.id
WHERE u.email = 'admin123@admin.lux-night.com';

-- 步骤 6: 测试 is_admin() 函数
-- 注意：这个测试需要以 admin 用户身份登录
SELECT 
  'Function Test' as check_type,
  public.is_admin() as is_admin_result;
