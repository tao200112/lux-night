-- =========================================================
-- 简化版：数据库结构查询（一次性执行）
-- 只包含最核心的信息，输出更简洁
-- =========================================================

-- 1. 所有表列表
SELECT '=== 1. 所有表 ===' AS info;
SELECT tablename AS "表名" FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- 2. 表结构（关键表）
SELECT '=== 2. 核心表结构 ===' AS info;
SELECT 
    table_name AS "表名",
    column_name AS "列名",
    data_type AS "类型",
    is_nullable AS "可空"
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name IN ('profiles', 'merchants', 'venues', 'events', 'orders', 'tickets', 'admin_users', 'merchant_members')
ORDER BY table_name, ordinal_position;

-- 3. 外键关系
SELECT '=== 3. 外键关系 ===' AS info;
SELECT
    tc.table_name || '.' || kcu.column_name AS "表.列",
    ccu.table_name || '.' || ccu.column_name AS "引用表.列"
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- 4. RLS 策略
SELECT '=== 4. RLS 策略 ===' AS info;
SELECT tablename AS "表名", policyname AS "策略名", cmd AS "命令"
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;

-- 5. 函数
SELECT '=== 5. 函数 ===' AS info;
SELECT proname AS "函数名", 
    CASE WHEN prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS "安全类型"
FROM pg_proc WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY proname;

-- 6. 触发器
SELECT '=== 6. 触发器 ===' AS info;
SELECT c.relname AS "表名", t.tgname AS "触发器名"
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname IN ('public', 'auth') AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

-- 7. 表行数
SELECT '=== 7. 表行数 ===' AS info;
SELECT 'profiles' AS "表名", COUNT(*) AS "行数" FROM public.profiles
UNION ALL SELECT 'merchants', COUNT(*) FROM public.merchants
UNION ALL SELECT 'venues', COUNT(*) FROM public.venues
UNION ALL SELECT 'events', COUNT(*) FROM public.events
UNION ALL SELECT 'orders', COUNT(*) FROM public.orders
UNION ALL SELECT 'tickets', COUNT(*) FROM public.tickets
UNION ALL SELECT 'admin_users', COUNT(*) FROM public.admin_users
UNION ALL SELECT 'merchant_members', COUNT(*) FROM public.merchant_members
ORDER BY "表名";
