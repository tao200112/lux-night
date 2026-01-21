-- =========================================================
-- 5) SECURITY: helper functions for RLS
-- =========================================================

-- Is current user an active admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = auth.uid() AND au.is_active = true
  );
$$;

-- Does current user have an active role in a merchant?
CREATE OR REPLACE FUNCTION public.has_merchant_role(p_merchant_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.merchant_members mm
    WHERE mm.user_id = auth.uid()
      AND mm.merchant_id = p_merchant_id
      AND mm.is_active = true
      AND mm.role = ANY(p_roles)
  );
$$;

-- Convenience: can manage merchant (OWNER/MANAGER/admin)
CREATE OR REPLACE FUNCTION public.can_manage_merchant(p_merchant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.has_merchant_role(p_merchant_id, ARRAY['OWNER','MANAGER']);
$$;

-- =========================================================
-- 6) RLS enable
-- =========================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 7) RLS policies
-- =========================================================

-- 7.1 profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
ON public.profiles FOR SELECT
USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
ON public.profiles FOR INSERT
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- 7.2 regions (public read)
DROP POLICY IF EXISTS "regions_read_public" ON public.regions;
CREATE POLICY "regions_read_public"
ON public.regions FOR SELECT
USING (is_active = true);

-- 7.3 merchants
DROP POLICY IF EXISTS "merchants_read_public" ON public.merchants;
CREATE POLICY "merchants_read_public"
ON public.merchants FOR SELECT
USING (status = 'active');

DROP POLICY IF EXISTS "merchants_update_manage" ON public.merchants;
CREATE POLICY "merchants_update_manage"
ON public.merchants FOR UPDATE
USING (public.can_manage_merchant(id))
WITH CHECK (public.can_manage_merchant(id));

-- 7.4 venues
DROP POLICY IF EXISTS "venues_read_public" ON public.venues;
CREATE POLICY "venues_read_public"
ON public.venues FOR SELECT
USING (is_active = true);

DROP POLICY IF EXISTS "venues_write_manage" ON public.venues;
CREATE POLICY "venues_write_manage"
ON public.venues FOR INSERT
WITH CHECK (public.can_manage_merchant(merchant_id));

DROP POLICY IF EXISTS "venues_update_manage" ON public.venues;
CREATE POLICY "venues_update_manage"
ON public.venues FOR UPDATE
USING (public.can_manage_merchant(merchant_id))
WITH CHECK (public.can_manage_merchant(merchant_id));

-- 7.5 merchant_members
DROP POLICY IF EXISTS "members_read" ON public.merchant_members;
CREATE POLICY "members_read"
ON public.merchant_members FOR SELECT
USING (
  user_id = auth.uid()
  OR public.can_manage_merchant(merchant_id)
);

DROP POLICY IF EXISTS "members_manage_insert" ON public.merchant_members;
CREATE POLICY "members_manage_insert"
ON public.merchant_members FOR INSERT
WITH CHECK (public.can_manage_merchant(merchant_id));

DROP POLICY IF EXISTS "members_manage_update" ON public.merchant_members;
CREATE POLICY "members_manage_update"
ON public.merchant_members FOR UPDATE
USING (public.can_manage_merchant(merchant_id))
WITH CHECK (public.can_manage_merchant(merchant_id));

-- 7.6 admin_users
DROP POLICY IF EXISTS "admin_users_read_admin" ON public.admin_users;
CREATE POLICY "admin_users_read_admin"
ON public.admin_users FOR SELECT
USING (public.is_admin());

-- 7.7 events
DROP POLICY IF EXISTS "events_read_public_published" ON public.events;
CREATE POLICY "events_read_public_published"
ON public.events FOR SELECT
USING (status = 'published');

DROP POLICY IF EXISTS "events_read_internal" ON public.events;
CREATE POLICY "events_read_internal"
ON public.events FOR SELECT
USING (
  public.is_admin()
  OR public.has_merchant_role(merchant_id, ARRAY['OWNER','MANAGER','STAFF'])
);

