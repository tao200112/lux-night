-- =========================================================
-- 022 VERIFY FOREIGN KEYS
-- 验证外键约束是否正常工作
-- =========================================================
-- 说明：
-- - 验证关键外键约束是否存在
-- - 检查是否有违反外键约束的数据
-- =========================================================

-- 验证关键外键约束

-- 1. profiles.id → auth.users.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'profiles'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'id'
  ) THEN
    RAISE WARNING 'profiles.id foreign key constraint not found';
  ELSE
    RAISE NOTICE '✅ profiles.id foreign key constraint exists';
  END IF;
END $$;

-- 2. admin_users.user_id → auth.users.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'admin_users'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'user_id'
  ) THEN
    RAISE WARNING 'admin_users.user_id foreign key constraint not found';
  ELSE
    RAISE NOTICE '✅ admin_users.user_id foreign key constraint exists';
  END IF;
END $$;

-- 3. merchant_members.user_id → auth.users.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'merchant_members'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'user_id'
  ) THEN
    RAISE WARNING 'merchant_members.user_id foreign key constraint not found';
  ELSE
    RAISE NOTICE '✅ merchant_members.user_id foreign key constraint exists';
  END IF;
END $$;

-- 4. merchants.default_venue_id → venues.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'merchants'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'default_venue_id'
  ) THEN
    RAISE WARNING 'merchants.default_venue_id foreign key constraint not found';
  ELSE
    RAISE NOTICE '✅ merchants.default_venue_id foreign key constraint exists';
  END IF;
END $$;

-- 5. events.venue_id → venues.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'events'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'venue_id'
  ) THEN
    RAISE WARNING 'events.venue_id foreign key constraint not found';
  ELSE
    RAISE NOTICE '✅ events.venue_id foreign key constraint exists';
  END IF;
END $$;

-- 检查是否有违反外键约束的数据

-- 检查 profiles.id 是否都存在于 auth.users
DO $$
DECLARE
  v_orphaned_profiles INT;
BEGIN
  SELECT COUNT(*) INTO v_orphaned_profiles
  FROM public.profiles p
  LEFT JOIN auth.users u ON p.id = u.id
  WHERE u.id IS NULL;
  
  IF v_orphaned_profiles > 0 THEN
    RAISE WARNING 'Found % orphaned profiles (id not in auth.users)', v_orphaned_profiles;
  ELSE
    RAISE NOTICE '✅ All profiles have corresponding auth.users';
  END IF;
END $$;

-- 检查 admin_users.user_id 是否都存在于 auth.users
DO $$
DECLARE
  v_orphaned_admin_users INT;
BEGIN
  SELECT COUNT(*) INTO v_orphaned_admin_users
  FROM public.admin_users au
  LEFT JOIN auth.users u ON au.user_id = u.id
  WHERE u.id IS NULL;
  
  IF v_orphaned_admin_users > 0 THEN
    RAISE WARNING 'Found % orphaned admin_users (user_id not in auth.users)', v_orphaned_admin_users;
  ELSE
    RAISE NOTICE '✅ All admin_users have corresponding auth.users';
  END IF;
END $$;

-- 检查 merchant_members.user_id 是否都存在于 auth.users
DO $$
DECLARE
  v_orphaned_members INT;
BEGIN
  SELECT COUNT(*) INTO v_orphaned_members
  FROM public.merchant_members mm
  LEFT JOIN auth.users u ON mm.user_id = u.id
  WHERE u.id IS NULL;
  
  IF v_orphaned_members > 0 THEN
    RAISE WARNING 'Found % orphaned merchant_members (user_id not in auth.users)', v_orphaned_members;
  ELSE
    RAISE NOTICE '✅ All merchant_members have corresponding auth.users';
  END IF;
END $$;

-- 检查 merchants.default_venue_id 是否都存在于 venues
DO $$
DECLARE
  v_invalid_default_venues INT;
BEGIN
  SELECT COUNT(*) INTO v_invalid_default_venues
  FROM public.merchants m
  WHERE m.default_venue_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.venues v WHERE v.id = m.default_venue_id
    );
  
  IF v_invalid_default_venues > 0 THEN
    RAISE WARNING 'Found % merchants with invalid default_venue_id', v_invalid_default_venues;
  ELSE
    RAISE NOTICE '✅ All merchants.default_venue_id are valid';
  END IF;
END $$;

-- 检查 events.venue_id 是否都存在于 venues
DO $$
DECLARE
  v_invalid_event_venues INT;
BEGIN
  SELECT COUNT(*) INTO v_invalid_event_venues
  FROM public.events e
  WHERE NOT EXISTS (
    SELECT 1 FROM public.venues v WHERE v.id = e.venue_id
  );
  
  IF v_invalid_event_venues > 0 THEN
    RAISE WARNING 'Found % events with invalid venue_id', v_invalid_event_venues;
  ELSE
    RAISE NOTICE '✅ All events.venue_id are valid';
  END IF;
END $$;

-- =========================================================
-- 完成
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Foreign key verification completed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - Verified key foreign key constraints exist';
  RAISE NOTICE '  - Checked for orphaned records';
  RAISE NOTICE '========================================';
END $$;
