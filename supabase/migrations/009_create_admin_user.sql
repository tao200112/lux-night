-- =========================================================
-- 009 CREATE ADMIN USER
-- 创建 Admin 用户（邮箱密码登录）
-- =========================================================
-- 说明：
-- - 创建 admin 用户：admin123@admin.lux-night.com
-- - 密码：a146129887
-- - 设置 profiles.is_admin = true
-- =========================================================

-- 使用 Supabase Auth 创建用户（需要在 Supabase Dashboard 中手动创建，或使用 service_role key）
-- 这里提供一个 SQL 函数来创建用户（需要 service_role 权限）

-- 注意：Supabase Auth 用户的创建通常需要通过 Supabase Dashboard 或 API
-- 这个迁移文件主要用于记录和设置 profiles.is_admin 标志

-- 步骤 1: 确保 profiles 表有 is_admin 列（如果不存在则添加）
-- 注意：这个迁移可能在 010_add_is_admin_to_profiles.sql 之前执行
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
    
    RAISE NOTICE 'Added is_admin column to profiles table';
  END IF;
END $$;

-- 步骤 2: 如果用户已存在（通过 Dashboard 创建），则更新 profiles 表
DO $$
DECLARE
  v_admin_email TEXT := 'admin123@admin.lux-night.com';
  v_user_id UUID;
BEGIN
  -- 查找用户（假设用户已通过 Dashboard 创建）
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_admin_email
  LIMIT 1;
  
  IF v_user_id IS NOT NULL THEN
    -- 确保 profiles 记录存在（profiles 表没有 email 列）
    INSERT INTO public.profiles (id, display_name, is_admin)
    VALUES (v_user_id, 'Admin', true)
    ON CONFLICT (id) DO UPDATE
    SET is_admin = true,
        display_name = COALESCE(profiles.display_name, 'Admin');
    
    RAISE NOTICE 'Admin user profile updated: % (ID: %)', v_admin_email, v_user_id;
  ELSE
    RAISE NOTICE 'Admin user not found: %. Please create the user in Supabase Dashboard first, then run this migration again.', v_admin_email;
  END IF;
END $$;

-- 注释
COMMENT ON TABLE public.profiles IS 'User profiles table. Set is_admin = true for admin users.';
