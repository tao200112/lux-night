-- =========================================================
-- Quick Insert Admin User to admin_users table
-- 快速插入 Admin 用户到 admin_users 表
-- =========================================================

-- 插入 admin123@admin.lux-night.com 到 admin_users 表（注意：admin_users 表没有 updated_at 列）
INSERT INTO public.admin_users (user_id, is_active)
SELECT id, true
FROM auth.users
WHERE email = 'admin123@admin.lux-night.com'
ON CONFLICT (user_id) DO UPDATE
SET 
  is_active = true;

-- 验证
SELECT 
  au.user_id,
  u.email,
  au.is_active,
  au.created_at
FROM public.admin_users au
JOIN auth.users u ON u.id = au.user_id
WHERE u.email = 'admin123@admin.lux-night.com';
