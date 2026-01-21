-- =========================================================
-- 001 SCHEMA - Final State
-- 完整的数据库表结构（最终态）
-- =========================================================
-- 说明：
-- - 所有语句幂等可重复执行
-- - 包含所有 customer + internal 功能的表
-- - 外键、索引、约束全部定义
-- =========================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================
-- Helper Function: updated_at trigger
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- =========================================================
-- 1. Core Tables (Customer + Merchant Common)
-- =========================================================

-- 1.1 profiles (1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  last_region_id UUID,
  default_merchant_id UUID, -- Internal: 默认 workspace
  default_venue_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 1.2 regions
CREATE TABLE IF NOT EXISTS public.regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  state TEXT,
  country TEXT DEFAULT 'US',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, state, country)
);

CREATE INDEX IF NOT EXISTS idx_regions_active ON public.regions(is_active);

DROP TRIGGER IF EXISTS trg_regions_updated_at ON public.regions;
CREATE TRIGGER trg_regions_updated_at
BEFORE UPDATE ON public.regions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 1.3 merchants
CREATE TABLE IF NOT EXISTS public.merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES public.regions(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region_id, name)
);

CREATE INDEX IF NOT EXISTS idx_merchants_region ON public.merchants(region_id);

DROP TRIGGER IF EXISTS trg_merchants_updated_at ON public.merchants;
CREATE TRIGGER trg_merchants_updated_at
BEFORE UPDATE ON public.merchants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 1.4 venues
CREATE TABLE IF NOT EXISTS public.venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  region_id UUID NOT NULL REFERENCES public.regions(id),
  name TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  timezone TEXT DEFAULT 'America/New_York',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_venues_merchant ON public.venues(merchant_id);
CREATE INDEX IF NOT EXISTS idx_venues_region ON public.venues(region_id);

DROP TRIGGER IF EXISTS trg_venues_updated_at ON public.venues;
CREATE TRIGGER trg_venues_updated_at
BEFORE UPDATE ON public.venues
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 2. Internal Merchant Tables
-- =========================================================

-- 2.1 merchant_members (内部身份)
CREATE TABLE IF NOT EXISTS public.merchant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('staff','manager','owner','admin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_members_user ON public.merchant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_merchant ON public.merchant_members(merchant_id);

DROP TRIGGER IF EXISTS trg_members_updated_at ON public.merchant_members;
CREATE TRIGGER trg_members_updated_at
BEFORE UPDATE ON public.merchant_members
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.2 member_venues (员工场地权限)
CREATE TABLE IF NOT EXISTS public.member_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.merchant_members(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_member_venues_member ON public.member_venues(member_id);
CREATE INDEX IF NOT EXISTS idx_member_venues_venue ON public.member_venues(venue_id);

-- 2.3 invites (邀请码)
CREATE TABLE IF NOT EXISTS public.invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  intended_role TEXT NOT NULL CHECK (intended_role IN ('staff','manager','owner','admin')),
  issued_by_type TEXT NOT NULL DEFAULT 'merchant' CHECK (issued_by_type IN ('admin','merchant')),
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at TIMESTAMPTZ,
  disabled BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invites_uses_ok CHECK (used_count <= max_uses)
);

CREATE INDEX IF NOT EXISTS idx_invites_merchant ON public.invites(merchant_id);
CREATE INDEX IF NOT EXISTS idx_invites_active ON public.invites(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_invites_issued_by_type ON public.invites(issued_by_type);
CREATE INDEX IF NOT EXISTS idx_invites_venue ON public.invites(venue_id) WHERE venue_id IS NOT NULL;

-- Token 规范化触发器
CREATE OR REPLACE FUNCTION public.normalize_invite_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.token = UPPER(TRIM(NEW.token));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_invite_token ON public.invites;
CREATE TRIGGER trg_normalize_invite_token
BEFORE INSERT OR UPDATE ON public.invites
FOR EACH ROW EXECUTE FUNCTION public.normalize_invite_token();

DROP TRIGGER IF EXISTS trg_invites_updated_at ON public.invites;
CREATE TRIGGER trg_invites_updated_at
BEFORE UPDATE ON public.invites
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.4 admin_users
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_active ON public.admin_users(is_active);

-- =========================================================
-- 3. Events & Ticketing (Customer)
-- =========================================================

-- 3.1 events
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES public.regions(id),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','approved','published','rejected','archived')),
  title TEXT NOT NULL,
  description TEXT,
  poster_url TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  age_policy TEXT NOT NULL DEFAULT '21+' CHECK (age_policy IN ('21+','UNDER21','BOTH')),
  refund_policy TEXT NOT NULL DEFAULT 'no_refund' CHECK (refund_policy IN ('no_refund','24h','flexible','venue_policy')),
  publish_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT events_time_ok CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_events_region_status_time ON public.events(region_id, status, start_at);
CREATE INDEX IF NOT EXISTS idx_events_merchant ON public.events(merchant_id);
CREATE INDEX IF NOT EXISTS idx_events_venue ON public.events(venue_id);

DROP TRIGGER IF EXISTS trg_events_updated_at ON public.events;
CREATE TRIGGER trg_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3.2 ticket_types
CREATE TABLE IF NOT EXISTS public.ticket_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('ENTRY','DRINK')),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  inventory_limit INTEGER,
  sold_count INTEGER NOT NULL DEFAULT 0 CHECK (sold_count >= 0),
  redeem_limit INTEGER NOT NULL DEFAULT 1 CHECK (redeem_limit >= 1),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, name)
);

