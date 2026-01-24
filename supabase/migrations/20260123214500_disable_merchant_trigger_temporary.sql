-- =========================================================
-- 临时修复：禁用 merchant default venue trigger
-- =========================================================
-- 问题：trigger 在插入 venues 时触发 RLS policy 检查，导致 timezone 引用错误
-- 解决方案：临时禁用 trigger，让 merchants insert 先成功
-- =========================================================

BEGIN;

-- 禁用 trigger（临时方案）
DROP TRIGGER IF EXISTS trg_ensure_merchant_default_venue ON public.merchants;

-- 验证
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_ensure_merchant_default_venue' 
    AND tgrelid = 'public.merchants'::regclass
  ) THEN
    RAISE NOTICE '✅ Trigger trg_ensure_merchant_default_venue has been disabled';
  ELSE
    RAISE WARNING 'Trigger still exists';
  END IF;
END $$;

COMMIT;
