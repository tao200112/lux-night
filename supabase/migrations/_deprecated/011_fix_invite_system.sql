-- =========================================================
-- Fix Invite System: 统一角色为小写，修复约束和外键
-- =========================================================
-- 
-- 此 migration 修复以下问题：
-- 1. 统一角色为小写 ('staff','manager','owner','admin')
-- 2. 修复 invites 表约束（expires_at 可为 NULL，添加 disabled 字段）
-- 3. 添加 venue_id 归属校验（venue 必须属于 merchant）
-- 4. 移除硬编码 UUID 示例数据
--

-- =========================================================
-- 1. 修复 merchant_members 表：统一角色为小写
-- =========================================================

-- 先更新现有数据（如果有）
UPDATE public.merchant_members
SET role = LOWER(role)
WHERE role IN ('OWNER', 'MANAGER', 'STAFF', 'Admin', 'Admin');

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

-- 创建新约束（统一为小写）
ALTER TABLE public.merchant_members 
ADD CONSTRAINT merchant_members_role_check 
CHECK (role IN ('staff','manager','owner','admin'));

-- =========================================================
-- 2. 修复 invites 表：统一角色、修复约束
-- =========================================================

-- 更新现有数据（如果有）
UPDATE public.invites
SET intended_role = LOWER(intended_role),
    token = UPPER(TRIM(token))
WHERE intended_role IN ('OWNER', 'MANAGER', 'STAFF', 'Admin', 'Admin');

-- 删除旧约束
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'invites_intended_role_check'
  ) THEN
    ALTER TABLE public.invites DROP CONSTRAINT invites_intended_role_check;
  END IF;
END $$;

-- 修复 invites 表结构
-- 1. expires_at 改为可为 NULL（永久有效）
ALTER TABLE public.invites 
ALTER COLUMN expires_at DROP NOT NULL;

-- 2. 确保 disabled 字段存在
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

-- 3. 确保 venue_id 字段存在
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'invites' 
    AND column_name = 'venue_id'
  ) THEN
    ALTER TABLE public.invites 
    ADD COLUMN venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. 修复 created_by 外键（ON DELETE SET NULL，因为可能需要删除用户）
ALTER TABLE public.invites
DROP CONSTRAINT IF EXISTS invites_created_by_fkey;

ALTER TABLE public.invites
ADD CONSTRAINT invites_created_by_fkey 
FOREIGN KEY (created_by) 
REFERENCES auth.users(id) 
ON DELETE SET NULL;

-- 5. 创建新约束（统一为小写）
ALTER TABLE public.invites 
ADD CONSTRAINT invites_intended_role_check 
CHECK (intended_role IN ('staff','manager','owner','admin'));

-- 6. 添加 token 唯一约束（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'invites_token_key'
  ) THEN
    ALTER TABLE public.invites ADD CONSTRAINT invites_token_key UNIQUE (token);
  END IF;
END $$;

-- 7. 创建函数：在插入/更新前统一 token 为大写
CREATE OR REPLACE FUNCTION public.normalize_invite_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.token = UPPER(TRIM(NEW.token));
  RETURN NEW;
END;
$$;

-- 创建触发器：自动统一 token 大小写
DROP TRIGGER IF EXISTS trg_normalize_invite_token ON public.invites;
CREATE TRIGGER trg_normalize_invite_token
BEFORE INSERT OR UPDATE ON public.invites
FOR EACH ROW
EXECUTE FUNCTION public.normalize_invite_token();

-- =========================================================
-- 3. 添加 venue_id 归属校验函数
-- =========================================================

CREATE OR REPLACE FUNCTION public.validate_venue_belongs_to_merchant(
  p_venue_id UUID,
  p_merchant_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 如果 venue_id 为 NULL，则不需要校验
  IF p_venue_id IS NULL THEN
    RETURN true;
  END IF;
  
  -- 检查 venue 是否属于该 merchant
  RETURN EXISTS (
    SELECT 1 FROM public.venues
    WHERE id = p_venue_id
      AND merchant_id = p_merchant_id
  );
END;
$$;

-- =========================================================
-- 4. 添加索引优化
-- =========================================================

-- invites 表索引
CREATE INDEX IF NOT EXISTS idx_invites_token_lower ON public.invites(UPPER(TRIM(token)));
CREATE INDEX IF NOT EXISTS idx_invites_merchant_active ON public.invites(merchant_id, disabled, is_active);
CREATE INDEX IF NOT EXISTS idx_invites_venue ON public.invites(venue_id) WHERE venue_id IS NOT NULL;

-- =========================================================
-- 5. 清理硬编码的示例数据（如果有）
-- =========================================================

-- 删除包含硬编码 UUID 的 invites（如果存在）
DELETE FROM public.invites
WHERE merchant_id IN (
  SELECT id FROM public.merchants 
  WHERE id = '00000000-0000-0000-0000-000000000001'::UUID
     OR id = '00000000-0000-0000-0000-000000000002'::UUID
);

DELETE FROM public.merchant_members
WHERE merchant_id IN (
  SELECT id FROM public.merchants 
  WHERE id = '00000000-0000-0000-0000-000000000001'::UUID
     OR id = '00000000-0000-0000-0000-000000000002'::UUID
);

DELETE FROM public.venues
WHERE merchant_id IN (
  SELECT id FROM public.merchants 
  WHERE id = '00000000-0000-0000-0000-000000000001'::UUID
     OR id = '00000000-0000-0000-0000-000000000002'::UUID
);

DELETE FROM public.merchants
WHERE id = '00000000-0000-0000-0000-000000000001'::UUID
   OR id = '00000000-0000-0000-0000-000000000002'::UUID;
