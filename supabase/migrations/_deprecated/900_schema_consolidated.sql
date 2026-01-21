-- =========================================================
-- 900 SCHEMA CONSOLIDATED
-- 统一管理所有内部端口（Internal Merchant）的表结构
-- =========================================================
-- 说明：
-- 1. 此文件整合了 009~021 中所有表结构变更
-- 2. 所有语句幂等：CREATE IF NOT EXISTS / ALTER IF NOT EXISTS
-- 3. 不删除历史 migrations（向后兼容），但确保最终态正确
-- =========================================================

-- =========================================================
-- 1. 扩展 invites 表（商家/员工邀请码）
-- =========================================================

-- 添加 venue_id（员工邀请码可绑定特定场地）
ALTER TABLE public.invites 
ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE;

-- 添加 disabled 字段（软删除）
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'invites' 
    AND column_name = 'disabled'
  ) THEN
    ALTER TABLE public.invites ADD COLUMN disabled BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- 添加 issued_by_type（区分 admin 创建 vs merchant 创建）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'invites'
    AND column_name = 'issued_by_type'
  ) THEN
    ALTER TABLE public.invites 
    ADD COLUMN issued_by_type TEXT NOT NULL DEFAULT 'merchant' 
    CHECK (issued_by_type IN ('admin','merchant'));
  END IF;
END $$;

-- 修改 created_by 为可空（system-created invites）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'invites'
    AND column_name = 'created_by'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.invites 
    ALTER COLUMN created_by DROP NOT NULL;
  END IF;
END $$;

-- 修改 expires_at 为可空（永不过期）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'invites'
    AND column_name = 'expires_at'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.invites 
    ALTER COLUMN expires_at DROP NOT NULL;
  END IF;
END $$;

-- 统一 role 为小写（修复历史数据）
UPDATE public.invites
SET intended_role = LOWER(intended_role)
WHERE intended_role ~ '[A-Z]';

-- 确保 token 唯一约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'invites_token_key'
  ) THEN
    ALTER TABLE public.invites ADD CONSTRAINT invites_token_key UNIQUE (token);
  END IF;
END $$;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_invites_merchant ON public.invites(merchant_id);
CREATE INDEX IF NOT EXISTS idx_invites_active ON public.invites(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_invites_issued_by_type ON public.invites(issued_by_type);
CREATE INDEX IF NOT EXISTS idx_invites_token ON public.invites(token) WHERE is_active = true AND disabled = false;
CREATE INDEX IF NOT EXISTS idx_invites_venue ON public.invites(venue_id) WHERE venue_id IS NOT NULL;

-- =========================================================
-- 2. 创建 member_venues 表（员工场地权限）
-- =========================================================

CREATE TABLE IF NOT EXISTS public.member_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.merchant_members(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_member_venues_member ON public.member_venues(member_id);
CREATE INDEX IF NOT EXISTS idx_member_venues_venue ON public.member_venues(venue_id);

-- =========================================================
-- 3. 扩展 profiles 表（默认 workspace）
-- =========================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS default_merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS default_venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_default_workspace ON public.profiles(default_merchant_id, default_venue_id);

-- =========================================================
-- 4. 扩展 checkins 表（幂等性支持）
-- =========================================================

ALTER TABLE public.checkins
ADD COLUMN IF NOT EXISTS success BOOLEAN NOT NULL DEFAULT false;

-- 创建部分唯一索引：同一 ticket + action 只能有一个成功记录
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkins_success_once
  ON public.checkins(ticket_id, action)
  WHERE success = true;

CREATE INDEX IF NOT EXISTS idx_checkins_result_created ON public.checkins(result, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_actor_venue_created ON public.checkins(actor_venue_id, created_at DESC);

-- =========================================================
-- 5. 创建 requests 表（申请制系统）
-- =========================================================

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
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON public.requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_type_status ON public.requests(type, status);

-- 触发器：自动更新 updated_at
DROP TRIGGER IF EXISTS trg_requests_updated_at ON public.requests;
CREATE TRIGGER trg_requests_updated_at
BEFORE UPDATE ON public.requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 6. 创建 request_events 表（审计日志）
-- =========================================================

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
-- 7. 修复 merchant_members role 约束（统一小写）
-- =========================================================

-- 统一历史数据为小写
UPDATE public.merchant_members
SET role = LOWER(role)
WHERE role ~ '[A-Z]';

-- 删除旧约束
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'merchant_members_role_check'
  ) THEN
    ALTER TABLE public.merchant_members DROP CONSTRAINT merchant_members_role_check;
  END IF;
END $$;

-- 创建新约束（小写 + admin）
ALTER TABLE public.merchant_members 
ADD CONSTRAINT merchant_members_role_check 
CHECK (role IN ('staff','manager','owner','admin'));

-- =========================================================
-- 8. Token 规范化触发器
-- =========================================================

-- 创建函数：自动规范化 token（UPPER + TRIM）
CREATE OR REPLACE FUNCTION public.normalize_invite_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.token = UPPER(TRIM(NEW.token));
  RETURN NEW;
END;
$$;

-- 创建触发器
DROP TRIGGER IF EXISTS trg_normalize_invite_token ON public.invites;
CREATE TRIGGER trg_normalize_invite_token
BEFORE INSERT OR UPDATE ON public.invites
FOR EACH ROW
EXECUTE FUNCTION public.normalize_invite_token();

-- =========================================================
-- 9. 确保 intended_role 约束正确
-- =========================================================

DO $$ 
BEGIN
  -- 删除旧约束（如果存在）
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'invites_intended_role_check'
  ) THEN
    ALTER TABLE public.invites DROP CONSTRAINT invites_intended_role_check;
  END IF;
  
  -- 创建新约束（小写）
  ALTER TABLE public.invites 
  ADD CONSTRAINT invites_intended_role_check 
  CHECK (intended_role IN ('staff','manager','owner','admin'));
END $$;
