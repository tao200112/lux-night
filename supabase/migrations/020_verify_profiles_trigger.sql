-- =========================================================
-- 020 VERIFY PROFILES TRIGGER
-- 验证 profiles 自动创建 trigger 是否正常工作
-- =========================================================
-- 说明：
-- - Migration 018 已创建 handle_new_user() trigger
-- - 这里验证 trigger 是否存在且正确配置
-- =========================================================

-- 验证 handle_new_user() 函数存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
  ) THEN
    RAISE EXCEPTION 'handle_new_user() function not found. Please run migration 018 first.';
  END IF;
  
  RAISE NOTICE '✅ handle_new_user() function exists';
END $$;

-- 验证 trigger 存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'auth' AND c.relname = 'users' AND t.tgname = 'on_auth_user_created'
  ) THEN
    RAISE EXCEPTION 'on_auth_user_created trigger not found. Please run migration 018 first.';
  END IF;
  
  RAISE NOTICE '✅ on_auth_user_created trigger exists';
END $$;

-- 为已存在的用户创建缺失的 profiles（一次性修复）
-- 注意：Migration 018 已包含此逻辑，这里作为二次验证
INSERT INTO public.profiles (id, display_name, created_at, updated_at)
SELECT 
  u.id,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1), NULL) as display_name,
  u.created_at,
  NOW() as updated_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 统计修复结果
DO $$
DECLARE
  v_fixed_count INT;
BEGIN
  SELECT COUNT(*) INTO v_fixed_count
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  WHERE p.id IS NULL;
  
  IF v_fixed_count > 0 THEN
    RAISE WARNING 'Found % users without profiles. Please check handle_new_user() trigger.', v_fixed_count;
  ELSE
    RAISE NOTICE '✅ All users have profiles';
  END IF;
END $$;

-- =========================================================
-- 完成
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Profiles trigger verification completed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - Verified handle_new_user() function exists';
  RAISE NOTICE '  - Verified on_auth_user_created trigger exists';
  RAISE NOTICE '  - Fixed any missing profiles for existing users';
  RAISE NOTICE '========================================';
END $$;
