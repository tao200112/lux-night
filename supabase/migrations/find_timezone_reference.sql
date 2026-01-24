-- =========================================================
-- 定位 merchants insert 时引用 timezone 的对象
-- =========================================================

-- 1) 找 policy（RLS）里是否引用 timezone
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  roles, 
  cmd, 
  qual, 
  with_check
FROM pg_policies
WHERE (
  tablename IN ('merchants', 'merchant_members', 'venues') 
  OR qual ILIKE '%timezone%' 
  OR with_check ILIKE '%timezone%'
)
ORDER BY tablename, policyname;

-- 2) 找 triggers（包括触发函数定义）
SELECT 
  event_object_schema, 
  event_object_table, 
  trigger_name, 
  action_timing, 
  event_manipulation, 
  action_statement
FROM information_schema.triggers
WHERE event_object_table IN ('merchants', 'merchant_members', 'venues')
ORDER BY event_object_table, trigger_name;

-- 3) 找所有函数中包含 timezone
SELECT 
  n.nspname AS schema, 
  p.proname AS name,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p 
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE pg_get_functiondef(p.oid) ILIKE '%timezone%'
ORDER BY 1, 2;

-- 4) 找所有视图中包含 timezone
SELECT 
  table_schema, 
  table_name, 
  view_definition
FROM information_schema.views
WHERE view_definition ILIKE '%timezone%'
ORDER BY table_schema, table_name;

-- 5) 检查 trigger 函数的完整定义
SELECT 
  n.nspname AS schema,
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.oid IN (
  SELECT DISTINCT p.oid
  FROM pg_proc p
  JOIN pg_trigger t ON t.tgfoid = p.oid
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname IN ('merchants', 'merchant_members', 'venues')
)
AND pg_get_functiondef(p.oid) ILIKE '%timezone%'
ORDER BY 1, 2;
