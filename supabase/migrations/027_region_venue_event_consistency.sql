-- =========================================================
-- 027 REGION VENUE EVENT CONSISTENCY
-- 强制一致性约束：event.region_id == venue.region_id == merchant.region_id
-- =========================================================
-- 说明：
-- 1. venues.region_id 必须等于 merchants.region_id（已有触发器，此处加强）
-- 2. events.region_id 必须等于 venues.region_id（新增触发器）
-- 3. 不允许手动选择 region，region 必须自动继承
-- =========================================================

-- =========================================================
-- PART 1: 确保 regions 表字段完整
-- =========================================================

-- 确保 regions 有 slug 字段（唯一索引）
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_regions_slug ON public.regions(slug) WHERE slug IS NOT NULL;

-- 确保 regions 唯一约束：(country, state, city/name)
-- 已有 UNIQUE(name, state, country)，符合要求

-- =========================================================
-- PART 2: 强化 venues 一致性约束
-- =========================================================

-- 2.1 验证已有触发器存在（INSERT 时自动继承 merchant.region_id）
-- 如果不存在，创建它
CREATE OR REPLACE FUNCTION public.set_venue_region_from_merchant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_merchant_region_id UUID;
BEGIN
  -- 获取 merchant 的 region_id
  SELECT region_id INTO v_merchant_region_id
  FROM public.merchants
  WHERE id = NEW.merchant_id;
  
  -- 强制使用 merchant 的 region_id（不允许手动指定不同的值）
  IF v_merchant_region_id IS NOT NULL THEN
    IF NEW.region_id IS DISTINCT FROM v_merchant_region_id THEN
      RAISE NOTICE 'Venue region_id auto-set to merchant region_id: %', v_merchant_region_id;
    END IF;
    NEW.region_id := v_merchant_region_id;
  ELSE
    -- Merchant 必须有 region_id
    RAISE EXCEPTION 'Cannot create venue: merchant % has no region_id', NEW.merchant_id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_venue_region_from_merchant ON public.venues;
CREATE TRIGGER trg_set_venue_region_from_merchant
BEFORE INSERT ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.set_venue_region_from_merchant();

-- 2.2 UPDATE 时也强制一致性（不允许手动修改 venue.region_id）
CREATE OR REPLACE FUNCTION public.enforce_venue_region_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_merchant_region_id UUID;
BEGIN
  -- 获取 merchant 的 region_id
  SELECT region_id INTO v_merchant_region_id
  FROM public.merchants
  WHERE id = NEW.merchant_id;
  
  -- 如果尝试设置不同的 region_id，强制覆盖
  IF NEW.region_id IS DISTINCT FROM v_merchant_region_id THEN
    RAISE NOTICE 'Venue region_id corrected from % to merchant region_id: %', NEW.region_id, v_merchant_region_id;
    NEW.region_id := v_merchant_region_id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_venue_region_consistency ON public.venues;
CREATE TRIGGER trg_enforce_venue_region_consistency
BEFORE UPDATE ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.enforce_venue_region_consistency();

-- =========================================================
-- PART 3: events 一致性约束
-- =========================================================

-- 3.1 INSERT 时自动设置 event.region_id = venue.region_id
CREATE OR REPLACE FUNCTION public.set_event_region_from_venue()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_venue_region_id UUID;
  v_merchant_region_id UUID;
BEGIN
  -- 获取 venue 的 region_id
  SELECT region_id INTO v_venue_region_id
  FROM public.venues
  WHERE id = NEW.venue_id;
  
  IF v_venue_region_id IS NULL THEN
    RAISE EXCEPTION 'Cannot create event: venue % has no region_id', NEW.venue_id;
  END IF;
  
  -- 如果同时提供了 merchant_id，验证一致性
  IF NEW.merchant_id IS NOT NULL THEN
    SELECT region_id INTO v_merchant_region_id
    FROM public.merchants
    WHERE id = NEW.merchant_id;
    
    IF v_merchant_region_id IS DISTINCT FROM v_venue_region_id THEN
      RAISE EXCEPTION 'Consistency violation: merchant region_id (%) != venue region_id (%)', 
        v_merchant_region_id, v_venue_region_id;
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

