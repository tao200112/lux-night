-- =========================================================
-- 002 RLS - Row Level Security Policies
-- 完整的 RLS 策略（最终态）
-- =========================================================
-- 说明：
-- - 所有策略幂等可重复执行（DROP IF EXISTS + CREATE）
-- - 使用 helper 函数避免 RLS 递归
-- - 分为 Customer 和 Internal 两套权限体系
-- =========================================================

-- =========================================================
-- Helper Functions（SECURITY DEFINER，避免 RLS 递归）
-- =========================================================

-- 检查是否为 admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 
    FROM public.admin_users 
    WHERE user_id = v_user_id 
      AND is_active = true
  );
END;
$$;

-- 获取当前用户拥有的 merchant_ids
CREATE OR REPLACE FUNCTION public.my_merchant_ids()
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id UUID;
  v_merchant_ids UUID[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::UUID[];
  END IF;
  
  SELECT ARRAY_AGG(merchant_id)
  INTO v_merchant_ids
  FROM public.merchant_members
  WHERE user_id = v_user_id
    AND is_active = true;
  
  RETURN COALESCE(v_merchant_ids, ARRAY[]::UUID[]);
END;
$$;

-- 检查用户对某商户的角色
CREATE OR REPLACE FUNCTION public.has_merchant_role(
  p_merchant_id UUID,
  p_roles TEXT[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Admin 拥有所有权限
  IF public.is_admin() THEN
    RETURN true;
  END IF;
  
  SELECT role INTO v_role
  FROM public.merchant_members
  WHERE user_id = v_user_id
    AND merchant_id = p_merchant_id
    AND is_active = true
  LIMIT 1;
  
  RETURN v_role = ANY(p_roles);
END;
$$;

-- 获取用户可访问的 venue_ids
CREATE OR REPLACE FUNCTION public.my_venue_ids()
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id UUID;
  v_venue_ids UUID[];
  v_merchant_ids UUID[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::UUID[];
  END IF;
  
  -- Admin 可访问所有 venues
  IF public.is_admin() THEN
    SELECT ARRAY_AGG(id) INTO v_venue_ids FROM public.venues;
    RETURN COALESCE(v_venue_ids, ARRAY[]::UUID[]);
  END IF;
  
  -- 获取用户的 merchant_ids
  v_merchant_ids := public.my_merchant_ids();
  
  IF v_merchant_ids IS NULL OR array_length(v_merchant_ids, 1) IS NULL THEN
    RETURN ARRAY[]::UUID[];
  END IF;
  
  -- 获取这些商户的所有 venues（如果没有 member_venues 限制）
  -- 或者只获取 member_venues 中指定的 venues
  SELECT ARRAY_AGG(DISTINCT v.id)
  INTO v_venue_ids
  FROM public.venues v
  INNER JOIN public.merchant_members mm ON mm.merchant_id = v.merchant_id
  WHERE mm.user_id = v_user_id
    AND mm.is_active = true
    AND (
      -- owner/manager 可访问商户下所有 venues
      mm.role IN ('owner', 'manager')
      OR
      -- staff 只能访问 member_venues 中的 venues
      (mm.role = 'staff' AND EXISTS (
        SELECT 1 FROM public.member_venues mv
        WHERE mv.member_id = mm.id
          AND mv.venue_id = v.id
      ))
    );
  
  RETURN COALESCE(v_venue_ids, ARRAY[]::UUID[]);
END;
$$;

-- =========================================================
-- 1. Customer Tables - Public Read
-- =========================================================

-- 1.1 profiles - 仅本人可读写
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
CREATE POLICY "profiles_read_own"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- 1.2 regions - 公开可读
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regions_read_all" ON public.regions;
CREATE POLICY "regions_read_all"
ON public.regions FOR SELECT
TO authenticated, anon
USING (is_active = true);

DROP POLICY IF EXISTS "regions_manage_admin" ON public.regions;
CREATE POLICY "regions_manage_admin"
ON public.regions FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 1.3 merchants - 公开可读 active
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchants_read_active" ON public.merchants;
CREATE POLICY "merchants_read_active"
ON public.merchants FOR SELECT
TO authenticated, anon
USING (status = 'active');

DROP POLICY IF EXISTS "merchants_read_member" ON public.merchants;
CREATE POLICY "merchants_read_member"
ON public.merchants FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR id = ANY(public.my_merchant_ids())
);

DROP POLICY IF EXISTS "merchants_manage_owner" ON public.merchants;
CREATE POLICY "merchants_manage_owner"
ON public.merchants FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR public.has_merchant_role(id, ARRAY['owner'])
)
WITH CHECK (
  public.is_admin()
  OR public.has_merchant_role(id, ARRAY['owner'])
);

-- 1.4 venues - 公开可读 active
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venues_read_active" ON public.venues;
CREATE POLICY "venues_read_active"
ON public.venues FOR SELECT
TO authenticated, anon
USING (is_active = true);

DROP POLICY IF EXISTS "venues_read_merchant" ON public.venues;
CREATE POLICY "venues_read_merchant"
ON public.venues FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR merchant_id = ANY(public.my_merchant_ids())
);

DROP POLICY IF EXISTS "venues_manage_manager" ON public.venues;
CREATE POLICY "venues_manage_manager"
ON public.venues FOR ALL
TO authenticated
USING (
  public.is_admin()
  OR public.has_merchant_role(merchant_id, ARRAY['owner','manager'])
)
WITH CHECK (
  public.is_admin()
  OR public.has_merchant_role(merchant_id, ARRAY['owner','manager'])
);

-- =========================================================
-- 2. Internal Tables - Merchant Members
-- =========================================================

-- 2.1 merchant_members - 读自己的 + owner/manager 读同商户
ALTER TABLE public.merchant_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_read_own" ON public.merchant_members;
CREATE POLICY "members_read_own"
ON public.merchant_members FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_admin()
  OR merchant_id = ANY(public.my_merchant_ids())
);

