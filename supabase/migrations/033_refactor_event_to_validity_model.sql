-- =========================================================
-- 033 REFACTOR EVENT MODEL TO VALIDITY WINDOW + WEEKLY SCHEDULES
-- 完全重构活动模型：从单次事件改为长期配置 + 周期性销售
-- =========================================================
--
-- 业务模型变更：
-- - Event = 长期有效的配置（validity date range）
-- - Event 不依赖 venue/region（从 merchant 继承）
-- - 售票基于周期性 weekly schedule（7天配置）
-- - 购买的票绑定到具体日期并自动过期
--
-- =========================================================

-- =========================================================
-- STEP 1: 移除旧的单次事件模型字段约束
-- =========================================================

-- 1.1 移除 region_id 的 NOT NULL 约束
-- region 将从 merchant 自动继承，不需要在 event 层强制
ALTER TABLE public.events 
ALTER COLUMN region_id DROP NOT NULL;

-- 1.2 已有的 nullable 字段 (031/032 已完成)
-- venue_id, start_at, end_at, title 已经是 NULLABLE

-- =========================================================
-- STEP 2: 添加新的 validity window 字段
-- =========================================================

-- 2.1 添加有效期起始日期
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS validity_start_date DATE DEFAULT NULL;

-- 2.2 添加有效期结束日期  
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS validity_end_date DATE DEFAULT NULL;

-- 2.3 添加 schedule_mode 以区分模式
-- 'single' = 传统单次事件（使用 start_at/end_at）
-- 'weekly' = 新的周期性模式（使用 validity dates + weekly rules）
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS schedule_mode TEXT DEFAULT 'weekly' CHECK (schedule_mode IN ('single', 'weekly'));

-- 2.4 添加 timezone 字段（从 merchant/venue 继承）
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Los_Angeles';

-- =========================================================
-- STEP 3: 更新约束以支持两种模式
-- =========================================================

-- 3.1 移除旧的时间检查约束
ALTER TABLE public.events 
DROP CONSTRAINT IF EXISTS events_time_ok;

-- 3.2 添加新的灵活约束
ALTER TABLE public.events 
ADD CONSTRAINT events_validity_ok 
CHECK (
  -- Single mode: 需要 start_at 和 end_at
  (schedule_mode = 'single' AND start_at IS NOT NULL AND end_at IS NOT NULL AND end_at > start_at) OR
  
  -- Weekly mode: 需要 validity dates  
  (schedule_mode = 'weekly' AND validity_start_date IS NOT NULL AND validity_end_date IS NOT NULL AND validity_end_date >= validity_start_date) OR
  
  -- Draft: 允许任何情况
  (status = 'draft')
);

-- =========================================================
-- STEP 4: 回填现有数据
-- =========================================================

-- 4.1 为现有 events 设置 schedule_mode
UPDATE public.events
SET schedule_mode = CASE
  -- 如果有 weekly_rules，标记为 weekly
  WHEN EXISTS (
    SELECT 1 FROM public.event_weekly_rules 
    WHERE event_id = events.id
  ) THEN 'weekly'
  -- 否则保持为 single（向后兼容）
  ELSE 'single'
END
WHERE schedule_mode IS NULL;

-- 4.2 为 single mode events 保留 start_at/end_at
-- （不需要修改，保持原样）

-- 4.3 为 weekly mode events 从 start_at/end_at 推导 validity dates
UPDATE public.events
SET 
  validity_start_date = start_at::DATE,
  validity_end_date = COALESCE(end_at::DATE, start_at::DATE + INTERVAL '30 days')
WHERE schedule_mode = 'weekly' 
  AND validity_start_date IS NULL
  AND start_at IS NOT NULL;

-- 4.4 为所有 events 设置 region_id（从 merchant 继承）
UPDATE public.events e
SET region_id = m.region_id
FROM public.merchants m
WHERE e.merchant_id = m.id
  AND e.region_id IS NULL;

-- =========================================================
-- STEP 5: 创建/更新 trigger 以自动管理 region
-- =========================================================

CREATE OR REPLACE FUNCTION public.set_event_region_from_merchant()
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
  
  -- 如果 merchant 没有 region，报错
  IF v_merchant_region_id IS NULL THEN
    RAISE EXCEPTION 'Cannot create event: merchant % has no region_id', NEW.merchant_id;
  END IF;
  
  -- 强制设置 region_id = merchant.region_id
  NEW.region_id := v_merchant_region_id;
  
  RETURN NEW;
END;
$$;

-- 删除旧的 venue-based trigger（如果存在）
DROP TRIGGER IF EXISTS trg_set_event_region_new ON public.events;
DROP TRIGGER IF EXISTS trg_enforce_event_region_consistency ON public.events;

