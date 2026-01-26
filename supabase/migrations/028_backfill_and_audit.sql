-- =========================================================
-- 028 BACKFILL AND AUDIT
-- 回填现有数据 + 审计不一致记录
-- =========================================================
-- 说明：
-- 1. 回填 venues.region_id 从 merchants.region_id
-- 2. 回填 events.region_id 从 venues.region_id
-- 3. 输出不一致记录供人工处理
-- =========================================================

-- =========================================================
-- PART 1: 回填 venues.region_id
-- =========================================================

-- 1.1 更新 venues.region_id = merchants.region_id（如果不一致）
UPDATE public.venues v
SET 
  region_id = m.region_id,
  updated_at = NOW()
FROM public.merchants m
WHERE v.merchant_id = m.id
  AND (v.region_id IS NULL OR v.region_id IS DISTINCT FROM m.region_id);

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[BACKFILL] Updated % venues with correct region_id from merchants', v_count;
END $$;

-- =========================================================
-- PART 2: 回填 events.region_id
-- =========================================================

-- 2.1 更新 events.region_id = venues.region_id（如果不一致）
UPDATE public.events e
SET 
  region_id = v.region_id,
  updated_at = NOW()
FROM public.venues v
WHERE e.venue_id = v.id
  AND e.venue_id IS NOT NULL
  AND (e.region_id IS NULL OR e.region_id IS DISTINCT FROM v.region_id);

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[BACKFILL] Updated % events with correct region_id from venues', v_count;
END $$;

-- 2.2 对于 venue_id 为空的 events，从 merchants.region_id 回填
UPDATE public.events e
SET 
  region_id = m.region_id,
  updated_at = NOW()
FROM public.merchants m
WHERE e.merchant_id = m.id
  AND e.venue_id IS NULL
  AND e.region_id IS NULL;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE WARNING '[BACKFILL] Updated % events without venue_id, using merchant region_id (these need venue assignment)', v_count;
  END IF;
END $$;

-- =========================================================
-- PART 3: 审计不一致记录
-- =========================================================

-- 3.1 审计：venues 的 region_id 与 merchant 不一致（应该已修复）
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.venues v
  INNER JOIN public.merchants m ON v.merchant_id = m.id
  WHERE v.region_id IS DISTINCT FROM m.region_id;
  
  IF v_count > 0 THEN
    RAISE WARNING '[AUDIT] Found % venues with region_id != merchant.region_id (should be 0 after backfill)', v_count;
  ELSE
    RAISE NOTICE '[AUDIT] ✅ All venues have consistent region_id with merchants';
  END IF;
END $$;

-- 3.2 审计：events 的 region_id 与 venue 不一致（应该已修复）
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.events e
  INNER JOIN public.venues v ON e.venue_id = v.id
  WHERE e.region_id IS DISTINCT FROM v.region_id;
  
  IF v_count > 0 THEN
    RAISE WARNING '[AUDIT] Found % events with region_id != venue.region_id (should be 0 after backfill)', v_count;
  ELSE
    RAISE NOTICE '[AUDIT] ✅ All events have consistent region_id with venues';
  END IF;
END $$;

-- 3.3 审计：events 没有 venue_id（需人工处理）
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.events
  WHERE venue_id IS NULL;
  
  IF v_count > 0 THEN
    RAISE WARNING '[AUDIT] ⚠️ Found % events without venue_id. These need manual venue assignment.', v_count;
    RAISE NOTICE 'Run the following query to list them:';
    RAISE NOTICE 'SELECT id, title, merchant_id, region_id, status, created_at FROM public.events WHERE venue_id IS NULL ORDER BY created_at DESC;';
  ELSE
    RAISE NOTICE '[AUDIT] ✅ All events have venue_id';
  END IF;
END $$;

-- 3.4 审计：merchants 没有任何 venue
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.merchants m
  WHERE NOT EXISTS (
    SELECT 1 FROM public.venues v WHERE v.merchant_id = m.id
  );
  
  IF v_count > 0 THEN
    RAISE NOTICE '[AUDIT] ℹ️ Found % merchants without any venues. This is allowed but noted.', v_count;
  ELSE
    RAISE NOTICE '[AUDIT] ✅ All merchants have at least one venue';
  END IF;
END $$;

-- 3.5 审计：venues 没有 address_line1（旧数据）
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.venues
  WHERE address_line1 IS NULL OR TRIM(address_line1) = '';
  
  IF v_count > 0 THEN
    RAISE NOTICE '[AUDIT] ℹ️ Found % venues without address_line1 (legacy data, allowed but should update)', v_count;
  ELSE
    RAISE NOTICE '[AUDIT] ✅ All venues have address_line1';
  END IF;
END $$;

-- =========================================================
-- PART 4: 为旧 venues 回填 address_line1 (从 formatted_address 或 address)
-- =========================================================

-- 尝试从 formatted_address 或 address 提取第一行作为 address_line1
UPDATE public.venues
SET address_line1 = COALESCE(
  SPLIT_PART(formatted_address, ',', 1),
  SPLIT_PART(address, ',', 1),
  'Address TBD'
)
WHERE address_line1 IS NULL OR TRIM(address_line1) = '';

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE NOTICE '[BACKFILL] Populated address_line1 for % venues from formatted_address/address', v_count;
  END IF;
END $$;

-- =========================================================
-- 完成
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Backfill and audit complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - venues.region_id synced with merchants';
  RAISE NOTICE '  - events.region_id synced with venues';
  RAISE NOTICE '  - venues.address_line1 populated for legacy data';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  - Review any WARNING messages above';
  RAISE NOTICE '  - Assign venues to events that have venue_id = NULL';
  RAISE NOTICE '========================================';
END $$;
