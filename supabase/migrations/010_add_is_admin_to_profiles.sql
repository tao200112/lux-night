-- =========================================================
-- 010 ADD IS_ADMIN TO PROFILES
-- 向 profiles 表添加 is_admin 列
-- =========================================================
-- 说明：
-- - 添加 is_admin 列到 profiles 表
-- - 更新 is_admin() 函数同时检查 profiles.is_admin 和 admin_users 表
-- =========================================================

-- 步骤 1: 添加 is_admin 列到 profiles 表
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin) WHERE is_admin = true;

COMMENT ON COLUMN public.profiles.is_admin IS 'Whether the user is an admin. Can be set directly or via admin_users table.';

-- 步骤 2: 更新 is_admin() 函数，同时检查 profiles.is_admin 和 admin_users 表
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id UUID;
  v_profile_is_admin BOOLEAN;
  v_admin_user_exists BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- 方法 1: 检查 profiles.is_admin
  SELECT COALESCE(is_admin, false) INTO v_profile_is_admin
  FROM public.profiles
  WHERE id = v_user_id;
  
  IF v_profile_is_admin THEN
    RETURN true;
  END IF;
  
  -- 方法 2: 检查 admin_users 表（向后兼容）
  SELECT EXISTS(
    SELECT 1 
    FROM public.admin_users 
    WHERE user_id = v_user_id 
      AND is_active = true
  ) INTO v_admin_user_exists;
  
  RETURN COALESCE(v_admin_user_exists, false);
END;
$$;

COMMENT ON FUNCTION public.is_admin() IS 'Check if current user is an admin. Checks both profiles.is_admin and admin_users table.';
