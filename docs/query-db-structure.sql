-- =========================================================
-- 数据库结构查询脚本
-- 在 Supabase Dashboard → SQL Editor 中运行此脚本
-- =========================================================

-- =========================================================
-- 1. 获取所有表列表
-- =========================================================
SELECT 
  schemaname AS schema,
  tablename AS table_name,
  tableowner AS owner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- =========================================================
-- 2. 获取所有表的列信息（详细）
-- =========================================================
SELECT 
  t.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default,
  CASE 
    WHEN c.character_maximum_length IS NOT NULL 
    THEN c.data_type || '(' || c.character_maximum_length || ')'
    ELSE c.data_type
  END AS full_type
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;

-- =========================================================
-- 3. 获取外键约束关系
-- =========================================================
SELECT
  tc.table_name AS "表名",
  kcu.column_name AS "列名",
  ccu.table_name AS "引用表",
  ccu.column_name AS "引用列",
  tc.constraint_name AS "约束名"
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- =========================================================
-- 4. 获取索引信息
-- =========================================================
SELECT
  schemaname AS schema,
  tablename AS table_name,
  indexname AS index_name,
  indexdef AS definition
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- =========================================================
-- 5. 获取 RLS 策略
-- =========================================================
SELECT
  schemaname AS schema,
  tablename AS table_name,
  policyname AS policy_name,
  cmd AS command,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- =========================================================
-- 6. 获取函数列表（SECURITY DEFINER）
-- =========================================================
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  CASE 
    WHEN p.prosecdef THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END AS security_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- =========================================================
-- 7. 获取触发器信息
-- =========================================================
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname IN ('public', 'auth')
  AND NOT t.tgisinternal
ORDER BY n.nspname, c.relname, t.tgname;

-- =========================================================
-- 8. 获取表统计信息（行数、大小等）
-- =========================================================
SELECT
  schemaname AS schema,
  tablename AS table_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- =========================================================
-- 9. 获取表行数（需要实际数据）
-- =========================================================
-- 注意：这个查询会扫描所有表，可能较慢
SELECT
  'profiles' AS table_name,
  COUNT(*) AS row_count
FROM public.profiles
UNION ALL
SELECT 'regions', COUNT(*) FROM public.regions
UNION ALL
SELECT 'merchants', COUNT(*) FROM public.merchants
UNION ALL
SELECT 'venues', COUNT(*) FROM public.venues
UNION ALL
SELECT 'merchant_members', COUNT(*) FROM public.merchant_members
UNION ALL
SELECT 'admin_users', COUNT(*) FROM public.admin_users
UNION ALL
SELECT 'events', COUNT(*) FROM public.events
UNION ALL
SELECT 'ticket_types', COUNT(*) FROM public.ticket_types
UNION ALL
SELECT 'orders', COUNT(*) FROM public.orders
UNION ALL
SELECT 'tickets', COUNT(*) FROM public.tickets
ORDER BY table_name;