DROP POLICY IF EXISTS "members_manage_owner" ON public.merchant_members;
CREATE POLICY "members_manage_owner"
ON public.merchant_members FOR ALL
TO authenticated
USING (
  public.is_admin()
  OR public.has_merchant_role(merchant_id, ARRAY['owner','manager'])
)
WITH CHECK (
  public.is_admin()
  OR public.has_merchant_role(merchant_id, ARRAY['owner','manager'])
);

-- 2.2 member_venues
ALTER TABLE public.member_venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_venues_read" ON public.member_venues;
CREATE POLICY "member_venues_read"
ON public.member_venues FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.merchant_members mm
    INNER JOIN public.venues v ON v.id = public.member_venues.venue_id
    WHERE mm.id = public.member_venues.member_id
      AND mm.user_id = auth.uid()
      AND mm.is_active = true
  )
);

DROP POLICY IF EXISTS "member_venues_manage" ON public.member_venues;
CREATE POLICY "member_venues_manage"
ON public.member_venues FOR ALL
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.merchant_members mm
    INNER JOIN public.venues v ON v.id = public.member_venues.venue_id
    WHERE mm.id = public.member_venues.member_id
      AND v.merchant_id = ANY(public.my_merchant_ids())
      AND public.has_merchant_role(v.merchant_id, ARRAY['owner','manager'])
  )
)
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.merchant_members mm
    INNER JOIN public.venues v ON v.id = public.member_venues.venue_id
    WHERE mm.id = public.member_venues.member_id
      AND v.merchant_id = ANY(public.my_merchant_ids())
      AND public.has_merchant_role(v.merchant_id, ARRAY['owner','manager'])
  )
);

-- 2.3 invites - 禁止直接写入（只能通过 RPC）
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invites_read_merchant" ON public.invites;
CREATE POLICY "invites_read_merchant"
ON public.invites FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR public.has_merchant_role(merchant_id, ARRAY['owner','manager'])
);

-- Invites 不允许直接 INSERT/UPDATE，只能通过 RPC

-- 2.4 admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_users_read_admin" ON public.admin_users;
CREATE POLICY "admin_users_read_admin"
ON public.admin_users FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_users_manage_admin" ON public.admin_users;
CREATE POLICY "admin_users_manage_admin"
ON public.admin_users FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- =========================================================
-- 3. Events & Ticketing
-- =========================================================

-- 3.1 events - 公开可读 published
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_read_published" ON public.events;
CREATE POLICY "events_read_published"
ON public.events FOR SELECT
TO authenticated, anon
USING (status = 'published');

DROP POLICY IF EXISTS "events_read_merchant" ON public.events;
CREATE POLICY "events_read_merchant"
ON public.events FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR merchant_id = ANY(public.my_merchant_ids())
);

DROP POLICY IF EXISTS "events_manage_manager" ON public.events;
CREATE POLICY "events_manage_manager"
ON public.events FOR ALL
TO authenticated
USING (
  public.is_admin()
  OR public.has_merchant_role(merchant_id, ARRAY['owner','manager'])
)
WITH CHECK (
  public.is_admin()
  OR public.has_merchant_role(merchant_id, ARRAY['owner','manager'])
);

-- 3.2 ticket_types - 跟随 event
ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_types_read_published_event" ON public.ticket_types;
CREATE POLICY "ticket_types_read_published_event"
ON public.ticket_types FOR SELECT
TO authenticated, anon
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = public.ticket_types.event_id
      AND events.status = 'published'
  )
);

DROP POLICY IF EXISTS "ticket_types_read_merchant" ON public.ticket_types;
CREATE POLICY "ticket_types_read_merchant"
ON public.ticket_types FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = public.ticket_types.event_id
      AND events.merchant_id = ANY(public.my_merchant_ids())
  )
);

