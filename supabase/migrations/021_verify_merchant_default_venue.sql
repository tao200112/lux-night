-- =========================================================
-- 021 VERIFY MERCHANT DEFAULT VENUE
-- 验证 merchant default_venue_id 是否已补齐
-- =========================================================
-- 说明：
-- - Migration 014 添加了 default_venue_id 字段
-- - Migration 016 修复了历史数据并创建了 trigger
-- - 这里验证所有 active merchants 都有 default_venue_id
-- =========================================================

-- 验证 default_venue_id 字段存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchants'
      AND column_name = 'default_venue_id'
  ) THEN
    RAISE EXCEPTION 'default_venue_id column not found. Please run migration 014 first.';
  END IF;
  
  RAISE NOTICE '✅ default_venue_id column exists';
END $$;

-- 验证 trigger 存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'merchants' AND t.tgname = 'trg_ensure_merchant_default_venue'
  ) THEN
    RAISE WARNING 'trg_ensure_merchant_default_venue trigger not found. Please run migration 016 first.';
  ELSE
    RAISE NOTICE '✅ trg_ensure_merchant_default_venue trigger exists';
  END IF;
END $$;

-- 修复历史数据：为所有 active merchants 补齐 default_venue_id
DO $$
DECLARE
  v_merchant RECORD;
  v_existing_venue RECORD;
  v_new_venue_id UUID;
  v_fixed_count INT := 0;
  v_created_count INT := 0;
BEGIN
  -- 遍历所有没有default_venue_id的active merchant
  FOR v_merchant IN
    SELECT id, name, region_id
    FROM public.merchants
    WHERE default_venue_id IS NULL
      AND status = 'active'
  LOOP
    -- 检查是否已有venue
    SELECT id INTO v_existing_venue
    FROM public.venues
    WHERE merchant_id = v_merchant.id
      AND is_active = true
    ORDER BY created_at
    LIMIT 1;
    
    IF v_existing_venue.id IS NOT NULL THEN
      -- 使用已有venue
      UPDATE public.merchants
      SET default_venue_id = v_existing_venue.id
      WHERE id = v_merchant.id;
      
      v_fixed_count := v_fixed_count + 1;
      RAISE NOTICE 'Fixed merchant % (%) - using existing venue %', v_merchant.id, v_merchant.name, v_existing_venue.id;
    ELSE
      -- 创建新venue
      INSERT INTO public.venues(
        merchant_id,
        region_id,
        name,
        address,
        timezone,
        is_active
      )
      VALUES (
        v_merchant.id,
        v_merchant.region_id,
        'Default Venue',
        NULL,
        COALESCE((SELECT timezone FROM public.regions WHERE id = v_merchant.region_id LIMIT 1), 'America/New_York'),
        true
      )
      RETURNING id INTO v_new_venue_id;
      
      UPDATE public.merchants
      SET default_venue_id = v_new_venue_id
      WHERE id = v_merchant.id;
      
      v_created_count := v_created_count + 1;
      RAISE NOTICE 'Created default venue % for merchant % (%)', v_new_venue_id, v_merchant.id, v_merchant.name;
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Historical data fix completed!';
  RAISE NOTICE '  - Fixed merchants (using existing venue): %', v_fixed_count;
  RAISE NOTICE '  - Created venues for merchants: %', v_created_count;
  RAISE NOTICE '========================================';
END $$;

-- 统计结果
DO $$
DECLARE
  v_total_merchants INT;
  v_merchants_with_venue INT;
  v_merchants_without_venue INT;
BEGIN
  SELECT COUNT(*) INTO v_total_merchants FROM public.merchants WHERE status = 'active';
  SELECT COUNT(*) INTO v_merchants_with_venue FROM public.merchants WHERE status = 'active' AND default_venue_id IS NOT NULL;
  v_merchants_without_venue := v_total_merchants - v_merchants_with_venue;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Merchant default venue statistics:';
  RAISE NOTICE '  - Total active merchants: %', v_total_merchants;
  RAISE NOTICE '  - Merchants with default_venue_id: %', v_merchants_with_venue;
  RAISE NOTICE '  - Merchants without default_venue_id: %', v_merchants_without_venue;
  
  IF v_merchants_without_venue > 0 THEN
    RAISE WARNING 'Found % active merchants without default_venue_id', v_merchants_without_venue;
  ELSE
    RAISE NOTICE '✅ All active merchants have default_venue_id';
  END IF;
END $$;

-- =========================================================
-- 完成
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Merchant default venue verification completed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - Verified default_venue_id column exists';
  RAISE NOTICE '  - Verified trigger exists';
  RAISE NOTICE '  - Fixed any missing default_venue_id for active merchants';
  RAISE NOTICE '========================================';
END $$;
