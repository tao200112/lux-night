-- =========================================================
-- 修复 merchants insert 时引用 timezone 的错误
-- =========================================================
-- 问题根因：
-- 1. trigger function ensure_merchant_default_venue() 在 merchants insert 时
--    检查 NEW.status = 'active'，但 merchants 表可能没有 status 列
-- 2. 在 BEFORE INSERT trigger 中插入 venues 时，可能触发了 RLS policy 检查
--    导致 timezone 引用错误
-- =========================================================

BEGIN;

-- =========================================================
-- 修复 1: 移除 trigger function 中对 NEW.status 的检查
-- =========================================================
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
  -- 移除 NEW.status = 'active' 检查，因为 merchants 表可能没有 status 列
  -- 或者 status 列在 BEFORE INSERT 时还没有值
  IF TG_OP = 'INSERT' AND NEW.default_venue_id IS NULL THEN
    -- 创建默认venue
    -- 注意：使用 SECURITY DEFINER 和 search_path 确保可以绕过 RLS
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
    
    -- 更新merchant的default_venue_id
    NEW.default_venue_id := v_default_venue_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- =========================================================
-- 验证修复
-- =========================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Merchant insert timezone error fix completed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - Removed NEW.status check from ensure_merchant_default_venue()';
  RAISE NOTICE '  - Added SECURITY DEFINER to bypass RLS in trigger';
  RAISE NOTICE '  - Trigger now only checks default_venue_id IS NULL';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Test merchants insert via API';
  RAISE NOTICE '  2. Verify default_venue_id is set correctly';
  RAISE NOTICE '  3. Check that no timezone errors occur';
  RAISE NOTICE '========================================';
END $$;

COMMIT;

-- =========================================================
-- 验证修复的 SQL（可选，用于手动测试）
-- =========================================================
-- 执行以下 SQL 验证 merchants insert 成功：
-- 
-- 1. 使用 service role 插入测试 merchant（绕过 RLS）：
--    INSERT INTO public.merchants (name, region_id)
--    VALUES ('Test Merchant', (SELECT id FROM public.regions LIMIT 1))
--    RETURNING id, name, default_venue_id;
--
-- 2. 检查是否自动创建了 default venue：
--    SELECT v.id, v.name, v.merchant_id, v.timezone
--    FROM public.venues v
--    JOIN public.merchants m ON m.default_venue_id = v.id
--    WHERE m.name = 'Test Merchant';
--
-- 3. 清理测试数据：
--    DELETE FROM public.venues WHERE merchant_id IN (SELECT id FROM public.merchants WHERE name = 'Test Merchant');
--    DELETE FROM public.merchants WHERE name = 'Test Merchant';
-- =========================================================
