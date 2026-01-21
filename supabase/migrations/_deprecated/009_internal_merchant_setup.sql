-- =========================================================
-- Internal Merchant Setup Migration
-- 补充商家端功能所需的表和字段
-- =========================================================

-- 1. 补充 invites 表：添加 venue_id 字段（可选，用于限定到特定venue）
ALTER TABLE public.invites 
ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE;

-- 2. 创建 member_venues 表（可选：用于控制员工可访问的venue）
CREATE TABLE IF NOT EXISTS public.member_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.merchant_members(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_member_venues_member ON public.member_venues(member_id);
CREATE INDEX IF NOT EXISTS idx_member_venues_venue ON public.member_venues(venue_id);

-- 3. 补充 profiles 表：添加默认 workspace 字段
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS default_merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS default_venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_default_workspace ON public.profiles(default_merchant_id, default_venue_id);

-- 4. 更新 invites 表：添加 disabled 字段（已存在则忽略）
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

-- 5. 更新 checkins 表：改进幂等性支持
-- 添加 success 字段用于部分唯一约束
ALTER TABLE public.checkins
ADD COLUMN IF NOT EXISTS success BOOLEAN NOT NULL DEFAULT false;

-- 创建部分唯一索引：同一 ticket + action 只能有一个成功记录
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkins_success_once
  ON public.checkins(ticket_id, action)
  WHERE success = true;

-- 6. 创建 requests 表（申请制系统）
CREATE TABLE IF NOT EXISTS public.requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('venue_edit','new_event','price_change','inventory_change')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
  payload JSONB NOT NULL, -- 申请内容（JSON格式）
  admin_note TEXT, -- 管理员备注
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

DROP TRIGGER IF EXISTS trg_requests_updated_at ON public.requests;
CREATE TRIGGER trg_requests_updated_at
BEFORE UPDATE ON public.requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. 创建 request_events 表（审计日志：记录请求变更）
CREATE TABLE IF NOT EXISTS public.request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  before JSONB, -- 变更前的数据
  after JSONB, -- 变更后的数据
  event_type TEXT NOT NULL CHECK (event_type IN ('created','updated','approved','rejected','withdrawn')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_events_request ON public.request_events(request_id);
CREATE INDEX IF NOT EXISTS idx_request_events_created_at ON public.request_events(created_at DESC);

-- 8. 更新 merchant_members 表的 role 约束：添加 'admin' 角色（如果需要merchant级别的admin）
DO $$ 
BEGIN
  -- 检查约束是否存在并获取当前约束值
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'merchant_members_role_check'
  ) THEN
    -- 删除旧约束
    ALTER TABLE public.merchant_members DROP CONSTRAINT IF EXISTS merchant_members_role_check;
  END IF;
  
  -- 创建新约束（包含 admin）
  ALTER TABLE public.merchant_members 
  ADD CONSTRAINT merchant_members_role_check 
  CHECK (role IN ('OWNER','MANAGER','STAFF','admin'));
END $$;

-- 9. 为 checkins 添加更多索引以优化查询
CREATE INDEX IF NOT EXISTS idx_checkins_result_created ON public.checkins(result, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_actor_venue_created ON public.checkins(actor_venue_id, created_at DESC);
