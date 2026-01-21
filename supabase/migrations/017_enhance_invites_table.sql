-- =========================================================
-- 017 ENHANCE INVITES TABLE
-- 增强 invites 表，添加管理所需字段
-- =========================================================

-- 1. 添加 revoked_at 字段（用于追踪撤销时间）
ALTER TABLE public.invites
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL;

-- 2. 确保 merchant_id 可以为 NULL（用于创建新商家）
-- 检查当前约束
DO $$
BEGIN
  -- 如果 merchant_id 有 NOT NULL 约束，需要先删除外键约束，然后修改
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'invites' 
    AND constraint_name LIKE '%merchant%'
    AND constraint_type = 'FOREIGN KEY'
  ) THEN
    -- 删除外键约束（如果存在）
    ALTER TABLE public.invites
    DROP CONSTRAINT IF EXISTS invites_merchant_id_fkey;
  END IF;
  
  -- 修改 merchant_id 为可空
  ALTER TABLE public.invites
  ALTER COLUMN merchant_id DROP NOT NULL;
  
  -- 重新添加外键约束（允许 NULL）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'invites' 
    AND constraint_name = 'invites_merchant_id_fkey'
  ) THEN
    ALTER TABLE public.invites
    ADD CONSTRAINT invites_merchant_id_fkey
    FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. 确保 region_id 可以为 NULL（虽然通常应该有，但为了兼容性）
ALTER TABLE public.invites
ALTER COLUMN region_id DROP NOT NULL;

-- 4. 添加索引
CREATE INDEX IF NOT EXISTS idx_invites_revoked_at ON public.invites(revoked_at) WHERE revoked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invites_status ON public.invites(disabled, is_active, expires_at, used_count, max_uses);

-- 5. 添加注释
COMMENT ON COLUMN public.invites.revoked_at IS 'Timestamp when invite was revoked by admin';
COMMENT ON COLUMN public.invites.merchant_id IS 'Merchant ID (NULL means create new merchant)';
COMMENT ON COLUMN public.invites.region_id IS 'Region ID (required for new merchant creation)';

-- =========================================================
-- 完成
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Invites table enhancement completed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - Added revoked_at column';
  RAISE NOTICE '  - Made merchant_id nullable';
  RAISE NOTICE '  - Made region_id nullable';
  RAISE NOTICE '  - Added indexes for performance';
  RAISE NOTICE '========================================';
END $$;
