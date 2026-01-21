-- =========================================================
-- Fix Invite System RLS Policies
-- 修复邀请码系统的 RLS 策略
-- =========================================================

-- =========================================================
-- 1. merchant_members RLS
-- =========================================================

-- 启用 RLS
ALTER TABLE public.merchant_members ENABLE ROW LEVEL SECURITY;

-- 删除旧策略
DROP POLICY IF EXISTS "merchant_members_read_own" ON public.merchant_members;
DROP POLICY IF EXISTS "merchant_members_read_merchant" ON public.merchant_members;
DROP POLICY IF EXISTS "merchant_members_update_active" ON public.merchant_members;
DROP POLICY IF EXISTS "merchant_members_insert_disabled" ON public.merchant_members;

-- 策略 1: 用户可读自己的记录
CREATE POLICY "merchant_members_read_own"
ON public.merchant_members FOR SELECT
USING (user_id = auth.uid());

-- 策略 2: owner/manager/admin 可读同商户的所有成员
CREATE POLICY "merchant_members_read_merchant"
ON public.merchant_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_members mm
    WHERE mm.user_id = auth.uid()
      AND mm.merchant_id = merchant_members.merchant_id
      AND mm.role IN ('owner','manager','admin')
      AND mm.is_active = true
  )
);

-- 策略 3: 只有 owner/manager/admin 可更新成员的 is_active
CREATE POLICY "merchant_members_update_active"
ON public.merchant_members FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_members mm
    WHERE mm.user_id = auth.uid()
      AND mm.merchant_id = merchant_members.merchant_id
      AND mm.role IN ('owner','manager','admin')
      AND mm.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.merchant_members mm
    WHERE mm.user_id = auth.uid()
      AND mm.merchant_id = merchant_members.merchant_id
      AND mm.role IN ('owner','manager','admin')
      AND mm.is_active = true
  )
);

-- 策略 4: 禁止普通用户直接 INSERT（只能通过 RPC）
CREATE POLICY "merchant_members_insert_disabled"
ON public.merchant_members FOR INSERT
WITH CHECK (false);

-- =========================================================
-- 2. invites RLS
-- =========================================================

-- 启用 RLS
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- 删除旧策略
DROP POLICY IF EXISTS "invites_read_merchant" ON public.invites;
DROP POLICY IF EXISTS "invites_insert_disabled" ON public.invites;
DROP POLICY IF EXISTS "invites_update_disabled" ON public.invites;
DROP POLICY IF EXISTS "invites_delete_disabled" ON public.invites;

-- 策略 1: owner/manager/admin 可读同商户的邀请码
CREATE POLICY "invites_read_merchant"
ON public.invites FOR SELECT
USING (
  public.can_manage_merchant_for_invite(merchant_id)
  OR EXISTS (
    -- 或者用户需要查看（用于预览）
    SELECT 1 FROM public.merchant_members mm
    WHERE mm.user_id = auth.uid()
      AND mm.merchant_id = invites.merchant_id
      AND mm.is_active = true
  )
  OR auth.uid() IS NULL  -- 匿名用户也可以预览（用于登录前查看）
);

-- 策略 2: 禁止普通用户直接 INSERT/UPDATE/DELETE（只能通过 RPC）
CREATE POLICY "invites_insert_disabled"
ON public.invites FOR INSERT
WITH CHECK (false);

CREATE POLICY "invites_update_disabled"
ON public.invites FOR UPDATE
USING (false);

CREATE POLICY "invites_delete_disabled"
ON public.invites FOR DELETE
USING (false);

-- =========================================================
-- 3. venues RLS（internal 端读权限）
-- =========================================================

-- 启用 RLS（如果还没启用）
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

-- 删除旧策略
DROP POLICY IF EXISTS "venues_read_merchant" ON public.venues;

-- 策略: 用户可读自己商户下的场地
CREATE POLICY "venues_read_merchant"
ON public.venues FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_members mm
    WHERE mm.user_id = auth.uid()
      AND mm.merchant_id = venues.merchant_id
      AND mm.is_active = true
  )
);

-- =========================================================
-- 4. merchants RLS（internal 端读权限）
-- =========================================================

-- 启用 RLS（如果还没启用）
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

-- 删除旧策略
DROP POLICY IF EXISTS "merchants_read_membership" ON public.merchants;

-- 策略: 用户可读自己所属的商户
CREATE POLICY "merchants_read_membership"
ON public.merchants FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_members mm
    WHERE mm.user_id = auth.uid()
      AND mm.merchant_id = merchants.id
      AND mm.is_active = true
  )
);
