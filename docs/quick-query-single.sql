-- =========================================================
-- 数据库结构查询（单表输出，便于复制）
-- 在 Supabase Dashboard → SQL Editor 中运行
-- 一次性执行，一次性复制全部结果
-- =========================================================

-- 使用统一的列结构，通过类别字段区分不同类型的信息
SELECT 
    '类别' AS "类别",
    '项目1' AS "项目1",
    '项目2' AS "项目2",
    '项目3' AS "项目3",
    '项目4' AS "项目4",
    '项目5' AS "项目5"

UNION ALL

-- 1. 所有表列表
SELECT 
    '【1. 表列表】',
    tablename,
    tableowner,
    '',
    '',
    ''
FROM pg_tables
WHERE schemaname = 'public'

UNION ALL

-- 2. 表列信息
SELECT 
    '【2. 表列信息】',
    table_name,
    column_name,
    data_type || CASE 
        WHEN character_maximum_length IS NOT NULL THEN '(' || character_maximum_length || ')'
        WHEN numeric_precision IS NOT NULL AND numeric_scale IS NOT NULL 
        THEN '(' || numeric_precision || ',' || numeric_scale || ')'
        ELSE ''
    END,
    CASE WHEN is_nullable = 'YES' THEN 'NULL' ELSE 'NOT NULL' END,
    COALESCE(column_default, '')
FROM information_schema.columns
WHERE table_schema = 'public'

UNION ALL

-- 3. 主键
SELECT 
    '【3. 主键】',
    tc.table_name,
    kcu.column_name,
    'PRIMARY KEY',
    tc.constraint_name,
    ''
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'

UNION ALL

-- 4. 外键关系
SELECT 
    '【4. 外键】',
    tc.table_name || '.' || kcu.column_name,
    '→',
    ccu.table_name || '.' || ccu.column_name,
    tc.constraint_name,
    ''
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'

UNION ALL

-- 5. 唯一约束
SELECT 
    '【5. 唯一约束】',
    tc.table_name,
    kcu.column_name,
    'UNIQUE',
    tc.constraint_name,
    ''
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE' 
    AND tc.table_schema = 'public'
    AND tc.constraint_name NOT LIKE '%_pkey'

UNION ALL

-- 6. 索引
SELECT 
    '【6. 索引】',
    tablename,
    indexname,
    '',
    '',
    ''
FROM pg_indexes
WHERE schemaname = 'public'

UNION ALL

-- 7. RLS 策略
SELECT 
    '【7. RLS策略】',
    tablename,
    policyname,
    cmd,
    CASE WHEN qual IS NOT NULL THEN '有USING' ELSE '' END,
    CASE WHEN with_check IS NOT NULL THEN '有WITH CHECK' ELSE '' END
FROM pg_policies
WHERE schemaname = 'public'

UNION ALL

-- 8. 函数
SELECT 
    '【8. 函数】',
    proname,
    pg_get_function_arguments(oid),
    CASE WHEN prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END,
    pg_get_function_result(oid),
    ''
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')

UNION ALL

-- 9. 触发器
SELECT 
    '【9. 触发器】',
    c.relname,
    t.tgname,
    n.nspname,
    '',
    ''
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname IN ('public', 'auth') AND NOT t.tgisinternal

UNION ALL

-- 10. 表大小
SELECT 
    '【10. 表大小】',
    tablename,
    pg_size_pretty(pg_total_relation_size('public.' || tablename)),
    pg_size_pretty(pg_relation_size('public.' || tablename)),
    pg_size_pretty(pg_total_relation_size('public.' || tablename) - pg_relation_size('public.' || tablename)),
    ''
FROM pg_tables
WHERE schemaname = 'public'

UNION ALL

-- 11. 表行数
SELECT 
    '【11. 表行数】',
    'profiles',
    COUNT(*)::text,
    '',
    '',
    ''
FROM public.profiles
UNION ALL SELECT '【11. 表行数】', 'regions', COUNT(*)::text, '', '', '' FROM public.regions
UNION ALL SELECT '【11. 表行数】', 'merchants', COUNT(*)::text, '', '', '' FROM public.merchants
UNION ALL SELECT '【11. 表行数】', 'venues', COUNT(*)::text, '', '', '' FROM public.venues
UNION ALL SELECT '【11. 表行数】', 'merchant_members', COUNT(*)::text, '', '', '' FROM public.merchant_members
UNION ALL SELECT '【11. 表行数】', 'admin_users', COUNT(*)::text, '', '', '' FROM public.admin_users
UNION ALL SELECT '【11. 表行数】', 'events', COUNT(*)::text, '', '', '' FROM public.events
UNION ALL SELECT '【11. 表行数】', 'ticket_types', COUNT(*)::text, '', '', '' FROM public.ticket_types
UNION ALL SELECT '【11. 表行数】', 'orders', COUNT(*)::text, '', '', '' FROM public.orders
UNION ALL SELECT '【11. 表行数】', 'tickets', COUNT(*)::text, '', '', '' FROM public.tickets
UNION ALL SELECT '【11. 表行数】', 'checkins', COUNT(*)::text, '', '', '' FROM public.checkins
UNION ALL SELECT '【11. 表行数】', 'stripe_events', COUNT(*)::text, '', '', '' FROM public.stripe_events
UNION ALL SELECT '【11. 表行数】', 'invites', COUNT(*)::text, '', '', '' FROM public.invites
UNION ALL SELECT '【11. 表行数】', 'member_venues', COUNT(*)::text, '', '', '' FROM public.member_venues
UNION ALL SELECT '【11. 表行数】', 'requests', COUNT(*)::text, '', '', '' FROM public.requests
UNION ALL SELECT '【11. 表行数】', 'request_events', COUNT(*)::text, '', '', '' FROM public.request_events
UNION ALL SELECT '【11. 表行数】', 'audit_logs', COUNT(*)::text, '', '', '' FROM public.audit_logs
UNION ALL SELECT '【11. 表行数】', 'export_tasks', COUNT(*)::text, '', '', '' FROM public.export_tasks

ORDER BY "类别", "项目1", "项目2";