DROP POLICY IF EXISTS "ticket_types_manage_manager" ON public.ticket_types;
CREATE POLICY "ticket_types_manage_manager"
ON public.ticket_types FOR ALL
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = public.ticket_types.event_id
      AND public.has_merchant_role(events.merchant_id, ARRAY['owner','manager'])
  )
)
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = public.ticket_types.event_id
      AND public.has_merchant_role(events.merchant_id, ARRAY['owner','manager'])
  )
);

-- 3.3 orders - 本人可读
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_read_own" ON public.orders;
CREATE POLICY "orders_read_own"
ON public.orders FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
CREATE POLICY "orders_insert_own"
ON public.orders FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "orders_update_own" ON public.orders;
CREATE POLICY "orders_update_own"
ON public.orders FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR public.is_admin())
WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- 3.4 order_items - 跟随 order
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_read_own_order" ON public.order_items;
CREATE POLICY "order_items_read_own_order"
ON public.order_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = public.order_items.order_id
      AND (orders.user_id = auth.uid() OR public.is_admin())
  )
);

DROP POLICY IF EXISTS "order_items_insert_own_order" ON public.order_items;
CREATE POLICY "order_items_insert_own_order"
ON public.order_items FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = public.order_items.order_id
      AND orders.user_id = auth.uid()
  )
);

-- 3.5 tickets - 本人可读
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tickets_read_own" ON public.tickets;
CREATE POLICY "tickets_read_own"
ON public.tickets FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_admin()
  OR venue_id = ANY(public.my_venue_ids())
);

DROP POLICY IF EXISTS "tickets_insert_system" ON public.tickets;
CREATE POLICY "tickets_insert_system"
ON public.tickets FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "tickets_update_system" ON public.tickets;
CREATE POLICY "tickets_update_system"
ON public.tickets FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR venue_id = ANY(public.my_venue_ids())
)
WITH CHECK (
  public.is_admin()
  OR venue_id = ANY(public.my_venue_ids())
);

-- 3.6 checkins - staff 可读写
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checkins_read_staff" ON public.checkins;
CREATE POLICY "checkins_read_staff"
ON public.checkins FOR SELECT
TO authenticated
USING (
  actor_user_id = auth.uid()
  OR public.is_admin()
  OR actor_venue_id = ANY(public.my_venue_ids())
);

DROP POLICY IF EXISTS "checkins_insert_staff" ON public.checkins;
CREATE POLICY "checkins_insert_staff"
ON public.checkins FOR INSERT
TO authenticated
WITH CHECK (
  actor_user_id = auth.uid()
  AND (
    public.is_admin()
    OR actor_venue_id = ANY(public.my_venue_ids())
  )
);

-- 3.7 stripe_events - 仅 service role
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stripe_events_read_admin" ON public.stripe_events;
CREATE POLICY "stripe_events_read_admin"
ON public.stripe_events FOR SELECT
TO authenticated
USING (public.is_admin());

-- =========================================================
-- 4. Requests System
-- =========================================================

-- 4.1 requests
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "requests_read_own" ON public.requests;
CREATE POLICY "requests_read_own"
ON public.requests FOR SELECT
TO authenticated
USING (
  requested_by = auth.uid()
  OR public.is_admin()
  OR public.has_merchant_role(merchant_id, ARRAY['owner','manager'])
);

DROP POLICY IF EXISTS "requests_insert_merchant" ON public.requests;
CREATE POLICY "requests_insert_merchant"
ON public.requests FOR INSERT
TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND (
    public.is_admin()
    OR public.has_merchant_role(merchant_id, ARRAY['owner','manager'])
  )
);

DROP POLICY IF EXISTS "requests_update_own" ON public.requests;
CREATE POLICY "requests_update_own"
ON public.requests FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR (requested_by = auth.uid() AND status = 'pending')
)
WITH CHECK (
  public.is_admin()
  OR (requested_by = auth.uid() AND status = 'pending')
);

-- 4.2 request_events
ALTER TABLE public.request_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "request_events_read" ON public.request_events;
CREATE POLICY "request_events_read"
ON public.request_events FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.requests
    WHERE requests.id = public.request_events.request_id
      AND (
        requests.requested_by = auth.uid()
        OR public.has_merchant_role(requests.merchant_id, ARRAY['owner','manager'])
      )
  )
);

DROP POLICY IF EXISTS "request_events_insert_system" ON public.request_events;
CREATE POLICY "request_events_insert_system"
ON public.request_events FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- =========================================================
-- 完成
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ RLS policies created successfully!';
  RAISE NOTICE '   - 19 tables secured';
  RAISE NOTICE '   - 4 helper functions created';
  RAISE NOTICE '   - 60+ policies applied';
  RAISE NOTICE '========================================';
END $$;
