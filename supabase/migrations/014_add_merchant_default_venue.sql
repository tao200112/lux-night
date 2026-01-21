-- =========================================================
-- 014 ADD MERCHANT DEFAULT VENUE
-- 为 merchants 表添加 default_venue_id 字段
-- =========================================================
-- 说明：
-- - 每个 Merchant 绑定 1 个主 Venue（default_venue_id）
-- - 创建活动时自动使用该 Merchant 的主 Venue
-- - 支持未来扩展多场地（通过 merchant_venues 表）
-- =========================================================

-- 1. 添加 default_venue_id 字段到 merchants 表
ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS default_venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL;

-- 2. 创建索引（用于快速查询）
CREATE INDEX IF NOT EXISTS idx_merchants_default_venue ON public.merchants(default_venue_id);
CREATE INDEX IF NOT EXISTS idx_merchants_default_venue_not_null ON public.merchants(default_venue_id) WHERE default_venue_id IS NOT NULL;

-- 3. 添加注释
COMMENT ON COLUMN public.merchants.default_venue_id IS 'Primary venue for this merchant. Used as default when creating events.';

-- 4. 处理历史数据：为已有 merchant 自动补 default venue
-- 规则：如果该 merchant 已有 venues，选择第一个 active venue 作为 default
DO $$
DECLARE
  v_merchant RECORD;
  v_default_venue_id UUID;
BEGIN
  -- 遍历所有没有 default_venue_id 的 merchant
  FOR v_merchant IN 
    SELECT id FROM public.merchants WHERE default_venue_id IS NULL
  LOOP
    -- 查找该 merchant 的第一个 active venue
    SELECT id INTO v_default_venue_id
    FROM public.venues
    WHERE merchant_id = v_merchant.id
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;
    
    -- 如果找到，设置为 default
    IF v_default_venue_id IS NOT NULL THEN
      UPDATE public.merchants
      SET default_venue_id = v_default_venue_id
      WHERE id = v_merchant.id;
      
      RAISE NOTICE 'Set default venue % for merchant %', v_default_venue_id, v_merchant.id;
    END IF;
  END LOOP;
END $$;

-- 5. 添加约束：确保 default_venue_id 属于该 merchant（可选，但推荐）
-- 注意：这个约束会在数据库层面确保数据一致性
-- 但由于外键已经存在，这个约束可能不是必需的
-- 如果需要，可以添加 CHECK 约束：
-- ALTER TABLE public.merchants
-- ADD CONSTRAINT check_default_venue_belongs_to_merchant
-- CHECK (
--   default_venue_id IS NULL 
--   OR EXISTS (
--     SELECT 1 FROM public.venues 
--     WHERE id = default_venue_id AND merchant_id = merchants.id
--   )
-- );

-- =========================================================
-- 完成
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Merchant default venue migration completed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - Added default_venue_id column to merchants table';
  RAISE NOTICE '  - Created indexes for performance';
  RAISE NOTICE '  - Auto-populated default venues for existing merchants';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  - Merchants without venues will have default_venue_id = NULL';
  RAISE NOTICE '  - Admin can set default_venue_id via API or Dashboard';
  RAISE NOTICE '========================================';
END $$;
