-- =========================================================
-- 015 SYNC VENUES REGION WITH MERCHANTS
-- 同步venues的region_id与merchants的region_id
-- =========================================================
-- 说明：
-- - Venue应该与其所属Merchant在同一region
-- - 更新所有venues的region_id，使其与merchants的region_id一致
-- - 如果merchant的region_id不存在，保留venue的region_id不变
-- =========================================================

-- 1. 更新venues的region_id，使其与merchants的region_id一致
UPDATE public.venues v
SET region_id = m.region_id,
    updated_at = NOW()
FROM public.merchants m
WHERE v.merchant_id = m.id
  AND v.region_id != m.region_id;

-- 2. 添加触发器：创建venue时自动使用merchant的region_id
CREATE OR REPLACE FUNCTION public.set_venue_region_from_merchant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_merchant_region_id UUID;
BEGIN
  -- 获取merchant的region_id
  SELECT region_id INTO v_merchant_region_id
  FROM public.merchants
  WHERE id = NEW.merchant_id;
  
  -- 如果merchant存在，使用merchant的region_id
  IF v_merchant_region_id IS NOT NULL THEN
    NEW.region_id := v_merchant_region_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 删除旧触发器（如果存在）
DROP TRIGGER IF EXISTS trg_set_venue_region_from_merchant ON public.venues;

-- 创建触发器：在插入venue之前自动设置region_id
CREATE TRIGGER trg_set_venue_region_from_merchant
BEFORE INSERT ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.set_venue_region_from_merchant();

-- 3. 添加触发器：当merchant的region_id更新时，自动更新venues的region_id
CREATE OR REPLACE FUNCTION public.sync_venue_regions_on_merchant_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 如果merchant的region_id发生变化，更新所有venues的region_id
  IF OLD.region_id IS DISTINCT FROM NEW.region_id THEN
    UPDATE public.venues
    SET region_id = NEW.region_id,
        updated_at = NOW()
    WHERE merchant_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 删除旧触发器（如果存在）
DROP TRIGGER IF EXISTS trg_sync_venue_regions_on_merchant_update ON public.merchants;

-- 创建触发器
CREATE TRIGGER trg_sync_venue_regions_on_merchant_update
AFTER UPDATE OF region_id ON public.merchants
FOR EACH ROW
WHEN (OLD.region_id IS DISTINCT FROM NEW.region_id)
EXECUTE FUNCTION public.sync_venue_regions_on_merchant_update();

-- 4. 添加注释
COMMENT ON FUNCTION public.set_venue_region_from_merchant() IS 
  '创建venue时自动使用merchant的region_id';

COMMENT ON FUNCTION public.sync_venue_regions_on_merchant_update() IS 
  '当merchant的region_id更新时，自动同步更新所有venues的region_id';

-- =========================================================
-- 完成
-- =========================================================

DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- 统计更新的venues数量
  SELECT COUNT(*) INTO v_updated_count
  FROM public.venues v
  INNER JOIN public.merchants m ON v.merchant_id = m.id
  WHERE v.region_id = m.region_id;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Venues region sync completed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - Updated existing venues to sync with merchants region_id';
  RAISE NOTICE '  - Created trigger: New venues auto-use merchant region_id';
  RAISE NOTICE '  - Created trigger: Merchant region changes auto-update venues';
  RAISE NOTICE '  - Venues in sync: %', v_updated_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Note:';
  RAISE NOTICE '  - New venues will automatically use merchant region_id';
  RAISE NOTICE '  - Future merchant region changes will auto-update venues';
  RAISE NOTICE '========================================';
END $$;
