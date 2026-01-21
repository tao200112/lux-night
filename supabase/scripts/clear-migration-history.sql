-- =========================================================
-- 清空 Migration History
-- =========================================================
-- 说明：
-- 你已经删除了所有表和数据，但 migration history 还保留着
-- 执行这个 SQL 清空 history，让 Supabase 认为是"全新数据库"
-- =========================================================

-- 清空 migration history 表
TRUNCATE supabase_migrations.schema_migrations;

-- 验证已清空
SELECT version FROM supabase_migrations.schema_migrations;
-- 应该返回 0 rows

-- 完成
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Migration history cleared!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next step:';
  RAISE NOTICE '  Run: npx supabase db push';
  RAISE NOTICE '========================================';
END $$;
