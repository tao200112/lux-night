-- =========================================================
-- Complete Admin Setup Script
-- 完整的 Admin 用户设置脚本（包含创建用户）
-- =========================================================
-- 说明：
-- 此脚本包含完整的 Admin 用户设置流程
-- =========================================================
-- ⚠️ 注意：
-- - 此脚本需要 service_role 权限（生产环境不推荐）
-- - 推荐方式：先在 Dashboard 创建用户，然后运行 setup-admin-user.sql
-- =========================================================

-- 步骤 1: 使用 Supabase Auth Admin API 创建用户
-- 注意：Supabase Auth 用户创建需要通过 API 或 Dashboard
-- 这里提供一个 SQL 函数（需要 service_role 权限）

-- 如果您的 Supabase 实例支持通过 SQL 创建用户，可以使用以下代码：
-- 否则，请先在 Dashboard 创建用户，然后运行 setup-admin-user.sql

-- 方法 1: 如果用户已通过 Dashboard 创建（推荐）
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
    RAISE NOTICE '═══════════════════════════════════════════════════════════';
    RAISE NOTICE '⚠️  Admin 用户不存在，请先创建用户：';
    RAISE NOTICE '';
    RAISE NOTICE '方式 1（推荐）：通过 Supabase Dashboard';
    RAISE NOTICE '1. 打开 Supabase Dashboard → Authentication → Users';
    RAISE NOTICE '2. 点击 "Add User" → "Create New User"';
    RAISE NOTICE '3. 填写信息：';
    RAISE NOTICE '   Email: admin123@admin.lux-night.com';
    RAISE NOTICE '   Password: a146129887';
    RAISE NOTICE '   Confirm Password: a146129887';
    RAISE NOTICE '4. 点击 "Create User"';
    RAISE NOTICE '5. 然后运行此脚本设置 is_admin = true';
    RAISE NOTICE '';
    RAISE NOTICE '方式 2：使用 Supabase Management API（需要 service_role key）';
    RAISE NOTICE 'POST https://your-project.supabase.co/auth/v1/admin/users';
    RAISE NOTICE 'Headers: { "apikey": "YOUR_SERVICE_ROLE_KEY", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY" }';
    RAISE NOTICE 'Body: { "email": "admin123@admin.lux-night.com", "password": "a146129887", "email_confirm": true }';
    RAISE NOTICE '═══════════════════════════════════════════════════════════';
    RETURN;
  END IF;
  
  -- 设置 profiles.is_admin = true
  INSERT INTO public.profiles (id, display_name, email, is_admin)
  VALUES (v_user_id, 'Admin', v_admin_email, true)
  ON CONFLICT (id) DO UPDATE
  SET
    is_admin = true,
    display_name = COALESCE(profiles.display_name, 'Admin'),
    email = COALESCE(profiles.email, v_admin_email),
    updated_at = NOW();
  
  -- 添加到 admin_users 表（如果存在）
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN
    INSERT INTO public.admin_users (user_id, is_active)
    VALUES (v_user_id, true)
    ON CONFLICT (user_id) DO UPDATE
    SET is_active = true,
        updated_at = NOW();
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Admin 用户设置完成！';
  RAISE NOTICE '   Email: %', v_admin_email;
  RAISE NOTICE '   User ID: %', v_user_id;
  RAISE NOTICE '   is_admin: true';
  RAISE NOTICE '';
  RAISE NOTICE '登录凭据：';
  RAISE NOTICE '  Email: admin123@admin.lux-night.com';
  RAISE NOTICE '  Password: a146129887';
  RAISE NOTICE '';
  RAISE NOTICE '访问地址：';
  RAISE NOTICE '  Admin Portal: http://localhost:3002/login';
  RAISE NOTICE '';
END $$;

-- 步骤 2: 验证设置
SELECT 
  'Verification Result' as status,
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
