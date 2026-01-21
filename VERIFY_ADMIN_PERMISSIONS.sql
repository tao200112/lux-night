-- =========================================================
-- Verify Admin Permissions
-- 验证 Admin 权限设置
-- =========================================================

-- 1. 检查 profiles.is_admin 列是否存在
SELECT 
  'profiles.is_admin column exists' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'is_admin'
    ) THEN '✅ YES' 
    ELSE '❌ NO' 
  END as status;

-- 2. 检查 admin_users 表是否存在
SELECT 
  'admin_users table exists' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'admin_users'
    ) THEN '✅ YES' 
    ELSE '❌ NO' 
  END as status;

-- 3. 检查 Admin 用户是否存在
SELECT 
  'Admin user exists in auth.users' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM auth.users 
      WHERE email = 'admin123@admin.lux-night.com'
    ) THEN '✅ YES' 
    ELSE '❌ NO' 
  END as status;

-- 4. 检查 profiles.is_admin 设置
SELECT 
  'profiles.is_admin set to true' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE u.email = 'admin123@admin.lux-night.com'
        AND p.is_admin = true
    ) THEN '✅ YES' 
    ELSE '❌ NO (Run fix-admin-permissions-complete.sql)' 
  END as status;

-- 5. 检查 admin_users 表记录
SELECT 
  'admin_users table has record' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM public.admin_users au
      JOIN auth.users u ON u.id = au.user_id
      WHERE u.email = 'admin123@admin.lux-night.com'
        AND au.is_active = true
    ) THEN '✅ YES' 
    ELSE '❌ NO (Run fix-admin-permissions-complete.sql)' 
  END as status;

-- 6. 详细验证查询
SELECT 
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
