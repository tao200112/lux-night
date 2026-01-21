# 数据库结构查询指南

本指南提供多种方式直接查询 Supabase PostgreSQL 数据库结构。

---

## 方法 1: Python 脚本（推荐）

### 前置要求
```bash
pip install psycopg2-binary
```

### 使用方法
```bash
# 设置数据库连接字符串
export DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.hbbhtmvcqpdybclbdtot.supabase.co:5432/postgres"

# 运行脚本
python scripts/query_db_structure.py
```

### 输出内容
- ✅ 所有表列表
- ✅ 每张表的列信息（类型、可空性、默认值）
- ✅ 外键约束关系
- ✅ 索引信息
- ✅ RLS 策略
- ✅ 函数列表（SECURITY DEFINER）
- ✅ 触发器信息
- ✅ 表统计信息（大小）
- ✅ 表行数统计

---

## 方法 2: PowerShell 脚本（Windows）

### 前置要求
- PostgreSQL 客户端工具（psql）
- 或使用 Python 脚本

### 使用方法
```powershell
# 设置数据库连接字符串
$env:DATABASE_URL = "postgresql://postgres:[YOUR-PASSWORD]@db.hbbhtmvcqpdybclbdtot.supabase.co:5432/postgres"

# 运行脚本
.\scripts\query_db_structure.ps1
```

---

## 方法 3: 直接使用 psql

### 连接数据库
```bash
psql "postgresql://postgres:[YOUR-PASSWORD]@db.hbbhtmvcqpdybclbdtot.supabase.co:5432/postgres"
```

### 常用查询命令

#### 1. 查看所有表
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

#### 2. 查看表结构
```sql
\d+ profiles
\d+ merchants
\d+ events
```

#### 3. 查看所有表的列信息
```sql
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

#### 4. 查看外键约束
```sql
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public';
```

#### 5. 查看 RLS 策略
```sql
SELECT * FROM pg_policies WHERE schemaname = 'public';
```

#### 6. 查看函数
```sql
SELECT
    proname AS function_name,
    CASE WHEN prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security_type
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY proname;
```

---

## 方法 4: Supabase Dashboard SQL Editor

1. 登录 Supabase Dashboard
2. 进入项目 → SQL Editor
3. 复制 `docs/query-db-structure.sql` 中的查询
4. 执行查询

---

## 方法 5: 使用数据库客户端工具

### DBeaver / pgAdmin / TablePlus

1. 创建新连接
2. 连接信息：
   - **Host**: `db.hbbhtmvcqpdybclbdtot.supabase.co`
   - **Port**: `5432`
   - **Database**: `postgres`
   - **User**: `postgres`
   - **Password**: `[YOUR-PASSWORD]`
3. 连接后可以浏览所有表、视图、函数等

---

## 安全提示

⚠️ **重要**: 
- 不要在代码中硬编码密码
- 使用环境变量存储连接字符串
- 不要将包含密码的文件提交到 Git
- 建议使用 `.env` 文件（已添加到 `.gitignore`）

### 示例 .env 文件
```bash
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.hbbhtmvcqpdybclbdtot.supabase.co:5432/postgres
```

---

## 快速查询示例

### 查看特定表的结构
```sql
-- 查看 profiles 表
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles'
ORDER BY ordinal_position;
```

### 查看表的行数
```sql
SELECT 
    'profiles' AS table_name,
    COUNT(*) AS row_count
FROM public.profiles
UNION ALL
SELECT 'merchants', COUNT(*) FROM public.merchants
UNION ALL
SELECT 'events', COUNT(*) FROM public.events;
```

### 查看表的大小
```sql
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size('public.' || tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.' || tablename) DESC;
```

---

## 故障排除

### Python 脚本无法连接
- 检查 `DATABASE_URL` 是否正确设置
- 检查密码是否包含特殊字符（可能需要 URL 编码）
- 检查网络连接和防火墙设置

### psql 命令不存在
- Windows: 安装 PostgreSQL 客户端工具
- macOS: `brew install postgresql`
- Linux: `sudo apt-get install postgresql-client`

### 连接超时
- 检查 Supabase 项目是否正常运行
- 检查 IP 白名单设置（Supabase Dashboard → Settings → Database）

---

## 相关文件

- `scripts/query_db_structure.py` - Python 查询脚本
- `scripts/query_db_structure.ps1` - PowerShell 查询脚本
- `docs/query-db-structure.sql` - SQL 查询脚本（用于 Dashboard）
- `docs/db-overview.md` - 数据库结构文档（基于 migrations）
- `docs/db-qa-report.md` - QA 验收报告
