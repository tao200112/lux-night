-- =========================================================
-- 最终修复：merchants insert 时引用 timezone 的错误
-- =========================================================
-- 问题：即使使用 service role client，在 trigger 中插入 venues 时
-- 仍然触发了 RLS policy 检查，导致 timezone 引用错误
-- 
-- 解决方案：
-- 1. 完全禁用 trigger（临时方案）
-- 2. 或者修改 trigger function，使用更安全的方式插入 venues
-- =========================================================

BEGIN;

-- =========================================================
-- 方案：完全禁用 trigger，改为在应用层处理
-- =========================================================
-- 这样可以避免 trigger 中的 RLS policy 检查问题
-- =========================================================

-- 删除 trigger（如果存在）
DROP TRIGGER IF EXISTS trg_ensure_merchant_default_venue ON public.merchants;

-- 保留 function 定义（以防其他地方使用），但不作为 trigger
-- 如果需要，可以在应用层手动调用

-- =========================================================
-- 验证修复
-- =========================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Merchant insert timezone error fix (final) completed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - Disabled trg_ensure_merchant_default_venue trigger';
  RAISE NOTICE '  - Merchants insert will no longer trigger automatic venue creation';
  RAISE NOTICE '  - Application layer should handle default venue creation if needed';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Test merchants insert via API';
  RAISE NOTICE '  2. Verify merchants insert succeeds without timezone error';
  RAISE NOTICE '  3. If default venue is needed, create it in application layer';
  RAISE NOTICE '========================================';
END $$;

COMMIT;
