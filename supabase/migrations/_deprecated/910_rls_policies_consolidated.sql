-- =========================================================
-- 910 RLS POLICIES CONSOLIDATED
-- 统一管理所有 RLS 策略（Row Level Security）
-- =========================================================
-- 说明：
-- 1. 所有策略幂等：先 DROP IF EXISTS 再 CREATE
-- 2. 避免 RLS 递归：使用 SECURITY DEFINER helper 函数
-- 3. 最小权限原则：用户只能访问自己相关的数据
-- =========================================================

-- =========================================================
-- 1. merchant_members RLS
-- =========================================================

ALTER TABLE public.merchant_members ENABLE ROW LEVEL SECURITY;

-- 删除所有旧策略
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
  public.has_merchant_membership_check(auth.uid(), merchant_id, ARRAY['owner','manager','admin'])
);

-- 策略 3: 只有 owner/manager/admin 可更新成员的 is_active
CREATE POLICY "merchant_members_update_active"
ON public.merchant_members FOR UPDATE
USING (
  public.has_merchant_membership_check(auth.uid(), merchant_id, ARRAY['owner','manager','admin'])
)
WITH CHECK (
  public.has_merchant_membership_check(auth.uid(), merchant_id, ARRAY['owner','manager','admin'])
);

-- 策略 4: 禁止普通用户直接 INSERT（只能通过 RPC）
CREATE POLICY "merchant_members_insert_disabled"
ON public.merchant_members FOR INSERT
WITH CHECK (false);

-- =========================================================
-- 2. invites RLS
-- =========================================================

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- 删除所有旧策略
DROP POLICY IF EXISTS "invites_read_internal" ON public.invites;
DROP POLICY IF EXISTS "invites_manage_internal" ON public.invites;
DROP POLICY IF EXISTS "invites_read_merchant" ON public.invites;
DROP POLICY IF EXISTS "invites_insert_disabled" ON public.invites;
DROP POLICY IF EXISTS "invites_update_disabled" ON public.invites;
DROP POLICY IF EXISTS "invites_delete_disabled" ON public.invites;

-- 策略 1: owner/manager/admin 可读同商户的邀请码
CREATE POLICY "invites_read_merchant"
ON public.invites FOR SELECT
USING (
  public.has_merchant_membership_check(auth.uid(), merchant_id, ARRAY['owner','manager','admin'])
  OR auth.uid() IS NULL  -- 匿名用户可预览（用于登录前查看）
);

-- 策略 2-4: 禁止普通用户直接 INSERT/UPDATE/DELETE（只能通过 RPC）
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
-- 3. venues RLS（内部端口读权限）
-- =========================================================

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

-- 删除所有旧策略
DROP POLICY IF EXISTS "venues_read_public" ON public.venues;
DROP POLICY IF EXISTS "venues_write_manage" ON public.venues;
DROP POLICY IF EXISTS "venues_update_manage" ON public.venues;
DROP POLICY IF EXISTS "venues_read_merchant" ON public.venues;

-- 策略 1: 公开读（active 或关联已发布活动）
CREATE POLICY "venues_read_public"
ON public.venues FOR SELECT
TO public
USING (
  is_active = true
  OR EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.venue_id = venues.id
      AND e.status = 'published'
  )
);

-- 策略 2: 内部成员可读自己商户下的场地
CREATE POLICY "venues_read_merchant"
ON public.venues FOR SELECT
USING (
  public.has_merchant_membership_check(auth.uid(), merchant_id, ARRAY['staff','manager','owner','admin'])
);

-- 策略 3: 只有 owner/manager 可写场地
CREATE POLICY "venues_write_manage"
ON public.venues FOR INSERT
WITH CHECK (
  public.has_merchant_membership_check(auth.uid(), merchant_id, ARRAY['owner','manager'])
);

CREATE POLICY "venues_update_manage"
ON public.venues FOR UPDATE
USING (
  public.has_merchant_membership_check(auth.uid(), merchant_id, ARRAY['owner','manager'])
);

-- =========================================================
-- 4. merchants RLS
-- =========================================================

ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

-- 删除所有旧策略
DROP POLICY IF EXISTS "merchants_read_public" ON public.merchants;
DROP POLICY IF EXISTS "merchants_update_manage" ON public.merchants;
DROP POLICY IF EXISTS "merchants_read_membership" ON public.merchants;

-- 策略 1: 公开读
CREATE POLICY "merchants_read_public"
ON public.merchants FOR SELECT
TO public
USING (status = 'active');

-- 策略 2: 内部成员可读自己所属的商户
CREATE POLICY "merchants_read_membership"
ON public.merchants FOR SELECT
USING (
  public.has_merchant_membership_check(auth.uid(), id, ARRAY['staff','manager','owner','admin'])
);

