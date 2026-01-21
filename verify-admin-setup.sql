-- =========================================================
-- 验证 Admin 用户和 is_admin 配置
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

-- 2. 检查 is_admin() 函数是否存在
SELECT 
  'is_admin() function exists' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.routines 
      WHERE routine_schema = 'public' 
        AND routine_name = 'is_admin'
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

-- 4. 检查 Admin 用户的 profiles.is_admin 设置
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

-- 5. 检查 is_admin() 函数逻辑（需要已登录用户）
-- 注意：这个测试需要以 admin 用户身份登录才能测试
