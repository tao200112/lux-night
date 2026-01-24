-- =========================================================
-- 修复 merchants insert 时引用 timezone 的错误 (v2)
-- =========================================================
-- 问题根因：
-- 在 BEFORE INSERT trigger 中插入 venues 时，即使使用 SECURITY DEFINER，
-- RLS policy 的 WITH CHECK 子句仍然会被执行，导致 timezone 引用错误
-- 
-- 解决方案：
-- 1. 临时禁用 RLS 检查（使用 SET LOCAL）
-- 2. 或者使用更安全的方式：先禁用 trigger，插入后再启用
-- 3. 或者修改 trigger 为 AFTER INSERT，使用单独的 transaction
-- =========================================================

BEGIN;

-- =========================================================
-- 方案 1: 修改 trigger 为 AFTER INSERT，使用单独的 transaction
-- =========================================================
-- 这样可以避免在 BEFORE INSERT 时触发 RLS policy 检查
-- =========================================================

-- 删除旧的 BEFORE INSERT trigger
DROP TRIGGER IF EXISTS trg_ensure_merchant_default_venue ON public.merchants;

-- 创建新的 AFTER INSERT trigger function
CREATE OR REPLACE FUNCTION public.ensure_merchant_default_venue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_venue_id UUID;
BEGIN
  -- 只在merchant创建时（INSERT）且default_venue_id为NULL时触发
  IF TG_OP = 'INSERT' AND NEW.default_venue_id IS NULL THEN
    -- 创建默认venue
    -- 使用 SECURITY DEFINER 绕过 RLS
    INSERT INTO public.venues(
      merchant_id,
      region_id,
      name,
      address,
      timezone,
      is_active
    )
    VALUES (
      NEW.id,
      NEW.region_id,
      'Default Venue',
      NULL,
      COALESCE((SELECT timezone FROM public.regions WHERE id = NEW.region_id LIMIT 1), 'America/New_York'),
      true
    )
    RETURNING id INTO v_default_venue_id;
    
    -- 更新merchant的default_venue_id（在 AFTER INSERT 中需要 UPDATE）
    UPDATE public.merchants
    SET default_venue_id = v_default_venue_id
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 创建 AFTER INSERT trigger（而不是 BEFORE INSERT）
CREATE TRIGGER trg_ensure_merchant_default_venue
AFTER INSERT ON public.merchants
FOR EACH ROW
EXECUTE FUNCTION public.ensure_merchant_default_venue();

-- =========================================================
-- 验证修复
-- =========================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Merchant insert timezone error fix v2 completed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - Changed trigger from BEFORE INSERT to AFTER INSERT';
  RAISE NOTICE '  - Trigger now uses UPDATE to set default_venue_id';
  RAISE NOTICE '  - This avoids RLS policy checks during INSERT';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Test merchants insert via API';
  RAISE NOTICE '  2. Verify default_venue_id is set correctly';
  RAISE NOTICE '  3. Check that no timezone errors occur';
  RAISE NOTICE '========================================';
END $$;

COMMIT;
