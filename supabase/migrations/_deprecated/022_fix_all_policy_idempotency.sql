-- =========================================================
-- Fix All Policy Idempotency
-- 修复所有策略的幂等性问题（确保所有迁移可安全重复执行）
-- =========================================================
-- 
-- 此 migration 确保所有策略创建语句是幂等的
-- 如果策略已存在，先删除再创建
--

-- =========================================================
-- 修复 013 中可能遗漏的策略
-- =========================================================

DROP POLICY IF EXISTS "merchant_members_insert_disabled" ON public.merchant_members;
DROP POLICY IF EXISTS "invites_update_disabled" ON public.invites;
DROP POLICY IF EXISTS "invites_delete_disabled" ON public.invites;
DROP POLICY IF EXISTS "venues_read_merchant" ON public.venues;
DROP POLICY IF EXISTS "merchants_read_membership" ON public.merchants;

-- =========================================================
-- 修复 010 中可能遗漏的策略
-- =========================================================

DROP POLICY IF EXISTS "checkins_insert_staff" ON public.checkins;

-- =========================================================
-- 修复 016 中可能遗漏的策略（虽然已有 DROP，但确保完整）
-- =========================================================

DROP POLICY IF EXISTS "merchant_members_read_merchant" ON public.merchant_members;
DROP POLICY IF EXISTS "merchant_members_update_active" ON public.merchant_members;
DROP POLICY IF EXISTS "merchants_read_membership" ON public.merchants;
DROP POLICY IF EXISTS "venues_read_merchant" ON public.venues;
DROP POLICY IF EXISTS "invites_read_merchant" ON public.invites;
DROP POLICY IF EXISTS "member_venues_read" ON public.member_venues;
DROP POLICY IF EXISTS "member_venues_manage" ON public.member_venues;

-- =========================================================
-- 修复 008 中可能遗漏的策略
-- =========================================================

DROP POLICY IF EXISTS "venues_read_public" ON public.venues;
