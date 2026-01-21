-- =========================================================
-- Check User Login Status
-- 检查用户登录状态（诊断登录失败问题）
-- =========================================================

-- 1. 检查用户是否存在和状态
SELECT 
  'User Status' as check_type,
  id,
  email,
  encrypted_password IS NOT NULL as has_password,
  email_confirmed_at IS NOT NULL as email_confirmed,
  confirmed_at IS NOT NULL as is_confirmed,
  banned_until,
  created_at,
  last_sign_in_at,
  CASE 
    WHEN encrypted_password IS NULL THEN '❌ No password set'
    WHEN email_confirmed_at IS NULL AND confirmed_at IS NULL THEN '⚠️ Email not confirmed'
    WHEN banned_until IS NOT NULL THEN '❌ User is banned'
    ELSE '✅ User looks OK'
  END as status_message
FROM auth.users
WHERE email = 'admin123@admin.lux-night.com';

-- 2. 检查 profiles 权限
SELECT 
  'Profile Permissions' as check_type,
  p.id as user_id,
  p.display_name,
  COALESCE(p.is_admin, false) as is_admin,
  CASE 
    WHEN p.id IS NULL THEN '❌ No profile found'
    WHEN COALESCE(p.is_admin, false) = false THEN '⚠️ is_admin = false'
    ELSE '✅ is_admin = true'
  END as status_message
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'admin123@admin.lux-night.com';

-- 3. 检查 admin_users 表记录
SELECT 
  'Admin Users Table' as check_type,
  au.user_id,
  au.is_active,
  au.created_at,
  CASE 
    WHEN au.user_id IS NULL THEN '⚠️ Not in admin_users table'
    WHEN au.is_active = false THEN '⚠️ is_active = false'
    ELSE '✅ In admin_users table and active'
  END as status_message
FROM auth.users u
LEFT JOIN public.admin_users au ON au.user_id = u.id
WHERE u.email = 'admin123@admin.lux-night.com';

-- 4. 综合检查结果
SELECT 
  'Summary' as check_type,
  u.id as user_id,
  u.email,
  u.encrypted_password IS NOT NULL as has_password,
  u.email_confirmed_at IS NOT NULL as email_confirmed,
  COALESCE(p.is_admin, false) as profiles_is_admin,
  au.is_active as admin_users_is_active,
  CASE 
    WHEN u.id IS NULL THEN '❌ User does not exist'
    WHEN u.encrypted_password IS NULL THEN '❌ No password set - need to reset password'
    WHEN u.email_confirmed_at IS NULL AND u.confirmed_at IS NULL THEN '⚠️ Email not confirmed - may need to confirm'
    WHEN u.banned_until IS NOT NULL THEN '❌ User is banned'
    WHEN COALESCE(p.is_admin, false) = false AND (au.is_active IS NULL OR au.is_active = false) THEN '⚠️ Admin permissions not set'
    ELSE '✅ User should be able to login'
  END as overall_status
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.admin_users au ON au.user_id = u.id
WHERE u.email = 'admin123@admin.lux-night.com';
