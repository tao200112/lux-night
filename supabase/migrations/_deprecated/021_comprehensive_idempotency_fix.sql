-- =========================================================
-- Comprehensive Idempotency Fix
-- 全面修复幂等性问题（确保所有迁移可安全重复执行）
-- =========================================================
-- 
-- 此 migration 修复所有可能导致重复执行错误的语句：
-- 1. 修复 017 中的触发器创建
-- 2. 确保所有约束添加都有 IF NOT EXISTS 或 DROP IF EXISTS
-- 3. 确保所有索引创建都有 IF NOT EXISTS
--

-- =========================================================
-- 1. 修复 017 中的触发器创建（如果在 DO 块中）
-- =========================================================

-- 确保 normalize_invite_token 触发器存在且幂等
DROP TRIGGER IF EXISTS trg_normalize_invite_token ON public.invites;

-- 如果函数不存在，创建它
CREATE OR REPLACE FUNCTION public.normalize_invite_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- token 规范化：trim + upper（允许纯数字如 '1461'）
  NEW.token = UPPER(TRIM(NEW.token));
  RETURN NEW;
END;
$$;

-- 创建触发器
CREATE TRIGGER trg_normalize_invite_token
BEFORE INSERT OR UPDATE ON public.invites
FOR EACH ROW
EXECUTE FUNCTION public.normalize_invite_token();

-- =========================================================
-- 2. 确保所有约束都是幂等的
-- =========================================================

-- invites.intended_role 约束（如果不存在则添加）
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'invites_intended_role_check'
  ) THEN
    ALTER TABLE public.invites 
    ADD CONSTRAINT invites_intended_role_check 
    CHECK (intended_role IN ('staff','manager','owner','admin'));
  END IF;
END $$;

-- invites.issued_by_type 约束（如果不存在则添加）
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'invites_issued_by_type_check'
  ) THEN
    ALTER TABLE public.invites 
    ADD CONSTRAINT invites_issued_by_type_check 
    CHECK (issued_by_type IN ('admin','merchant'));
  END IF;
END $$;

-- invites.token 唯一约束（如果不存在则添加）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'invites_token_key'
  ) THEN
    ALTER TABLE public.invites ADD CONSTRAINT invites_token_key UNIQUE (token);
  END IF;
END $$;

-- merchant_members.role 约束（确保是小写）
DO $$ 
BEGIN
  -- 先删除旧约束（如果有）
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'merchant_members_role_check'
  ) THEN
    ALTER TABLE public.merchant_members DROP CONSTRAINT merchant_members_role_check;
  END IF;
  
  -- 创建新约束（小写）
  ALTER TABLE public.merchant_members 
  ADD CONSTRAINT merchant_members_role_check 
  CHECK (role IN ('staff','manager','owner','admin'));
END $$;

-- =========================================================
-- 3. 确保所有外键都是幂等的
-- =========================================================

-- invites.created_by 外键（如果不存在则添加）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'invites_created_by_fkey'
  ) THEN
    ALTER TABLE public.invites
    ADD CONSTRAINT invites_created_by_fkey 
    FOREIGN KEY (created_by) 
    REFERENCES auth.users(id) 
    ON DELETE SET NULL;
  END IF;
END $$;

-- =========================================================
-- 4. 确保所有索引都是幂等的（已有 IF NOT EXISTS，这里只验证）
-- =========================================================

-- 所有索引创建都使用 IF NOT EXISTS，所以不需要额外处理

-- =========================================================
-- 5. 确保所有触发器都是幂等的（已在其他迁移中修复）
-- =========================================================

-- 所有触发器创建前都已添加 DROP TRIGGER IF EXISTS
