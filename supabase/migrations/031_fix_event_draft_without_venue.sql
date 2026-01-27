-- =========================================================
-- 031 FIX EVENT DRAFT WITHOUT VENUE
-- 修复：允许 draft 状态的 event 保存时 venue_id 为 NULL
-- =========================================================
-- 
-- Root Cause: events.venue_id 有 NOT NULL 约束，导致保存 draft 时报错
-- Solution: 修改为允许 NULL，publish 时由应用层校验
--
-- =========================================================

-- STEP 1: 移除 events.venue_id 的 NOT NULL 约束
-- =========================================================

ALTER TABLE public.events 
ALTER COLUMN venue_id DROP NOT NULL;

-- =========================================================
-- STEP 2: 验证修改
-- =========================================================

DO $$
DECLARE
  v_nullable TEXT;
BEGIN
  SELECT is_nullable INTO v_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' 
    AND table_name = 'events' 
    AND column_name = 'venue_id';
  
  IF v_nullable = 'YES' THEN
    RAISE NOTICE '✅ events.venue_id is now NULLABLE';
  ELSE
    RAISE WARNING '❌ events.venue_id is still NOT NULL';
  END IF;
END $$;

-- =========================================================
-- STEP 3: 验证现有触发器已经支持 venue_id = NULL
-- =========================================================

-- 029_fix_event_venue_null.sql 已经创建了支持 NULL 的触发器：
-- - set_event_region_from_venue() 在 venue_id=NULL 时使用 merchant.region_id
-- - enforce_event_region_consistency() 同样支持 NULL

-- 验证触发器存在
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_set_event_region_new' 
      AND tgrelid = 'public.events'::regclass
  ) THEN
    RAISE NOTICE '✅ Trigger trg_set_event_region_new exists';
  ELSE
    RAISE WARNING '⚠️ Trigger trg_set_event_region_new not found';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_enforce_event_region_consistency' 
      AND tgrelid = 'public.events'::regclass
  ) THEN
    RAISE NOTICE '✅ Trigger trg_enforce_event_region_consistency exists';
  ELSE
    RAISE WARNING '⚠️ Trigger trg_enforce_event_region_consistency not found';
  END IF;
END $$;

-- =========================================================
-- STEP 4: 添加检查约束，确保 published 状态必须有 venue
-- =========================================================

-- 注意：这是可选的。如果采用策略1（publish才要求venue），
-- 应该在应用层校验，而不是数据库约束，因为：
-- 1. 更灵活（可以返回友好错误码）
-- 2. 避免与其他逻辑冲突
-- 3. 可以在发布前提示用户

-- 如果一定要在数据库层强制，可以添加：
-- ALTER TABLE public.events 
-- ADD CONSTRAINT events_published_needs_venue 
-- CHECK (status != 'published' OR venue_id IS NOT NULL);

-- 但推荐在应用层做这个校验（已在 API 中实现）

-- =========================================================
-- STEP 5: 完成提示
-- =========================================================

DO $$
DECLARE
  v_draft_without_venue_count INT;
  v_published_without_venue_count INT;
BEGIN
  -- 统计 draft 状态且无 venue 的 event 数量
  SELECT COUNT(*) INTO v_draft_without_venue_count
  FROM public.events
  WHERE status = 'draft' AND venue_id IS NULL;
  
  -- 统计 published 状态且无 venue 的 event 数量（不应该有）
  SELECT COUNT(*) INTO v_published_without_venue_count
  FROM public.events
  WHERE status = 'published' AND venue_id IS NULL;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Event Draft Without Venue Fix Complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - events.venue_id is now NULLABLE';
  RAISE NOTICE '  - Draft events can be saved without venue';
  RAISE NOTICE '  - Published events require venue (enforced in API)';
  RAISE NOTICE '';
  RAISE NOTICE 'Statistics:';
  RAISE NOTICE '  - Draft events without venue: %', v_draft_without_venue_count;
  
  IF v_published_without_venue_count > 0 THEN
    RAISE WARNING '  - ⚠️ Published events without venue: % (should investigate)', v_published_without_venue_count;
  ELSE
    RAISE NOTICE '  - Published events without venue: % ✓', v_published_without_venue_count;
  END IF;
  
  RAISE NOTICE '========================================';
END $$;