DROP TRIGGER IF EXISTS trg_set_event_region_from_venue ON public.events;
CREATE TRIGGER trg_set_event_region_from_venue
BEFORE INSERT ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.set_event_region_from_venue();

-- 3.2 UPDATE 时也强制一致性
CREATE OR REPLACE FUNCTION public.enforce_event_region_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_venue_region_id UUID;
BEGIN
  -- 获取 venue 的 region_id（如果 venue_id 变了）
  SELECT region_id INTO v_venue_region_id
  FROM public.venues
  WHERE id = NEW.venue_id;
  
  IF v_venue_region_id IS NULL THEN
    RAISE EXCEPTION 'Cannot update event: venue % has no region_id', NEW.venue_id;
  END IF;
  
  -- 强制 region_id = venue.region_id
  IF NEW.region_id IS DISTINCT FROM v_venue_region_id THEN
    RAISE NOTICE 'Event region_id corrected from % to venue region_id: %', NEW.region_id, v_venue_region_id;
    NEW.region_id := v_venue_region_id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_event_region_consistency ON public.events;
CREATE TRIGGER trg_enforce_event_region_consistency
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.enforce_event_region_consistency();

-- =========================================================
-- PART 4: venues.address_line1 NOT NULL（仅对新记录）
-- =========================================================
-- 注意：不对现有记录强制，避免阻断现有数据
-- 通过 CHECK 约束实现：新插入时必须有 address_line1

-- 先检查是否已有 CHECK 约束
DO $$
BEGIN
  -- 如果 address_line1 列不存在，先添加
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'address_line1'
  ) THEN
    ALTER TABLE public.venues ADD COLUMN address_line1 TEXT;
    RAISE NOTICE 'Added address_line1 column to venues';
  END IF;
END $$;

-- 添加 CHECK 约束：新插入时 address_line1 不能为空
-- 使用触发器代替 CHECK，因为 CHECK 会影响现有数据
CREATE OR REPLACE FUNCTION public.require_venue_address_line1()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.address_line1 IS NULL OR TRIM(NEW.address_line1) = '' THEN
    RAISE EXCEPTION 'venues.address_line1 is required for new venues';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_venue_address_line1 ON public.venues;
CREATE TRIGGER trg_require_venue_address_line1
BEFORE INSERT ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.require_venue_address_line1();

-- =========================================================
-- PART 5: 添加注释
-- =========================================================

COMMENT ON FUNCTION public.set_venue_region_from_merchant() IS 
  'Venue INSERT: auto-set region_id from merchant.region_id. Not user-selectable.';

COMMENT ON FUNCTION public.enforce_venue_region_consistency() IS 
  'Venue UPDATE: enforce region_id = merchant.region_id. Cannot be manually changed.';

COMMENT ON FUNCTION public.set_event_region_from_venue() IS 
  'Event INSERT: auto-set region_id from venue.region_id. Not user-selectable.';

COMMENT ON FUNCTION public.enforce_event_region_consistency() IS 
  'Event UPDATE: enforce region_id = venue.region_id. Cannot be manually changed.';

COMMENT ON FUNCTION public.require_venue_address_line1() IS 
  'Venue INSERT: require non-empty address_line1 for new venues.';

-- =========================================================
-- 完成
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Region-Venue-Event consistency migration complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'New Constraints:';
  RAISE NOTICE '  - venues.region_id auto-set from merchant on INSERT';
  RAISE NOTICE '  - venues.region_id enforced on UPDATE';
  RAISE NOTICE '  - events.region_id auto-set from venue on INSERT';
  RAISE NOTICE '  - events.region_id enforced on UPDATE';
  RAISE NOTICE '  - venues.address_line1 required for new INSERT';
  RAISE NOTICE '';
  RAISE NOTICE 'Consistency Rule:';
  RAISE NOTICE '  event.region_id == venue.region_id == merchant.region_id';
  RAISE NOTICE '========================================';
END $$;
