-- =========================================================
-- Fix Helper Functions: 统一角色为小写
-- =========================================================

-- 修复 can_manage_merchant 函数：使用小写角色
CREATE OR REPLACE FUNCTION public.can_manage_merchant(p_merchant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.has_merchant_role(p_merchant_id, ARRAY['owner','manager']);
$$;

-- 修复 has_merchant_role 函数：确保使用小写比较
-- （这个函数应该已经支持小写，但确保兼容性）
-- 注意：has_merchant_role 函数本身已经支持传入任意角色数组，所以只需要确保传入的是小写即可
