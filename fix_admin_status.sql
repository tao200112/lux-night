-- =========================================================
-- 快速修复 Admin 状态
-- 为指定用户创建 admin_users 记录或设置 profiles.is_admin
-- =========================================================
-- 使用方法：
-- 1. 替换 'admin123@admin.lux-night.com' 为你的管理员邮箱
-- 2. 在 Supabase Dashboard → SQL Editor 中执行
-- =========================================================

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
    RAISE EXCEPTION 'User not found: %. Please create the user first.', v_admin_email;
  END IF;
  
  -- 方法 1: 创建 admin_users 记录
  INSERT INTO public.admin_users (user_id, is_active)
  VALUES (v_user_id, true)
  ON CONFLICT (user_id) DO UPDATE SET is_active = true;
  
  RAISE NOTICE 'Created admin_users record for user: % (ID: %)', v_admin_email, v_user_id;
  
  -- 方法 2: 设置 profiles.is_admin = true
  UPDATE public.profiles
  SET is_admin = true
  WHERE id = v_user_id;
  
  RAISE NOTICE 'Set profiles.is_admin = true for user: % (ID: %)', v_admin_email, v_user_id;
  
  -- 验证
  SELECT 
    (SELECT is_admin FROM public.profiles WHERE id = v_user_id) as profiles_is_admin,
    (SELECT is_active FROM public.admin_users WHERE user_id = v_user_id) as admin_users_active
  INTO v_user_id; -- 复用变量（仅用于验证）
  
  RAISE NOTICE 'Admin status verified: profiles.is_admin = true, admin_users.is_active = true';
END $$;

-- 查询所有管理员用户
SELECT 
  u.id,
  u.email,
  p.is_admin as profiles_is_admin,
  au.is_active as admin_users_active,
  CASE 
    WHEN p.is_admin = true OR au.is_active = true THEN 'YES'
    ELSE 'NO'
  END as is_admin
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
LEFT JOIN public.admin_users au ON u.id = au.user_id
WHERE p.is_admin = true OR au.is_active = true
ORDER BY u.created_at DESC;
