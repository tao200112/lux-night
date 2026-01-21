-- =========================================================
-- Fix RLS Infinite Recursion
-- 修复 RLS 无限递归问题
-- =========================================================
-- 
-- 问题：merchant_members 的 RLS 策略中存在循环依赖
-- 解决：使用 SECURITY DEFINER 函数来检查权限，避免策略中直接查询 merchant_members
--

-- =========================================================
-- 1. 创建辅助函数：检查用户是否有商户权限（避免循环）
-- =========================================================

-- 函数：检查用户是否有指定商户的角色（用于 RLS，避免循环）
CREATE OR REPLACE FUNCTION public.has_merchant_membership_check(
  p_user_id UUID,
  p_merchant_id UUID,
  p_roles TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.merchant_members mm
    WHERE mm.user_id = p_user_id
      AND mm.merchant_id = p_merchant_id
      AND mm.is_active = true
      AND (p_roles IS NULL OR mm.role = ANY(p_roles))
  );
$$;

-- 函数：检查当前用户是否有指定商户的角色（用于 RLS）
CREATE OR REPLACE FUNCTION public.has_current_user_merchant_role(
  p_merchant_id UUID,
  p_roles TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_merchant_membership_check(
    auth.uid(),
    p_merchant_id,
    p_roles
  );
$$;

-- 函数：获取 member 的 merchant_id（用于 RLS，避免循环）
CREATE OR REPLACE FUNCTION public.get_member_merchant_id(p_member_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT merchant_id FROM public.merchant_members WHERE id = p_member_id;
$$;

-- =========================================================
-- 2. 修复 merchant_members RLS 策略（避免循环查询）
-- =========================================================

-- 删除旧策略
DROP POLICY IF EXISTS "merchant_members_read_merchant" ON public.merchant_members;
DROP POLICY IF EXISTS "merchant_members_update_active" ON public.merchant_members;

-- 策略 2: owner/manager/admin 可读同商户的所有成员（使用函数避免循环）
CREATE POLICY "merchant_members_read_merchant"
ON public.merchant_members FOR SELECT
USING (
  public.has_current_user_merchant_role(
    merchant_members.merchant_id,
    ARRAY['owner','manager','admin']
  )
);

-- 策略 3: 只有 owner/manager/admin 可更新成员的 is_active（使用函数避免循环）
CREATE POLICY "merchant_members_update_active"
ON public.merchant_members FOR UPDATE
USING (
  public.has_current_user_merchant_role(
    merchant_members.merchant_id,
    ARRAY['owner','manager','admin']
  )
)
WITH CHECK (
  public.has_current_user_merchant_role(
    merchant_members.merchant_id,
    ARRAY['owner','manager','admin']
  )
);

-- =========================================================
-- 3. 修复 merchants RLS 策略（使用函数避免循环）
-- =========================================================

-- 删除旧策略
DROP POLICY IF EXISTS "merchants_read_membership" ON public.merchants;

-- 策略: 用户可读自己所属的商户（使用函数避免循环）
CREATE POLICY "merchants_read_membership"
ON public.merchants FOR SELECT
USING (
  public.has_current_user_merchant_role(merchants.id, NULL)
);

-- =========================================================
-- 4. 修复 venues RLS 策略（使用函数避免循环）
-- =========================================================

-- 删除旧策略
DROP POLICY IF EXISTS "venues_read_merchant" ON public.venues;

-- 策略: 用户可读自己商户下的场地（使用函数避免循环）
CREATE POLICY "venues_read_merchant"
ON public.venues FOR SELECT
USING (
  public.has_current_user_merchant_role(venues.merchant_id, NULL)
);

-- =========================================================
-- 5. 修复 events RLS 策略（确保使用正确的函数）
-- =========================================================

-- events_read_internal 策略已经使用 has_merchant_role 函数，应该没问题
-- 但为了确保使用小写角色，我们需要检查并更新 helper 函数

-- has_merchant_role 函数已经在 014_fix_helper_functions.sql 中修复为小写
-- 这里只需要确保 events 策略使用正确的角色名称

-- events_read_internal 策略已经在 002_rls_policies.sql 中定义
-- 我们只需要确保它使用小写角色（has_merchant_role 函数已经在 014_fix_helper_functions.sql 中修复）
-- 这里不需要重新创建，除非策略不存在

-- =========================================================
-- 6. 修复 invites RLS 策略（使用函数避免循环）
-- =========================================================

-- 删除旧策略
DROP POLICY IF EXISTS "invites_read_merchant" ON public.invites;

-- 策略 1: owner/manager/admin 可读同商户的邀请码（使用函数避免循环）
CREATE POLICY "invites_read_merchant"
ON public.invites FOR SELECT
USING (
  public.can_manage_merchant_for_invite(merchant_id)
  OR public.has_current_user_merchant_role(merchant_id, NULL)
  OR auth.uid() IS NULL  -- 匿名用户也可以预览（用于登录前查看）
);

-- =========================================================
-- 7. 修复 member_venues RLS 策略（使用函数避免循环）
-- =========================================================

-- 删除旧策略
DROP POLICY IF EXISTS "member_venues_read" ON public.member_venues;
DROP POLICY IF EXISTS "member_venues_manage" ON public.member_venues;

-- 策略: 用户可读自己的 member_venues（使用函数避免循环）
CREATE POLICY "member_venues_read"
ON public.member_venues FOR SELECT
USING (
  -- 检查是否是自己的 member_venues（使用函数获取 merchant_id）
  public.has_current_user_merchant_role(
    public.get_member_merchant_id(member_venues.member_id),
    NULL
  )
  OR public.has_current_user_merchant_role(
    public.get_member_merchant_id(member_venues.member_id),
    ARRAY['owner','manager','admin']
  )
);

-- 策略: owner/manager/admin 可管理 member_venues（使用函数避免循环）
CREATE POLICY "member_venues_manage"
ON public.member_venues FOR ALL
USING (
  public.has_current_user_merchant_role(
    public.get_member_merchant_id(member_venues.member_id),
    ARRAY['owner','manager','admin']
  )
)
WITH CHECK (
  public.has_current_user_merchant_role(
    public.get_member_merchant_id(member_venues.member_id),
    ARRAY['owner','manager','admin']
  )
);

-- =========================================================
-- 8. 确保 grants 正确
-- =========================================================

REVOKE ALL ON FUNCTION public.has_merchant_membership_check(UUID, UUID, TEXT[]) FROM public;
GRANT EXECUTE ON FUNCTION public.has_merchant_membership_check(UUID, UUID, TEXT[]) TO authenticated;

REVOKE ALL ON FUNCTION public.has_current_user_merchant_role(UUID, TEXT[]) FROM public;
GRANT EXECUTE ON FUNCTION public.has_current_user_merchant_role(UUID, TEXT[]) TO authenticated;

REVOKE ALL ON FUNCTION public.get_member_merchant_id(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_member_merchant_id(UUID) TO authenticated;
