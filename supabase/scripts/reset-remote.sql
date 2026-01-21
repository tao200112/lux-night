-- =========================================================
-- RESET REMOTE DATABASE
-- ⚠️  WARNING: This will DELETE ALL data in public schema!
-- =========================================================
-- 用途：清空远程 Supabase 的 public schema，准备重建
-- 执行方式：
--   1. Supabase Dashboard → SQL Editor → 粘贴并执行
--   2. 或使用 Supabase CLI: npx supabase db reset --db-url <your-db-url>
--
-- 注意：
--   - 不会影响 auth schema（auth.users 保留）
--   - 不会影响 storage schema
--   - 只删除 public schema 的对象
-- =========================================================

-- 1. 禁用所有 RLS（避免删除时权限问题）
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
  LOOP
    EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' DISABLE ROW LEVEL SECURITY';
  END LOOP;
END $$;

-- 2. 删除所有 policies
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || 
            ' ON ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$;

-- 3. 删除所有 triggers
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT trigger_name, event_object_table
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
  LOOP
    EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.trigger_name) || 
            ' ON public.' || quote_ident(r.event_object_table) || ' CASCADE';
  END LOOP;
END $$;

-- 4. 删除所有 functions（包括 RPC）
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT proname, oidvectortypes(proargtypes) as args
    FROM pg_proc
    INNER JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
    WHERE pg_namespace.nspname = 'public'
      AND proname NOT IN ('set_updated_at') -- 保留常用 helper
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || 
            '(' || r.args || ') CASCADE';
  END LOOP;
END $$;

-- 5. 删除所有 views
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'public'
  LOOP
    EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.table_name) || ' CASCADE';
  END LOOP;
END $$;

-- 6. 删除所有 tables（按依赖顺序，级联删除）
DROP TABLE IF EXISTS public.request_events CASCADE;
DROP TABLE IF EXISTS public.requests CASCADE;
DROP TABLE IF EXISTS public.checkins CASCADE;
DROP TABLE IF EXISTS public.tickets CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.ticket_types CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;
DROP TABLE IF EXISTS public.member_venues CASCADE;
DROP TABLE IF EXISTS public.invites CASCADE;
DROP TABLE IF EXISTS public.merchant_members CASCADE;
DROP TABLE IF EXISTS public.admin_users CASCADE;
DROP TABLE IF EXISTS public.venues CASCADE;
DROP TABLE IF EXISTS public.merchants CASCADE;
DROP TABLE IF EXISTS public.regions CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.stripe_events CASCADE;

-- 7. 删除所有 types/enums
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT typname
    FROM pg_type
    INNER JOIN pg_namespace ON pg_type.typnamespace = pg_namespace.oid
    WHERE pg_namespace.nspname = 'public'
      AND typtype = 'e'
  LOOP
    EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
  END LOOP;
END $$;

-- 8. 清理 Supabase migrations 记录（可选）
-- 如果你想 Supabase 认为是全新数据库，取消下面注释
-- TRUNCATE supabase_migrations.schema_migrations;

-- 9. 重建基础权限
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role;

-- 完成
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Remote database reset complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run: npx supabase db push';
  RAISE NOTICE '2. This will apply all migrations in order';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
END $$;
