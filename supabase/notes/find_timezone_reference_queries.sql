-- =========================================================
-- 定位 merchants insert 时引用 timezone 的对象
-- 请在 Supabase SQL Editor 执行并返回结果
-- =========================================================

-- 1) 查 RLS policy 是否引用 timezone
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  roles, 
  cmd, 
  qual, 
  with_check
FROM pg_policies
WHERE (qual ILIKE '%timezone%' OR with_check ILIKE '%timezone%')
ORDER BY tablename, policyname;

-- 2) 查 triggers（merchants/venues/merchant_members）
SELECT 
  event_object_schema, 
  event_object_table, 
  trigger_name, 
  action_timing, 
  event_manipulation, 
  action_statement
FROM information_schema.triggers
WHERE event_object_table IN ('merchants', 'venues', 'merchant_members')
ORDER BY event_object_table, trigger_name;

-- 3) 查所有函数里是否出现 timezone
SELECT 
  n.nspname AS schema, 
  p.proname AS name,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p 
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE pg_get_functiondef(p.oid) ILIKE '%timezone%'
ORDER BY 1, 2;

-- 4) 查 view 是否引用 timezone
SELECT 
  table_schema, 
  table_name,
  view_definition
FROM information_schema.views
WHERE view_definition ILIKE '%timezone%'
ORDER BY table_schema, table_name;

-- 5) 检查 trigger 函数的完整定义（针对 merchants/venues）
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
  WHERE c.relname IN ('merchants', 'venues', 'merchant_members')
)
AND pg_get_functiondef(p.oid) ILIKE '%timezone%'
ORDER BY 1, 2;
