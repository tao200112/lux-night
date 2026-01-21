-- =========================================================
-- Simple Admin User Setup Script
-- 简单的 Admin 用户设置脚本
-- =========================================================
-- 使用方法：
-- 1. 先在 Supabase Dashboard → Authentication → Users 中创建用户
--    Email: admin123@admin.lux-night.com
--    Password: a146129887
-- 2. 然后在 Supabase Dashboard → SQL Editor 中运行此脚本
-- =========================================================

-- 设置 Admin 用户权限
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
    RAISE NOTICE '⚠️  Admin 用户不存在！';
    RAISE NOTICE '请先在 Supabase Dashboard → Authentication → Users 中创建用户：';
    RAISE NOTICE '  Email: admin123@admin.lux-night.com';
    RAISE NOTICE '  Password: a146129887';
    RETURN;
  END IF;
  
  -- 步骤 1: 确保 profiles 表有 is_admin 列（如果不存在则添加）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
    
    CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin) WHERE is_admin = true;
    
    RAISE NOTICE '已添加 is_admin 列到 profiles 表';
  END IF;
  
  -- 步骤 2: 设置 profiles.is_admin = true（profiles 表没有 email 列）
  INSERT INTO public.profiles (id, display_name, is_admin)
  VALUES (v_user_id, 'Admin', true)
  ON CONFLICT (id) DO UPDATE
  SET
    is_admin = true,
    display_name = COALESCE(profiles.display_name, 'Admin'),
    updated_at = NOW();
  
  -- 添加到 admin_users 表（如果存在，注意：admin_users 表没有 updated_at 列）
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN
    INSERT INTO public.admin_users (user_id, is_active)
    VALUES (v_user_id, true)
    ON CONFLICT (user_id) DO UPDATE
    SET is_active = true;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Admin 用户设置完成！';
  RAISE NOTICE '   Email: %', v_admin_email;
  RAISE NOTICE '   User ID: %', v_user_id;
  RAISE NOTICE '   is_admin: true';
  RAISE NOTICE '';
END $$;

-- 验证设置
SELECT 
  u.id as user_id,
  u.email,
  p.display_name,
  COALESCE(p.is_admin, false) as is_admin,
  CASE 
    WHEN EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = u.id) 
    THEN 'Yes' 
    ELSE 'No' 
  END as in_admin_users_table
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'admin123@admin.lux-night.com';
