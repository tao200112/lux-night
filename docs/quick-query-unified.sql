-- =========================================================
-- 数据库结构完整查询（单查询输出）
-- 在 Supabase Dashboard → SQL Editor 中运行
-- 一次性执行，一次性复制全部结果
-- =========================================================

-- 将所有信息合并到一个查询结果中
SELECT 
    '1. 表列表' AS "类别",
    tablename AS "项目1",
    tableowner AS "项目2",
    '' AS "项目3",
    '' AS "项目4",
    '' AS "项目5"
FROM pg_tables
WHERE schemaname = 'public'

UNION ALL

SELECT 
    '2. 表列信息',
    table_name,
    column_name,
    data_type,
    CASE WHEN is_nullable = 'YES' THEN 'NULL' ELSE 'NOT NULL' END,
    COALESCE(column_default, '')
FROM information_schema.columns
WHERE table_schema = 'public'

UNION ALL

SELECT 
    '3. 外键关系',
    tc.table_name,
    kcu.column_name,
    ccu.table_name,
    ccu.column_name,
    tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'

UNION ALL

SELECT 
    '4. RLS策略',
    tablename,
    policyname,
    cmd,
    CASE WHEN qual IS NOT NULL THEN '有USING' ELSE '无USING' END,
    CASE WHEN with_check IS NOT NULL THEN '有WITH CHECK' ELSE '无WITH CHECK' END
FROM pg_policies
WHERE schemaname = 'public'

UNION ALL

SELECT 
    '5. 函数',
    proname,
    pg_get_function_arguments(oid),
    CASE WHEN prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END,
    pg_get_function_result(oid),
    ''
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')

UNION ALL

SELECT 
    '6. 触发器',
    c.relname,
    t.tgname,
    n.nspname,
    pg_get_triggerdef(t.oid),
    ''
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname IN ('public', 'auth') AND NOT t.tgisinternal

UNION ALL

SELECT 
    '7. 表大小',
    tablename,
    pg_size_pretty(pg_total_relation_size('public.' || tablename)),
    pg_size_pretty(pg_relation_size('public.' || tablename)),
    pg_size_pretty(pg_total_relation_size('public.' || tablename) - pg_relation_size('public.' || tablename)),
    ''
FROM pg_tables
WHERE schemaname = 'public'

UNION ALL

SELECT 
    '8. 表行数',
    'profiles',
    COUNT(*)::text,
    '',
    '',
    ''
FROM public.profiles
UNION ALL SELECT '8. 表行数', 'regions', COUNT(*)::text, '', '', '' FROM public.regions
UNION ALL SELECT '8. 表行数', 'merchants', COUNT(*)::text, '', '', '' FROM public.merchants
UNION ALL SELECT '8. 表行数', 'venues', COUNT(*)::text, '', '', '' FROM public.venues
UNION ALL SELECT '8. 表行数', 'merchant_members', COUNT(*)::text, '', '', '' FROM public.merchant_members
UNION ALL SELECT '8. 表行数', 'admin_users', COUNT(*)::text, '', '', '' FROM public.admin_users
UNION ALL SELECT '8. 表行数', 'events', COUNT(*)::text, '', '', '' FROM public.events
UNION ALL SELECT '8. 表行数', 'ticket_types', COUNT(*)::text, '', '', '' FROM public.ticket_types
UNION ALL SELECT '8. 表行数', 'orders', COUNT(*)::text, '', '', '' FROM public.orders
UNION ALL SELECT '8. 表行数', 'tickets', COUNT(*)::text, '', '', '' FROM public.tickets
UNION ALL SELECT '8. 表行数', 'checkins', COUNT(*)::text, '', '', '' FROM public.checkins
UNION ALL SELECT '8. 表行数', 'stripe_events', COUNT(*)::text, '', '', '' FROM public.stripe_events
UNION ALL SELECT '8. 表行数', 'invites', COUNT(*)::text, '', '', '' FROM public.invites
UNION ALL SELECT '8. 表行数', 'member_venues', COUNT(*)::text, '', '', '' FROM public.member_venues
UNION ALL SELECT '8. 表行数', 'requests', COUNT(*)::text, '', '', '' FROM public.requests
UNION ALL SELECT '8. 表行数', 'request_events', COUNT(*)::text, '', '', '' FROM public.request_events
UNION ALL SELECT '8. 表行数', 'audit_logs', COUNT(*)::text, '', '', '' FROM public.audit_logs
UNION ALL SELECT '8. 表行数', 'export_tasks', COUNT(*)::text, '', '', '' FROM public.export_tasks

ORDER BY "类别", "项目1", "项目2";
