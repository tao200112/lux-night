-- =========================================================
-- Create Admin User Script
-- 创建 Admin 用户的完整脚本
-- =========================================================
-- 使用方法：
-- 1. 在 Supabase Dashboard 中手动创建用户（推荐）
-- 2. 或使用 Supabase Management API（需要 service_role key）
-- 3. 运行此脚本设置 profiles.is_admin = true
-- =========================================================

-- 方法 1: 如果用户已通过 Dashboard 创建，直接更新 profiles
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
  
  IF v_user_id IS NOT NULL THEN
    -- 确保 profiles 记录存在并设置为 admin
    INSERT INTO public.profiles (id, display_name, email, is_admin)
    VALUES (v_user_id, 'Admin', v_admin_email, true)
    ON CONFLICT (id) DO UPDATE
    SET is_admin = true,
        display_name = COALESCE(profiles.display_name, 'Admin'),
        email = COALESCE(profiles.email, v_admin_email),
        updated_at = NOW();
    
    RAISE NOTICE '✅ Admin user profile created/updated successfully!';
    RAISE NOTICE '   Email: %', v_admin_email;
    RAISE NOTICE '   User ID: %', v_user_id;
    RAISE NOTICE '   is_admin: true';
  ELSE
    RAISE NOTICE '⚠️  Admin user not found: %', v_admin_email;
    RAISE NOTICE '   Please create the user in Supabase Dashboard first:';
    RAISE NOTICE '   1. Go to Authentication > Users';
    RAISE NOTICE '   2. Click "Add User" > "Create New User"';
    RAISE NOTICE '   3. Email: admin123@admin.lux-night.com';
    RAISE NOTICE '   4. Password: a146129887';
    RAISE NOTICE '   5. Confirm password: a146129887';
    RAISE NOTICE '   6. Click "Create User"';
    RAISE NOTICE '   7. Then run this script again to set is_admin = true';
  END IF;
END $$;
