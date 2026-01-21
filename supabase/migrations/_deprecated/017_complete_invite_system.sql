-- =========================================================
-- Complete Invite System: Add issued_by_type and Fix All Issues
-- 完善邀请码系统：添加 issued_by_type 并修复所有问题
-- =========================================================
-- 
-- 此 migration 完善邀请码系统：
-- 1. 添加 issued_by_type 字段（区分 admin/merchant 两类邀请码）
-- 2. 修复 created_by 外键（允许 NULL，使用系统用户作为默认）
-- 3. 确保所有约束和索引正确
-- 4. 更新现有数据（设置默认 issued_by_type）
--

-- =========================================================
-- 1. 添加 issued_by_type 字段
-- =========================================================

-- 添加 issued_by_type 字段（如果不存在）
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

-- 如果字段已存在但没有约束，添加约束
DO $$ 
BEGIN
  -- 检查是否需要添加约束
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'invites_issued_by_type_check'
  ) THEN
    -- 先更新现有数据
    UPDATE public.invites
    SET issued_by_type = 'merchant'
    WHERE issued_by_type IS NULL OR issued_by_type NOT IN ('admin','merchant');
    
    -- 添加约束
    ALTER TABLE public.invites 
    ADD CONSTRAINT invites_issued_by_type_check 
    CHECK (issued_by_type IN ('admin','merchant'));
  END IF;
END $$;

-- =========================================================
-- 2. 修复 created_by 外键（允许 NULL）
-- =========================================================

-- 先删除旧外键（如果存在）
ALTER TABLE public.invites
DROP CONSTRAINT IF EXISTS invites_created_by_fkey;

-- 创建新外键（允许 NULL，删除时 SET NULL）
ALTER TABLE public.invites
ADD CONSTRAINT invites_created_by_fkey 
FOREIGN KEY (created_by) 
REFERENCES auth.users(id) 
ON DELETE SET NULL;

-- 允许 created_by 为 NULL（如果当前不允许）
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

-- =========================================================
-- 3. 确保 token 规范化触发器存在
-- =========================================================

-- 触发器已在 011_fix_invite_system.sql 中创建，这里确保存在
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_normalize_invite_token'
  ) THEN
    -- 创建函数
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
    
    -- 创建触发器（先删除再创建，确保幂等）
    DROP TRIGGER IF EXISTS trg_normalize_invite_token ON public.invites;
    CREATE TRIGGER trg_normalize_invite_token
    BEFORE INSERT OR UPDATE ON public.invites
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_invite_token();
  END IF;
END $$;

-- =========================================================
-- 4. 添加索引优化
-- =========================================================

-- issued_by_type 索引
CREATE INDEX IF NOT EXISTS idx_invites_issued_by_type ON public.invites(issued_by_type);

-- token 索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_invites_token ON public.invites(token) WHERE is_active = true AND disabled = false;

-- =========================================================
-- 5. 确保所有约束正确
-- =========================================================

-- intended_role 约束（小写）
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

-- token 唯一约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'invites_token_key'
  ) THEN
    ALTER TABLE public.invites ADD CONSTRAINT invites_token_key UNIQUE (token);
  END IF;
END $$;

-- =========================================================
-- 6. 更新现有数据的 issued_by_type
-- =========================================================

-- 如果现有数据的 issued_by_type 为空或无效，设置为 'merchant'
UPDATE public.invites
SET issued_by_type = 'merchant'
WHERE issued_by_type IS NULL 
   OR issued_by_type NOT IN ('admin','merchant');

-- =========================================================
-- 7. 创建系统用户获取函数（用于 created_by 默认值）
-- =========================================================

-- 获取系统用户 ID（第一个 admin 或第一个用户）
CREATE OR REPLACE FUNCTION public.get_system_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- 优先查找 admin 用户
  SELECT au.user_id
  FROM public.admin_users au
  WHERE au.is_active = true
  LIMIT 1
  UNION ALL
  -- 如果没有 admin，查找第一个用户
  SELECT id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1
  LIMIT 1;
$$;

-- 授权
REVOKE ALL ON FUNCTION public.get_system_user_id() FROM public;
GRANT EXECUTE ON FUNCTION public.get_system_user_id() TO authenticated;
