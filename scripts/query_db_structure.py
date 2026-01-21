#!/usr/bin/env python3
"""
数据库结构查询工具
直接连接 Supabase PostgreSQL 数据库并查询结构信息
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from urllib.parse import urlparse, parse_qs
import json

# 数据库连接字符串
# 使用方法：export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.hbbhtmvcqpdybclbdtot.supabase.co:5432/postgres"
# 或者在脚本中直接设置
DATABASE_URL = os.getenv('DATABASE_URL', '')

if not DATABASE_URL:
    print("❌ 错误: 请设置 DATABASE_URL 环境变量")
    print("   例如: export DATABASE_URL='postgresql://postgres:[PASSWORD]@db.hbbhtmvcqpdybclbdtot.supabase.co:5432/postgres'")
    sys.exit(1)

def connect_db():
    """连接到数据库"""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"❌ 连接数据库失败: {e}")
        sys.exit(1)

def query_tables(conn):
    """查询所有表"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT 
                schemaname AS schema,
                tablename AS table_name,
                tableowner AS owner
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename;
        """)
        return cur.fetchall()

def query_columns(conn):
    """查询所有表的列信息"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
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
        """)
        return cur.fetchall()

def query_foreign_keys(conn):
    """查询外键约束"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT
                tc.table_name,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name,
                tc.constraint_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = 'public'
            ORDER BY tc.table_name, kcu.column_name;
        """)
        return cur.fetchall()

def query_indexes(conn):
    """查询索引信息"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT
                schemaname AS schema,
                tablename AS table_name,
                indexname AS index_name,
                indexdef AS definition
            FROM pg_indexes
            WHERE schemaname = 'public'
            ORDER BY tablename, indexname;
        """)
        return cur.fetchall()

def query_rls_policies(conn):
    """查询 RLS 策略"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
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
        """)
        return cur.fetchall()

def query_functions(conn):
    """查询函数"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
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
        """)
        return cur.fetchall()

def query_triggers(conn):
    """查询触发器"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
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
        """)
        return cur.fetchall()

def query_table_stats(conn):
    """查询表统计信息"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT
                schemaname AS schema,
                tablename AS table_name,
                pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
                pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
                pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
        """)
        return cur.fetchall()

def query_row_counts(conn):
    """查询表行数"""
    tables = [
        'profiles', 'regions', 'merchants', 'venues', 'merchant_members',
        'admin_users', 'events', 'ticket_types', 'orders', 'order_items',
        'tickets', 'checkins', 'stripe_events', 'invites', 'member_venues',
        'requests', 'request_events', 'audit_logs', 'export_tasks'
    ]
    
    results = []
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        for table in tables:
            try:
                cur.execute(f"SELECT COUNT(*) AS count FROM public.{table};")
                result = cur.fetchone()
                results.append({'table_name': table, 'row_count': result['count']})
            except Exception as e:
                results.append({'table_name': table, 'row_count': None, 'error': str(e)})
    
    return results

def print_section(title):
    """打印章节标题"""
    print("\n" + "="*80)
    print(f"  {title}")
    print("="*80)

def print_table(data, title=None):
    """打印表格数据"""
    if not data:
        print("  (无数据)")
        return
    
    if title:
        print(f"\n{title}:")
    
    # 获取列名
    columns = list(data[0].keys())
    
    # 计算列宽
    col_widths = {}
    for col in columns:
        col_widths[col] = max(
            len(str(col)),
            max(len(str(row.get(col, ''))) for row in data) if data else 0
        )
    
    # 打印表头
    header = " | ".join(str(col).ljust(col_widths[col]) for col in columns)
    print(header)
    print("-" * len(header))
    
    # 打印数据行
    for row in data:
        values = [str(row.get(col, '')).ljust(col_widths[col]) for col in columns]
        print(" | ".join(values))

def main():
    """主函数"""
    print("🔍 正在连接数据库...")
    conn = connect_db()
    print("✅ 数据库连接成功!\n")
    
    try:
        # 1. 表列表
        print_section("1. 所有表列表")
        tables = query_tables(conn)
        print_table(tables)
        print(f"\n  总计: {len(tables)} 张表")
        
        # 2. 列信息
        print_section("2. 表列信息")
        columns = query_columns(conn)
        # 按表分组显示
        tables_dict = {}
        for col in columns:
            table = col['table_name']
            if table not in tables_dict:
                tables_dict[table] = []
            tables_dict[table].append(col)
        
        for table, cols in tables_dict.items():
            print(f"\n📋 {table}:")
            for col in cols:
                nullable = "NULL" if col['is_nullable'] == 'YES' else "NOT NULL"
                default = f" DEFAULT {col['column_default']}" if col['column_default'] else ""
                print(f"  - {col['column_name']:<30} {col['full_type']:<20} {nullable}{default}")
        
        # 3. 外键约束
        print_section("3. 外键约束")
        fks = query_foreign_keys(conn)
        print_table(fks)
        
        # 4. 索引
        print_section("4. 索引信息")
        indexes = query_indexes(conn)
        # 按表分组
        indexes_dict = {}
        for idx in indexes:
            table = idx['table_name']
            if table not in indexes_dict:
                indexes_dict[table] = []
            indexes_dict[table].append(idx)
        
        for table, idxs in indexes_dict.items():
            print(f"\n📋 {table}:")
            for idx in idxs:
                print(f"  - {idx['index_name']}")
        
        # 5. RLS 策略
        print_section("5. RLS 策略")
        policies = query_rls_policies(conn)
        # 按表分组
        policies_dict = {}
        for policy in policies:
            table = policy['table_name']
            if table not in policies_dict:
                policies_dict[table] = []
            policies_dict[table].append(policy)
        
        for table, pols in policies_dict.items():
            print(f"\n📋 {table}:")
            for pol in pols:
                print(f"  - {pol['policy_name']} ({pol['command']})")
        
        # 6. 函数
        print_section("6. 函数列表")
        functions = query_functions(conn)
        print_table(functions)
        
        # 7. 触发器
        print_section("7. 触发器")
        triggers = query_triggers(conn)
        # 按表分组
        triggers_dict = {}
        for trigger in triggers:
            table = trigger['table_name']
            key = f"{trigger['schema_name']}.{table}"
            if key not in triggers_dict:
                triggers_dict[key] = []
            triggers_dict[key].append(trigger)
        
        for key, trgs in triggers_dict.items():
            print(f"\n📋 {key}:")
            for trg in trgs:
                print(f"  - {trg['trigger_name']}")
        
        # 8. 表统计信息
        print_section("8. 表统计信息（大小）")
        stats = query_table_stats(conn)
        print_table(stats)
        
        # 9. 表行数
        print_section("9. 表行数统计")
        row_counts = query_row_counts(conn)
        print_table(row_counts)
        
    finally:
        conn.close()
        print("\n✅ 查询完成!")

if __name__ == '__main__':
    main()
