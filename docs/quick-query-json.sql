-- =========================================================
-- 数据库结构查询（JSON 格式输出）
-- 在 Supabase Dashboard → SQL Editor 中运行
-- 返回单个 JSON 对象，包含所有数据库结构信息
-- =========================================================

SELECT jsonb_pretty(
    jsonb_build_object(
        'tables', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'name', tablename,
                    'owner', tableowner
                )
            )
            FROM pg_tables
            WHERE schemaname = 'public'
        ),
        'columns', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'table', table_name,
                    'column', column_name,
                    'type', data_type,
                    'nullable', is_nullable = 'YES',
                    'default', column_default,
                    'position', ordinal_position
                )
            )
            FROM information_schema.columns
            WHERE table_schema = 'public'
        ),
        'foreign_keys', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'table', tc.table_name,
                    'column', kcu.column_name,
                    'references_table', ccu.table_name,
                    'references_column', ccu.column_name,
                    'constraint', tc.constraint_name
                )
            )
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
        ),
        'rls_policies', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'table', tablename,
                    'policy', policyname,
                    'command', cmd,
                    'using', qual,
                    'with_check', with_check
                )
            )
            FROM pg_policies
            WHERE schemaname = 'public'
        ),
        'functions', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'name', proname,
                    'arguments', pg_get_function_arguments(oid),
                    'return_type', pg_get_function_result(oid),
                    'security', CASE WHEN prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END
                )
            )
            FROM pg_proc
            WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        ),
        'triggers', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'schema', n.nspname,
                    'table', c.relname,
                    'name', t.tgname,
                    'definition', pg_get_triggerdef(t.oid)
                )
            )
            FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname IN ('public', 'auth') AND NOT t.tgisinternal
        ),
        'indexes', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'table', tablename,
                    'name', indexname,
                    'definition', indexdef
                )
            )
            FROM pg_indexes
            WHERE schemaname = 'public'
        ),
        'table_sizes', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'table', tablename,
                    'total_size', pg_size_pretty(pg_total_relation_size('public.' || tablename)),
                    'table_size', pg_size_pretty(pg_relation_size('public.' || tablename)),
                    'indexes_size', pg_size_pretty(pg_total_relation_size('public.' || tablename) - pg_relation_size('public.' || tablename))
                )
            )
            FROM pg_tables
            WHERE schemaname = 'public'
        ),
        'row_counts', (
            SELECT jsonb_build_object(
                'profiles', (SELECT COUNT(*) FROM public.profiles),
                'regions', (SELECT COUNT(*) FROM public.regions),
                'merchants', (SELECT COUNT(*) FROM public.merchants),
                'venues', (SELECT COUNT(*) FROM public.venues),
                'merchant_members', (SELECT COUNT(*) FROM public.merchant_members),
                'admin_users', (SELECT COUNT(*) FROM public.admin_users),
                'events', (SELECT COUNT(*) FROM public.events),
                'ticket_types', (SELECT COUNT(*) FROM public.ticket_types),
                'orders', (SELECT COUNT(*) FROM public.orders),
                'tickets', (SELECT COUNT(*) FROM public.tickets),
                'checkins', (SELECT COUNT(*) FROM public.checkins),
                'stripe_events', (SELECT COUNT(*) FROM public.stripe_events),
                'invites', (SELECT COUNT(*) FROM public.invites),
                'member_venues', (SELECT COUNT(*) FROM public.member_venues),
                'requests', (SELECT COUNT(*) FROM public.requests),
                'request_events', (SELECT COUNT(*) FROM public.request_events),
                'audit_logs', (SELECT COUNT(*) FROM public.audit_logs),
                'export_tasks', (SELECT COUNT(*) FROM public.export_tasks)
            )
        )
    )
) AS "数据库结构信息";