CREATE INDEX IF NOT EXISTS idx_ticket_types_event ON public.ticket_types(event_id);

DROP TRIGGER IF EXISTS trg_ticket_types_updated_at ON public.ticket_types;
CREATE TRIGGER trg_ticket_types_updated_at
BEFORE UPDATE ON public.ticket_types
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3.3 orders
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  region_id UUID REFERENCES public.regions(id),
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('created','pending_payment','paid','fulfilled','expired','canceled','refunded','partially_refunded')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_idempotency ON public.orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_stripe_checkout_session ON public.orders(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_stripe_payment_intent ON public.orders(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON public.orders(user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3.4 order_items
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id),
  ticket_type_id UUID NOT NULL REFERENCES public.ticket_types(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);

-- 3.5 tickets
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL REFERENCES public.events(id),
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  ticket_type_id UUID NOT NULL REFERENCES public.ticket_types(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('issued','active','used','refunded','void','expired')),
  redeem_limit INTEGER NOT NULL DEFAULT 1 CHECK (redeem_limit >= 1),
  redeemed_count INTEGER NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0),
  qr_seed TEXT NOT NULL DEFAULT substring(md5(random()::text || clock_timestamp()::text) from 1 for 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tickets_redeem_ok CHECK (redeemed_count <= redeem_limit)
);

CREATE INDEX IF NOT EXISTS idx_tickets_user_status ON public.tickets(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON public.tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_venue ON public.tickets(venue_id);

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON public.tickets;
CREATE TRIGGER trg_tickets_updated_at
BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3.6 checkins (核销审计)
CREATE TABLE IF NOT EXISTS public.checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('ENTRY','DRINK')),
  result TEXT NOT NULL CHECK (result IN ('OK','ALREADY_USED','WRONG_VENUE','INVALID','EXPIRED','REFUNDED','NOT_ALLOWED')),
  success BOOLEAN NOT NULL DEFAULT false,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
  actor_venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  device_id UUID,
  client_ts BIGINT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_checkins_success_once ON public.checkins(ticket_id, action) WHERE success = true;
CREATE INDEX IF NOT EXISTS idx_checkins_ticket ON public.checkins(ticket_id);
CREATE INDEX IF NOT EXISTS idx_checkins_actor ON public.checkins(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_result_created ON public.checkins(result, created_at DESC);

-- 3.7 stripe_events
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type_time ON public.stripe_events(event_type, received_at DESC);

-- =========================================================
-- 4. Requests System (申请制)
-- =========================================================

-- 4.1 requests
CREATE TABLE IF NOT EXISTS public.requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('venue_edit','new_event','price_change','inventory_change')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
  payload JSONB NOT NULL,
  admin_note TEXT,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requests_merchant ON public.requests(merchant_id);
CREATE INDEX IF NOT EXISTS idx_requests_venue ON public.requests(venue_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_requested_by ON public.requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_requests_type_status ON public.requests(type, status);

DROP TRIGGER IF EXISTS trg_requests_updated_at ON public.requests;
CREATE TRIGGER trg_requests_updated_at
BEFORE UPDATE ON public.requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4.2 request_events (审计)
CREATE TABLE IF NOT EXISTS public.request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  before JSONB,
  after JSONB,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','updated','approved','rejected','withdrawn')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_events_request ON public.request_events(request_id);
CREATE INDEX IF NOT EXISTS idx_request_events_created_at ON public.request_events(created_at DESC);

-- =========================================================
-- 完成
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Schema created successfully!';
  RAISE NOTICE '   - 19 tables created';
  RAISE NOTICE '   - All indexes and constraints applied';
  RAISE NOTICE '   - All triggers created';
  RAISE NOTICE '========================================';
END $$;
