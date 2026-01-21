-- =========================================================
-- Setup Admin User Script
-- 设置 Admin 用户的完整脚本
-- =========================================================
-- 说明：
-- - 创建 admin 用户：admin123@admin.lux-night.com
-- - 密码：a146129887
-- - 设置 profiles.is_admin = true
-- - 添加到 admin_users 表（如果存在）
-- =========================================================
-- 使用方法：
-- 1. 在 Supabase Dashboard → SQL Editor 中运行此脚本
-- 2. 或使用 Supabase CLI: supabase db execute --file supabase/scripts/setup-admin-user.sql
-- =========================================================

-- 步骤 1: 创建 Admin 用户（通过 Supabase Auth）
-- 注意：Supabase Auth 用户需要通过 Dashboard 或 API 创建
-- 这里提供一个 SQL 函数来设置密码（需要 service_role 权限）

-- 如果用户已通过 Dashboard 创建，则更新 profiles 表
DO $$
DECLARE
  v_admin_email TEXT := 'admin123@admin.lux-night.com';
  v_user_id UUID;
  v_user_exists BOOLEAN;
BEGIN
  -- 检查用户是否已存在
  SELECT EXISTS(
    SELECT 1 FROM auth.users WHERE email = v_admin_email
  ) INTO v_user_exists;
  
  IF v_user_exists THEN
    -- 用户已存在，获取用户 ID
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = v_admin_email
    LIMIT 1;
    
    RAISE NOTICE 'Admin user already exists: % (ID: %)', v_admin_email, v_user_id;
  ELSE
    RAISE NOTICE 'Admin user not found: %', v_admin_email;
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════';
    RAISE NOTICE '请先在 Supabase Dashboard 中创建用户：';
    RAISE NOTICE '';
    RAISE NOTICE '1. 打开 Supabase Dashboard → Authentication → Users';
    RAISE NOTICE '2. 点击 "Add User" → "Create New User"';
    RAISE NOTICE '3. 填写信息：';
    RAISE NOTICE '   Email: admin123@admin.lux-night.com';
    RAISE NOTICE '   Password: a146129887';
    RAISE NOTICE '   Confirm Password: a146129887';
    RAISE NOTICE '4. 点击 "Create User"';
    RAISE NOTICE '5. 然后重新运行此脚本设置 is_admin = true';
    RAISE NOTICE '═══════════════════════════════════════════════════════════';
    RETURN;
  END IF;
  
  -- 步骤 2: 确保 profiles 表有 is_admin 列（如果不存在则添加）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
    
    CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin) WHERE is_admin = true;
  END IF;
  
  -- 步骤 3: 确保 profiles 记录存在并设置为 admin（profiles 表没有 email 列）
  INSERT INTO public.profiles (id, display_name, is_admin)
  VALUES (
    v_user_id,
    'Admin',
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET
    is_admin = true,
    display_name = COALESCE(profiles.display_name, 'Admin'),
    updated_at = NOW();
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Admin user profile created/updated successfully!';
  RAISE NOTICE '   Email: %', v_admin_email;
  RAISE NOTICE '   User ID: %', v_user_id;
  RAISE NOTICE '   is_admin: true';
  
  -- 步骤 4: 添加到 admin_users 表（如果表存在，注意：admin_users 表没有 updated_at 列）
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN
    INSERT INTO public.admin_users (user_id, is_active)
    VALUES (v_user_id, true)
    ON CONFLICT (user_id) DO UPDATE
    SET is_active = true;
    
    RAISE NOTICE '   Added to admin_users table';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Admin 用户设置完成！';
  RAISE NOTICE '';
  RAISE NOTICE '登录凭据：';
  RAISE NOTICE '  Email: admin123@admin.lux-night.com';
  RAISE NOTICE '  Password: a146129887';
  RAISE NOTICE '';
  RAISE NOTICE '访问地址：';
  RAISE NOTICE '  Admin Portal: http://localhost:3002/login';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;

-- 步骤 4: 验证设置
SELECT 
  u.id as user_id,
  u.email,
  p.display_name,
  p.is_admin,
  CASE 
    WHEN EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = u.id) 
    THEN 'Yes' 
    ELSE 'No' 
  END as in_admin_users_table
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'admin123@admin.lux-night.com';
