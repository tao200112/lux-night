-- =========================================================
-- 032 FIX EVENT DRAFT ALLOW NULL TIMES AND TITLE
-- 修复：允许 draft 状态的 event 保存时 start_at, end_at, title 为 NULL
-- =========================================================
-- 
-- Root Cause: start_at, end_at, title 有 NOT NULL 约束，导致保存 draft 时报错
-- Solution: 修改为允许 NULL，publish 时由应用层校验
--
-- =========================================================

-- STEP 1: 移除 events 表中 draft 相关字段的 NOT NULL 约束
-- =========================================================

-- 移除 start_at 的 NOT NULL 约束
ALTER TABLE public.events 
ALTER COLUMN start_at DROP NOT NULL;

-- 移除 end_at 的 NOT NULL 约束
ALTER TABLE public.events 
ALTER COLUMN end_at DROP NOT NULL;

-- 移除 title 的 NOT NULL 约束
ALTER TABLE public.events 
ALTER COLUMN title DROP NOT NULL;

-- =========================================================
-- STEP 2: 修改时间检查约束，允许 NULL 值
-- =========================================================

-- 移除旧的时间约束
ALTER TABLE public.events 
DROP CONSTRAINT IF EXISTS events_time_ok;

-- 添加新的约束：如果两个时间都非 NULL，则 end_at 必须大于 start_at
ALTER TABLE public.events 
ADD CONSTRAINT events_time_ok 
CHECK (
  (start_at IS NULL OR end_at IS NULL) OR 
  (end_at > start_at)
);

-- =========================================================
-- STEP 3: 验证修改
-- =========================================================

DO $$
DECLARE
  v_start_at_nullable TEXT;
  v_end_at_nullable TEXT;
  v_title_nullable TEXT;
  v_venue_id_nullable TEXT;
BEGIN
  -- 检查 start_at
  SELECT is_nullable INTO v_start_at_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' 
    AND table_name = 'events' 
    AND column_name = 'start_at';
  
  -- 检查 end_at
  SELECT is_nullable INTO v_end_at_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' 
    AND table_name = 'events' 
    AND column_name = 'end_at';
  
  -- 检查 title
  SELECT is_nullable INTO v_title_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' 
    AND table_name = 'events' 
    AND column_name = 'title';
  
  -- 检查 venue_id (should be nullable from 031 migration)
  SELECT is_nullable INTO v_venue_id_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' 
    AND table_name = 'events' 
    AND column_name = 'venue_id';
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Field Nullability Status:';
  RAISE NOTICE '----------------------------------------';
  
  IF v_start_at_nullable = 'YES' THEN
    RAISE NOTICE '✅ events.start_at is now NULLABLE';
  ELSE
    RAISE WARNING '❌ events.start_at is still NOT NULL';
  END IF;
  
  IF v_end_at_nullable = 'YES' THEN
    RAISE NOTICE '✅ events.end_at is now NULLABLE';
  ELSE
    RAISE WARNING '❌ events.end_at is still NOT NULL';
  END IF;
  
  IF v_title_nullable = 'YES' THEN
    RAISE NOTICE '✅ events.title is now NULLABLE';
  ELSE
    RAISE WARNING '❌ events.title is still NOT NULL';
  END IF;
  
  IF v_venue_id_nullable = 'YES' THEN
    RAISE NOTICE '✅ events.venue_id is NULLABLE (from 031)';
  ELSE
    RAISE WARNING '❌ events.venue_id is still NOT NULL (031 migration issue)';
  END IF;
  
  RAISE NOTICE '========================================';
END $$;

-- =========================================================
-- STEP 4: 完成提示
-- =========================================================

DO $$
DECLARE
  v_draft_incomplete_count INT;
  v_published_incomplete_count INT;
BEGIN
  -- 统计 draft 状态且缺少关键字段的 event 数量
  SELECT COUNT(*) INTO v_draft_incomplete_count
  FROM public.events
  WHERE status = 'draft' 
    AND (start_at IS NULL OR end_at IS NULL OR title IS NULL OR venue_id IS NULL);
  
  -- 统计 published 状态且缺少关键字段的 event 数量（不应该有）
  SELECT COUNT(*) INTO v_published_incomplete_count
  FROM public.events
  WHERE status = 'published' 
    AND (start_at IS NULL OR end_at IS NULL OR title IS NULL OR venue_id IS NULL);
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Event Draft Allow NULL Times Fix Complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - events.start_at is now NULLABLE';
  RAISE NOTICE '  - events.end_at is now NULLABLE';
  RAISE NOTICE '  - events.title is now NULLABLE';
  RAISE NOTICE '  - events.venue_id is NULLABLE (from 031)';
  RAISE NOTICE '  - Time constraint updated to allow NULL values';
  RAISE NOTICE '';
  RAISE NOTICE 'Draft Status:';
  RAISE NOTICE '  - Draft events can now be saved without:';
  RAISE NOTICE '    • start_at / end_at (times)';
  RAISE NOTICE '    • title';
  RAISE NOTICE '    • venue_id';
  RAISE NOTICE '';
  RAISE NOTICE 'Publish Validation (enforced in API):';
  RAISE NOTICE '  - All fields required for publishing';
  RAISE NOTICE '  - API returns clear error codes';
  RAISE NOTICE '';
  RAISE NOTICE 'Statistics:';
  RAISE NOTICE '  - Draft events with incomplete data: %', v_draft_incomplete_count;
  
  IF v_published_incomplete_count > 0 THEN
    RAISE WARNING '  - ⚠️ Published events with incomplete data: % (investigate!)', v_published_incomplete_count;
  ELSE
    RAISE NOTICE '  - Published events with incomplete data: % ✓', v_published_incomplete_count;
  END IF;
  
  RAISE NOTICE '========================================';
END $$;
