-- =========================================================
-- 008: Add 'paused' and 'cancelled' status to events table
-- 为 events 表添加 'paused' 和 'cancelled' 状态支持
-- =========================================================

-- 删除旧的 CHECK 约束
ALTER TABLE public.events 
DROP CONSTRAINT IF EXISTS events_status_check;

-- 添加新的 CHECK 约束（包含 paused 和 cancelled）
ALTER TABLE public.events 
ADD CONSTRAINT events_status_check 
CHECK (status IN ('draft','pending_review','approved','published','paused','cancelled','rejected','archived'));

COMMENT ON COLUMN public.events.status IS 'Event status: draft, pending_review, approved, published, paused (temporarily unavailable for purchase), cancelled, rejected, archived';

-- =========================================================
-- 完成
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Event status extended (paused, cancelled added)!';
  RAISE NOTICE '========================================';
END $$;
