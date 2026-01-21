-- =========================================================
-- 数据库结构完整查询（一次性执行）
-- 在 Supabase Dashboard → SQL Editor 中运行
-- 复制所有内容，一次性执行，然后复制全部结果
-- =========================================================

-- =========================================================
-- 1. 所有表列表
-- =========================================================
SELECT 
    '=== 1. 所有表列表 ===' AS section,
    '' AS empty1,
    '' AS empty2,
    '' AS empty3;

SELECT 
    ROW_NUMBER() OVER (ORDER BY tablename) AS "序号",
    tablename AS "表名",
    tableowner AS "所有者"
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- =========================================================
-- 2. 所有表的列信息（完整结构）
-- =========================================================
SELECT 
    '=== 2. 所有表的列信息 ===' AS section,
    '' AS empty1,
    '' AS empty2,
    '' AS empty3;

SELECT 
    t.table_name AS "表名",
    c.column_name AS "列名",
    CASE 
        WHEN c.character_maximum_length IS NOT NULL 
        THEN c.data_type || '(' || c.character_maximum_length || ')'
        WHEN c.numeric_precision IS NOT NULL AND c.numeric_scale IS NOT NULL
        THEN c.data_type || '(' || c.numeric_precision || ',' || c.numeric_scale || ')'
        ELSE c.data_type
    END AS "数据类型",
    CASE WHEN c.is_nullable = 'YES' THEN 'NULL' ELSE 'NOT NULL' END AS "可空",
    COALESCE(c.column_default, '') AS "默认值",
    c.ordinal_position AS "位置"
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;

-- =========================================================
-- 3. 表统计信息（列数）
-- =========================================================
SELECT 
    '=== 3. 表统计信息（列数） ===' AS section,
    '' AS empty1,
    '' AS empty2,
    '' AS empty3;

SELECT 
    t.table_name AS "表名",
    COUNT(c.column_name) AS "列数"
FROM information_schema.tables t
LEFT JOIN information_schema.columns c 
    ON t.table_name = c.table_name 
    AND t.table_schema = c.table_schema
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
GROUP BY t.table_name
ORDER BY t.table_name;

-- =========================================================
-- 4. 主键约束
-- =========================================================
SELECT 
    '=== 4. 主键约束 ===' AS section,
    '' AS empty1,
    '' AS empty2,
    '' AS empty3;

SELECT
    tc.table_name AS "表名",
    kcu.column_name AS "主键列",
    tc.constraint_name AS "约束名"
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.ordinal_position;

-- =========================================================
-- 5. 外键约束（完整关系）
-- =========================================================
SELECT 
    '=== 5. 外键约束 ===' AS section,
    '' AS empty1,
    '' AS empty2,
    '' AS empty3;

SELECT
    ROW_NUMBER() OVER (ORDER BY tc.table_name, kcu.column_name) AS "序号",
    tc.table_name AS "表名",
    kcu.column_name AS "列名",
    ccu.table_name AS "引用表",
    ccu.column_name AS "引用列",
    tc.constraint_name AS "约束名"
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- =========================================================
-- 6. 唯一约束
-- =========================================================
SELECT 
    '=== 6. 唯一约束 ===' AS section,
    '' AS empty1,
    '' AS empty2,
    '' AS empty3;

SELECT
    tc.table_name AS "表名",
    kcu.column_name AS "列名",
    tc.constraint_name AS "约束名"
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
    AND tc.table_schema = 'public'
    AND tc.constraint_name NOT LIKE '%_pkey'  -- 排除主键
ORDER BY tc.table_name, kcu.column_name;

-- =========================================================
-- 7. 索引信息
-- =========================================================
SELECT 
    '=== 7. 索引信息 ===' AS section,
    '' AS empty1,
    '' AS empty2,
    '' AS empty3;

SELECT
    tablename AS "表名",
    indexname AS "索引名",
    indexdef AS "定义"
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- =========================================================
-- 8. RLS 策略
-- =========================================================
SELECT 
    '=== 8. RLS 策略 ===' AS section,
    '' AS empty1,
    '' AS empty2,
    '' AS empty3;

SELECT
    tablename AS "表名",
    policyname AS "策略名",
    cmd AS "命令",
    CASE 
        WHEN qual IS NOT NULL THEN 'YES' 
        ELSE 'NO' 
    END AS "有USING表达式",
    CASE 
        WHEN with_check IS NOT NULL THEN 'YES' 
        ELSE 'NO' 
    END AS "有WITH CHECK表达式"
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- =========================================================
-- 9. RLS 策略详情（完整表达式）
-- =========================================================
SELECT 
    '=== 9. RLS 策略详情 ===' AS section,
    '' AS empty1,
    '' AS empty2,
    '' AS empty3;

