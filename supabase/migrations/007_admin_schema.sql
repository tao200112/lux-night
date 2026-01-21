-- =========================================================
-- 007 ADMIN SCHEMA - Admin Portal Database Extensions
-- Admin 端口数据库扩展
-- =========================================================
-- 说明：
-- - 扩展现有 schema 支持 Admin 功能
-- - admin_requests: 审批中心（复用 requests 或新建）
-- - invite_codes: 商家一次性邀请码（扩展 invites）
-- - audit_logs: 审计日志（所有 admin 操作的完整记录）
-- - regions: 添加 status 字段（Operational/Maintenance）
-- =========================================================

-- =========================================================
-- 1. 扩展 regions 表：添加 status 字段
-- =========================================================
ALTER TABLE public.regions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Operational' 
CHECK (status IN ('Operational', 'Maintenance'));

CREATE INDEX IF NOT EXISTS idx_regions_status ON public.regions(status);

COMMENT ON COLUMN public.regions.status IS 'Region operational status: Operational or Maintenance';

-- =========================================================
-- 2. 扩展 invites 表：支持一次性邀请码（admin 创建）
-- =========================================================
-- 添加 region_id（如果不存在）用于 admin 创建邀请码时绑定地区
ALTER TABLE public.invites 
ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES public.regions(id);

-- 添加 redeemed_by, redeemed_at 用于追踪
ALTER TABLE public.invites 
ADD COLUMN IF NOT EXISTS redeemed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invites_region ON public.invites(region_id) WHERE region_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invites_redeemed_by ON public.invites(redeemed_by) WHERE redeemed_by IS NOT NULL;

COMMENT ON COLUMN public.invites.region_id IS 'Region for admin-created merchant invites';
COMMENT ON COLUMN public.invites.redeemed_by IS 'User who redeemed the invite';
COMMENT ON COLUMN public.invites.redeemed_at IS 'Timestamp when invite was redeemed';

-- =========================================================
-- 3. 扩展 requests 表：支持 admin 审批流程
-- =========================================================
-- 添加 payload_before 和 payload_after 用于 Before/After 对比
ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS payload_before JSONB,
ADD COLUMN IF NOT EXISTS payload_after JSONB;

-- 如果 payload 已存在但没有 payload_after，迁移数据
UPDATE public.requests 
SET payload_after = payload 
WHERE payload_after IS NULL AND payload IS NOT NULL;

-- 更新 type 支持 PRICE_CHANGE 和 EVENT_EDIT
ALTER TABLE public.requests 
DROP CONSTRAINT IF EXISTS requests_type_check;

ALTER TABLE public.requests 
ADD CONSTRAINT requests_type_check 
CHECK (type IN ('venue_edit', 'new_event', 'price_change', 'inventory_change', 'EVENT_EDIT', 'PRICE_CHANGE'));

COMMENT ON COLUMN public.requests.payload_before IS 'Original state before change (for comparison)';
COMMENT ON COLUMN public.requests.payload_after IS 'Proposed state after change (for comparison)';

-- =========================================================
-- 4. 创建 audit_logs 表：审计日志
-- =========================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

COMMENT ON TABLE public.audit_logs IS 'Complete audit trail of all admin operations';
COMMENT ON COLUMN public.audit_logs.actor_id IS 'User who performed the action';
COMMENT ON COLUMN public.audit_logs.action IS 'Action type: approve, reject, update, create, delete, etc.';
COMMENT ON COLUMN public.audit_logs.entity_type IS 'Entity type: request, merchant, event, order, invite, etc.';
COMMENT ON COLUMN public.audit_logs.entity_id IS 'Entity ID (if applicable)';
COMMENT ON COLUMN public.audit_logs.before_state IS 'State before action';
COMMENT ON COLUMN public.audit_logs.after_state IS 'State after action';
COMMENT ON COLUMN public.audit_logs.metadata IS 'Additional metadata (note, reason, etc.)';

-- =========================================================
-- 5. 创建 export_tasks 表：数据导出任务
-- =========================================================
CREATE TABLE IF NOT EXISTS public.export_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('orders', 'merchants', 'events', 'customers', 'revenue')),
  status TEXT NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING', 'READY', 'FAILED')),
  format TEXT NOT NULL DEFAULT 'CSV' CHECK (format IN ('CSV', 'JSON', 'XLSX')),
  date_range_start TIMESTAMPTZ,
  date_range_end TIMESTAMPTZ,
  region_id UUID REFERENCES public.regions(id),
  merchant_id UUID REFERENCES public.merchants(id),
  filters JSONB,
  file_url TEXT,
  file_size_bytes BIGINT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_export_tasks_created_by ON public.export_tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_export_tasks_status ON public.export_tasks(status);
CREATE INDEX IF NOT EXISTS idx_export_tasks_created_at ON public.export_tasks(created_at DESC);

COMMENT ON TABLE public.export_tasks IS 'Data export tasks for admin';
COMMENT ON COLUMN public.export_tasks.file_url IS 'URL to download exported file (Supabase Storage)';

-- =========================================================
-- 6. 创建 Helper Function: is_admin()
-- =========================================================
-- 注意：002_rls.sql 中可能已有此函数，这里确保存在
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  SELECT EXISTS (
    SELECT 1 
    FROM public.admin_users 
    WHERE user_id = v_user_id 
      AND is_active = true
  ) INTO v_is_admin;
  
  RETURN COALESCE(v_is_admin, FALSE);
END;
$$;

COMMENT ON FUNCTION public.is_admin() IS 'Check if current user is an admin';

-- =========================================================
-- 7. 创建 Helper Function: log_audit()
-- =========================================================
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_before_state JSONB DEFAULT NULL,
  p_after_state JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID;
  v_audit_id UUID;
BEGIN
  v_actor_id := auth.uid();
  
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: Must be logged in to create audit log';
  END IF;
  
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state,
    metadata
  )
  VALUES (
    v_actor_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_before_state,
    p_after_state,
    p_metadata
  )
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$;

COMMENT ON FUNCTION public.log_audit(TEXT, TEXT, UUID, JSONB, JSONB, JSONB) IS 'Create audit log entry';

-- =========================================================
-- 完成
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Admin schema extensions created!';
  RAISE NOTICE '   - regions.status added';
  RAISE NOTICE '   - invites extended (region_id, redeemed_by, redeemed_at)';
  RAISE NOTICE '   - requests extended (payload_before, payload_after)';
  RAISE NOTICE '   - audit_logs table created';
  RAISE NOTICE '   - export_tasks table created';
  RAISE NOTICE '   - Helper functions: is_admin(), log_audit()';
  RAISE NOTICE '========================================';
END $$;
