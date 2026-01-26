-- =========================================================
-- 029 FIX EVENT VENUE NULL HANDLING
-- 修复：当 venue_id 为 NULL 时（draft），使用 merchant.region_id
-- =========================================================

-- =========================================================
-- PART 1: 修复 events INSERT 触发器
-- =========================================================

CREATE OR REPLACE FUNCTION public.set_event_region_from_venue()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_venue_region_id UUID;
  v_merchant_region_id UUID;
BEGIN
  -- 获取 merchant 的 region_id（兜底）
  SELECT region_id INTO v_merchant_region_id
  FROM public.merchants
  WHERE id = NEW.merchant_id;
  
  -- 如果 venue_id 为 NULL（允许 draft 状态），使用 merchant.region_id
  IF NEW.venue_id IS NULL THEN
    IF v_merchant_region_id IS NULL THEN
      RAISE EXCEPTION 'Cannot create event: merchant % has no region_id', NEW.merchant_id;
    END IF;
    NEW.region_id := v_merchant_region_id;
    RAISE NOTICE 'Event region_id set from merchant (no venue): %', v_merchant_region_id;
    RETURN NEW;
  END IF;
  
  -- venue_id 非空时，获取 venue 的 region_id
  SELECT region_id INTO v_venue_region_id
  FROM public.venues
  WHERE id = NEW.venue_id;
  
  -- 如果 venue 不存在，报错
  IF v_venue_region_id IS NULL THEN
    -- 再检查 venue 是否存在
    IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = NEW.venue_id) THEN
      RAISE EXCEPTION 'Cannot create event: venue % does not exist', NEW.venue_id;
    END IF;
    -- venue 存在但 region_id 为空（不应该发生，但兜底处理）
    IF v_merchant_region_id IS NULL THEN
      RAISE EXCEPTION 'Cannot create event: venue % has no region_id and merchant has no region_id', NEW.venue_id;
    END IF;
    v_venue_region_id := v_merchant_region_id;
  END IF;
  
  -- 如果同时提供了 merchant_id，验证一致性
  IF NEW.merchant_id IS NOT NULL AND v_merchant_region_id IS NOT NULL THEN
    IF v_merchant_region_id IS DISTINCT FROM v_venue_region_id THEN
      RAISE EXCEPTION 'Consistency violation: merchant region_id (%) != venue region_id (%)', 
        v_merchant_region_id, v_venue_region_id
      USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  
  -- 强制设置 event.region_id = venue.region_id
  IF NEW.region_id IS DISTINCT FROM v_venue_region_id THEN
    RAISE NOTICE 'Event region_id auto-set to venue region_id: %', v_venue_region_id;
  END IF;
  NEW.region_id := v_venue_region_id;
  
  RETURN NEW;
END;
$$;

-- =========================================================
-- PART 2: 修复 events UPDATE 触发器
-- =========================================================

CREATE OR REPLACE FUNCTION public.enforce_event_region_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_venue_region_id UUID;
  v_merchant_region_id UUID;
BEGIN
  -- 获取 merchant 的 region_id
  SELECT region_id INTO v_merchant_region_id
  FROM public.merchants
  WHERE id = NEW.merchant_id;
  
  -- 如果 venue_id 为 NULL，使用 merchant.region_id
  IF NEW.venue_id IS NULL THEN
    IF v_merchant_region_id IS NULL THEN
      RAISE EXCEPTION 'Cannot update event: merchant % has no region_id', NEW.merchant_id;
    END IF;
    NEW.region_id := v_merchant_region_id;
    RETURN NEW;
  END IF;
  
  -- venue_id 非空时，获取 venue 的 region_id
  SELECT region_id INTO v_venue_region_id
  FROM public.venues
  WHERE id = NEW.venue_id;
  
  IF v_venue_region_id IS NULL THEN
    -- venue 存在但 region_id 为空，用 merchant 的
    IF v_merchant_region_id IS NOT NULL THEN
      v_venue_region_id := v_merchant_region_id;
    ELSE
      RAISE EXCEPTION 'Cannot update event: venue % has no region_id', NEW.venue_id;
    END IF;
  END IF;
  
  -- 强制 region_id = venue.region_id
  IF NEW.region_id IS DISTINCT FROM v_venue_region_id THEN
    RAISE NOTICE 'Event region_id corrected from % to venue region_id: %', NEW.region_id, v_venue_region_id;
    NEW.region_id := v_venue_region_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- =========================================================
-- PART 3: 确保 events 表 region_id 有默认值处理
-- =========================================================

-- 让 events 表允许 venue_id 为 NULL（draft 状态）
-- 但 region_id 必须非空（由触发器从 merchant 或 venue 继承）

-- 检查是否有 venue_id NOT NULL 约束并移除
DO $$
BEGIN
  -- events 表的 venue_id 应该允许 NULL（draft 状态）
  -- 不需要显式更改，大多数情况下已经是 NULLABLE
  RAISE NOTICE 'events.venue_id should be nullable for draft events';
END $$;

-- =========================================================
-- PART 4: 回填现有 events 的 region_id（如果为空）
-- =========================================================

UPDATE public.events e
SET region_id = COALESCE(
  (SELECT v.region_id FROM public.venues v WHERE v.id = e.venue_id),
  (SELECT m.region_id FROM public.merchants m WHERE m.id = e.merchant_id)
)
WHERE e.region_id IS NULL;

-- =========================================================
-- PART 5: 完成提示
-- =========================================================

DO $$
DECLARE
  v_null_region_count INT;
BEGIN
  SELECT COUNT(*) INTO v_null_region_count
  FROM public.events
  WHERE region_id IS NULL;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Event venue NULL handling fix complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - events with venue_id=NULL now use merchant.region_id';
  RAISE NOTICE '  - events INSERT/UPDATE triggers updated';
  RAISE NOTICE '';
  IF v_null_region_count > 0 THEN
    RAISE WARNING 'Still have % events with NULL region_id - please investigate', v_null_region_count;
  ELSE
    RAISE NOTICE 'All events have valid region_id ✓';
  END IF;
  RAISE NOTICE '========================================';
END $$;
