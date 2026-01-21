-- =========================================================
-- 018 Auto Create Profiles
-- 自动创建 profiles：当 auth.users 插入时自动创建对应的 profile
-- =========================================================
-- 说明：
-- - 使用 SECURITY DEFINER trigger 绕过 RLS
-- - 确保首次登录时自动创建 profile，避免前端 RLS 错误
-- =========================================================

-- 创建 trigger 函数（SECURITY DEFINER，绕过 RLS）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name TEXT;
BEGIN
  -- 从 raw_user_meta_data 获取 display_name，或从 email 提取用户名
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    CASE 
      WHEN NEW.email IS NOT NULL THEN split_part(NEW.email, '@', 1)
      ELSE NULL
    END
  );
  
  INSERT INTO public.profiles (id, display_name, created_at, updated_at)
  VALUES (
    NEW.id,
    v_display_name,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- 删除旧的 trigger（如果存在）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 创建新的 trigger
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- 为已存在的用户创建缺失的 profiles（一次性修复）
INSERT INTO public.profiles (id, display_name, created_at, updated_at)
SELECT 
  u.id,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1), NULL) as display_name,
  u.created_at,
  NOW() as updated_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