DROP POLICY IF EXISTS "events_write_manage" ON public.events;
CREATE POLICY "events_write_manage"
ON public.events FOR INSERT
WITH CHECK (public.can_manage_merchant(merchant_id));

DROP POLICY IF EXISTS "events_update_manage" ON public.events;
CREATE POLICY "events_update_manage"
ON public.events FOR UPDATE
USING (public.can_manage_merchant(merchant_id) OR public.is_admin())
WITH CHECK (public.can_manage_merchant(merchant_id) OR public.is_admin());

-- 7.8 ticket_types
DROP POLICY IF EXISTS "ticket_types_read_public_for_published_events" ON public.ticket_types;
CREATE POLICY "ticket_types_read_public_for_published_events"
ON public.ticket_types FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = ticket_types.event_id AND e.status = 'published'
  )
);

DROP POLICY IF EXISTS "ticket_types_manage_internal" ON public.ticket_types;
CREATE POLICY "ticket_types_manage_internal"
ON public.ticket_types FOR ALL
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = ticket_types.event_id
      AND public.can_manage_merchant(e.merchant_id)
  )
)
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = ticket_types.event_id
      AND public.can_manage_merchant(e.merchant_id)
  )
);

-- 7.9 orders
DROP POLICY IF EXISTS "orders_read_own" ON public.orders;
CREATE POLICY "orders_read_own"
ON public.orders FOR SELECT
USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
CREATE POLICY "orders_insert_own"
ON public.orders FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "orders_update_admin" ON public.orders;
CREATE POLICY "orders_update_admin"
ON public.orders FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 7.10 order_items
DROP POLICY IF EXISTS "order_items_read_own" ON public.order_items;
CREATE POLICY "order_items_read_own"
ON public.order_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (o.user_id = auth.uid() OR public.is_admin())
  )
);

DROP POLICY IF EXISTS "order_items_insert_own" ON public.order_items;
CREATE POLICY "order_items_insert_own"
ON public.order_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
  )
);

-- 7.11 tickets
DROP POLICY IF EXISTS "tickets_read_own" ON public.tickets;
CREATE POLICY "tickets_read_own"
ON public.tickets FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.venues v
    JOIN public.merchants m ON m.id = v.merchant_id
    WHERE v.id = tickets.venue_id
      AND public.has_merchant_role(m.id, ARRAY['OWNER','MANAGER','STAFF'])
  )
);

DROP POLICY IF EXISTS "tickets_write_admin" ON public.tickets;
CREATE POLICY "tickets_write_admin"
ON public.tickets FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 7.12 checkins
DROP POLICY IF EXISTS "checkins_read_internal" ON public.checkins;
CREATE POLICY "checkins_read_internal"
ON public.checkins FOR SELECT
USING (
  public.is_admin()
  OR public.has_merchant_role(actor_merchant_id, ARRAY['OWNER','MANAGER','STAFF'])
);

DROP POLICY IF EXISTS "checkins_insert_admin_only" ON public.checkins;
CREATE POLICY "checkins_insert_admin_only"
ON public.checkins FOR INSERT
WITH CHECK (public.is_admin());

-- 7.13 invites
DROP POLICY IF EXISTS "invites_read_internal" ON public.invites;
CREATE POLICY "invites_read_internal"
ON public.invites FOR SELECT
USING (
  public.is_admin()
  OR public.can_manage_merchant(merchant_id)
);

DROP POLICY IF EXISTS "invites_manage_internal" ON public.invites;
CREATE POLICY "invites_manage_internal"
ON public.invites FOR ALL
USING (
  public.is_admin()
  OR public.can_manage_merchant(merchant_id)
)
WITH CHECK (
  public.is_admin()
  OR public.can_manage_merchant(merchant_id)
);

-- 7.14 stripe_events (webhook idempotency) - admin/service only
DROP POLICY IF EXISTS "stripe_events_admin_only" ON public.stripe_events;
CREATE POLICY "stripe_events_admin_only"
ON public.stripe_events FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());