-- 创建新的 merchant-based trigger
DROP TRIGGER IF EXISTS trg_set_event_region_from_merchant ON public.events;
CREATE TRIGGER trg_set_event_region_from_merchant
BEFORE INSERT OR UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.set_event_region_from_merchant();

-- =========================================================
-- STEP 6: 更新 tickets 表以支持日期绑定
-- =========================================================

-- 6.1 添加 valid_for_date（票有效的具体日期）
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS valid_for_date DATE DEFAULT NULL;

-- 6.2 添加 valid_start_time / valid_end_time（从 weekly rule 继承）
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS valid_start_time TIME DEFAULT NULL;

ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS valid_end_time TIME DEFAULT NULL;

-- 6.3 venue_id 改为 NULLABLE（从 event 继承即可）
ALTER TABLE public.tickets 
ALTER COLUMN venue_id DROP NOT NULL;

-- 6.4 回填现有 tickets 的 valid_for_date
UPDATE public.tickets t
SET valid_for_date = e.start_at::DATE
FROM public.events e
WHERE t.event_id = e.id
  AND t.valid_for_date IS NULL
  AND e.start_at IS NOT NULL;

-- =========================================================
-- STEP 7: 添加索引优化查询
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_events_validity_dates 
ON public.events(validity_start_date, validity_end_date) 
WHERE schedule_mode = 'weekly';

CREATE INDEX IF NOT EXISTS idx_events_schedule_mode_status 
ON public.events(schedule_mode, status);

CREATE INDEX IF NOT EXISTS idx_tickets_valid_for_date 
ON public.tickets(valid_for_date) 
WHERE valid_for_date IS NOT NULL;

-- =========================================================
-- STEP 8: 验证和统计
-- =========================================================

DO $$
DECLARE
  v_region_id_nullable TEXT;
  v_single_mode_count INT;
  v_weekly_mode_count INT;
  v_draft_count INT;
  v_events_without_region INT;
BEGIN
  -- 检查 region_id nullable
  SELECT is_nullable INTO v_region_id_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' 
    AND table_name = 'events' 
    AND column_name = 'region_id';
  
  -- 统计不同模式的 events
  SELECT COUNT(*) INTO v_single_mode_count
  FROM public.events
  WHERE schedule_mode = 'single';
  
  SELECT COUNT(*) INTO v_weekly_mode_count
  FROM public.events
  WHERE schedule_mode = 'weekly';
  
  SELECT COUNT(*) INTO v_draft_count
  FROM public.events
  WHERE status = 'draft';
  
  SELECT COUNT(*) INTO v_events_without_region
  FROM public.events
  WHERE region_id IS NULL;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Event Model Refactor Complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Database Changes:';
  
  IF v_region_id_nullable = 'YES' THEN
    RAISE NOTICE '  ✅ events.region_id is now NULLABLE';
  ELSE
    RAISE WARNING '  ❌ events.region_id is still NOT NULL';
  END IF;
  
  RAISE NOTICE '  ✅ events.validity_start_date added';
  RAISE NOTICE '  ✅ events.validity_end_date added';
  RAISE NOTICE '  ✅ events.schedule_mode added (single/weekly)';
  RAISE NOTICE '  ✅ events.timezone added';
  RAISE NOTICE '  ✅ tickets.valid_for_date added';
  RAISE NOTICE '  ✅ tickets.valid_start_time/end_time added';
  RAISE NOTICE '  ✅ tickets.venue_id is now NULLABLE';
  RAISE NOTICE '';
  RAISE NOTICE 'Event Statistics:';
  RAISE NOTICE '  - Single mode events: %', v_single_mode_count;
  RAISE NOTICE '  - Weekly mode events: %', v_weekly_mode_count;
  RAISE NOTICE '  - Draft events: %', v_draft_count;
  
  IF v_events_without_region > 0 THEN
    RAISE WARNING '  - ⚠️ Events without region: % (will be set from merchant)', v_events_without_region;
  ELSE
    RAISE NOTICE '  - Events without region: % ✓', v_events_without_region;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE 'New Business Model:';
  RAISE NOTICE '  - Events are long-lived configurations';
  RAISE NOTICE '  - validity_start_date → validity_end_date';
  RAISE NOTICE '  - Weekly schedules define selling windows';
  RAISE NOTICE '  - Tickets bind to specific dates';
  RAISE NOTICE '  - NO venue dependency for event creation';
  RAISE NOTICE '  - region auto-inherits from merchant';
  RAISE NOTICE '========================================';
END $$;