SELECT
    tablename AS "表名",
    policyname AS "策略名",
    cmd AS "命令",
    qual AS "USING表达式",
    with_check AS "WITH CHECK表达式"
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- =========================================================
-- 10. 函数列表
-- =========================================================
SELECT 
    '=== 10. 函数列表 ===' AS section,
    '' AS empty1,
    '' AS empty2,
    '' AS empty3;

SELECT
    proname AS "函数名",
    pg_get_function_arguments(oid) AS "参数",
    CASE 
        WHEN prosecdef THEN 'SECURITY DEFINER'
        ELSE 'SECURITY INVOKER'
    END AS "安全类型",
    pg_get_function_result(oid) AS "返回类型"
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY proname;

-- =========================================================
-- 11. 触发器信息
-- =========================================================
SELECT 
    '=== 11. 触发器信息 ===' AS section,
    '' AS empty1,
    '' AS empty2,
    '' AS empty3;

SELECT
    n.nspname AS "模式",
    c.relname AS "表名",
    t.tgname AS "触发器名",
    pg_get_triggerdef(t.oid) AS "定义"
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname IN ('public', 'auth')
    AND NOT t.tgisinternal
ORDER BY n.nspname, c.relname, t.tgname;

-- =========================================================
-- 12. 表大小统计
-- =========================================================
SELECT 
    '=== 12. 表大小统计 ===' AS section,
    '' AS empty1,
    '' AS empty2,
    '' AS empty3;

SELECT
    tablename AS "表名",
    pg_size_pretty(pg_total_relation_size('public.' || tablename)) AS "总大小",
    pg_size_pretty(pg_relation_size('public.' || tablename)) AS "表大小",
    pg_size_pretty(pg_total_relation_size('public.' || tablename) - pg_relation_size('public.' || tablename)) AS "索引大小"
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.' || tablename) DESC;

-- =========================================================
-- 13. 表行数统计
-- =========================================================
SELECT 
    '=== 13. 表行数统计 ===' AS section,
    '' AS empty1,
    '' AS empty2,
    '' AS empty3;

SELECT 'profiles' AS "表名", COUNT(*) AS "行数" FROM public.profiles
UNION ALL SELECT 'regions', COUNT(*) FROM public.regions
UNION ALL SELECT 'merchants', COUNT(*) FROM public.merchants
UNION ALL SELECT 'venues', COUNT(*) FROM public.venues
UNION ALL SELECT 'merchant_members', COUNT(*) FROM public.merchant_members
UNION ALL SELECT 'member_venues', COUNT(*) FROM public.member_venues
UNION ALL SELECT 'invites', COUNT(*) FROM public.invites
UNION ALL SELECT 'admin_users', COUNT(*) FROM public.admin_users
UNION ALL SELECT 'events', COUNT(*) FROM public.events
UNION ALL SELECT 'ticket_types', COUNT(*) FROM public.ticket_types
UNION ALL SELECT 'orders', COUNT(*) FROM public.orders
UNION ALL SELECT 'order_items', COUNT(*) FROM public.order_items
UNION ALL SELECT 'tickets', COUNT(*) FROM public.tickets
UNION ALL SELECT 'checkins', COUNT(*) FROM public.checkins
UNION ALL SELECT 'stripe_events', COUNT(*) FROM public.stripe_events
UNION ALL SELECT 'requests', COUNT(*) FROM public.requests
UNION ALL SELECT 'request_events', COUNT(*) FROM public.request_events
UNION ALL SELECT 'audit_logs', COUNT(*) FROM public.audit_logs
UNION ALL SELECT 'export_tasks', COUNT(*) FROM public.export_tasks
ORDER BY "表名";

-- =========================================================
-- 14. CHECK 约束
-- =========================================================
SELECT 
    '=== 14. CHECK 约束 ===' AS section,
    '' AS empty1,
    '' AS empty2,
    '' AS empty3;

SELECT
    tc.table_name AS "表名",
    tc.constraint_name AS "约束名",
    cc.check_clause AS "检查条件"
FROM information_schema.table_constraints AS tc
JOIN information_schema.check_constraints AS cc
    ON tc.constraint_name = cc.constraint_name
WHERE tc.constraint_type = 'CHECK'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- =========================================================
-- 15. 表关系图（简化版）
-- =========================================================
SELECT 
    '=== 15. 表关系图（外键关系） ===' AS section,
    '' AS empty1,
    '' AS empty2,
    '' AS empty3;

SELECT
    tc.table_name || '.' || kcu.column_name AS "表.列",
    '→' AS "关系",
    ccu.table_name || '.' || ccu.column_name AS "引用表.列"
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- =========================================================
-- 完成
-- =========================================================
SELECT 
    '=== 查询完成 ===' AS section,
    '所有数据库结构信息已查询完毕' AS message,
    '可以复制上方所有结果' AS note,
    '' AS empty;