-- 策略 3: 只有 owner/manager 可更新商户
CREATE POLICY "merchants_update_manage"
ON public.merchants FOR UPDATE
USING (
  public.has_merchant_membership_check(auth.uid(), id, ARRAY['owner','manager'])
);

-- =========================================================
-- 5. member_venues RLS
-- =========================================================

ALTER TABLE public.member_venues ENABLE ROW LEVEL SECURITY;

-- 删除所有旧策略
DROP POLICY IF EXISTS "member_venues_read" ON public.member_venues;
DROP POLICY IF EXISTS "member_venues_manage" ON public.member_venues;

-- 策略 1: 用户可读自己的 member_venues
CREATE POLICY "member_venues_read"
ON public.member_venues FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.merchant_members mm
    WHERE mm.id = member_venues.member_id
      AND (
        mm.user_id = auth.uid()
        OR public.get_member_merchant_id(member_venues.member_id) IN (
          SELECT merchant_id FROM public.merchant_members
          WHERE user_id = auth.uid()
            AND role IN ('owner','manager','admin')
            AND is_active = true
        )
      )
  )
);

-- 策略 2: owner/manager/admin 可管理 member_venues
CREATE POLICY "member_venues_manage"
ON public.member_venues FOR ALL
USING (
  public.get_member_merchant_id(member_id) IN (
    SELECT merchant_id FROM public.merchant_members
    WHERE user_id = auth.uid()
      AND role IN ('owner','manager','admin')
      AND is_active = true
  )
)
WITH CHECK (
  public.get_member_merchant_id(member_id) IN (
    SELECT merchant_id FROM public.merchant_members
    WHERE user_id = auth.uid()
      AND role IN ('owner','manager','admin')
      AND is_active = true
  )
);

-- =========================================================
-- 6. checkins RLS
-- =========================================================

ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

-- 删除所有旧策略
DROP POLICY IF EXISTS "checkins_read_internal" ON public.checkins;
DROP POLICY IF EXISTS "checkins_insert_admin_only" ON public.checkins;
DROP POLICY IF EXISTS "checkins_insert_staff" ON public.checkins;

-- 策略 1: 内部成员可读同商户的 checkins
CREATE POLICY "checkins_read_internal"
ON public.checkins FOR SELECT
USING (
  public.has_merchant_membership_check(auth.uid(), actor_merchant_id, ARRAY['staff','manager','owner','admin'])
);

-- 策略 2: staff+ 可插入 checkins（通过 RPC）
CREATE POLICY "checkins_insert_staff"
ON public.checkins FOR INSERT
WITH CHECK (
  public.is_admin()
  OR public.has_merchant_membership_check(auth.uid(), actor_merchant_id, ARRAY['staff','manager','owner'])
);

-- =========================================================
-- 7. requests RLS
-- =========================================================

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

-- 删除所有旧策略
DROP POLICY IF EXISTS "requests_read" ON public.requests;
DROP POLICY IF EXISTS "requests_insert" ON public.requests;
DROP POLICY IF EXISTS "requests_update" ON public.requests;

-- 策略 1: 提交者/管理者/admin 可读
CREATE POLICY "requests_read"
ON public.requests FOR SELECT
USING (
  requested_by = auth.uid()
  OR public.has_merchant_membership_check(auth.uid(), merchant_id, ARRAY['owner','manager'])
  OR public.is_admin()
);

-- 策略 2: owner/manager 可插入 requests
CREATE POLICY "requests_insert"
ON public.requests FOR INSERT
WITH CHECK (
  requested_by = auth.uid()
  AND public.has_merchant_membership_check(auth.uid(), merchant_id, ARRAY['owner','manager'])
);

-- 策略 3: 提交者可撤回，admin 可审批
CREATE POLICY "requests_update"
ON public.requests FOR UPDATE
USING (
  (requested_by = auth.uid() AND status = 'pending')
  OR public.is_admin()
)
WITH CHECK (
  (requested_by = auth.uid() AND status IN ('pending','withdrawn'))
  OR (public.is_admin() AND status IN ('approved','rejected'))
);

-- =========================================================
-- 8. request_events RLS
-- =========================================================

ALTER TABLE public.request_events ENABLE ROW LEVEL SECURITY;

-- 删除所有旧策略
DROP POLICY IF EXISTS "request_events_read" ON public.request_events;
DROP POLICY IF EXISTS "request_events_insert" ON public.request_events;

-- 策略 1: 可读关联 request 的 events
CREATE POLICY "request_events_read"
ON public.request_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = request_events.request_id
      AND (
        r.requested_by = auth.uid()
        OR public.has_merchant_membership_check(auth.uid(), r.merchant_id, ARRAY['owner','manager'])
        OR public.is_admin()
      )
  )
);

-- 策略 2: 提交者/admin 可插入 events
CREATE POLICY "request_events_insert"
ON public.request_events FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = request_events.request_id
      AND (
        r.requested_by = auth.uid()
        OR public.is_admin()
      )
  )
);
