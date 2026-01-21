# 本地数据库查询指南（PowerShell + psql）

## 🚀 快速开始

### 步骤 1: 检查是否已安装 psql

```powershell
# 检查 psql 是否可用
psql --version
```

如果显示版本信息，说明已安装，跳到步骤 3。

### 步骤 2: 安装 PostgreSQL 客户端工具

#### 方法 A: 使用 Chocolatey（推荐）

```powershell
# 安装 Chocolatey（如果还没有）
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# 安装 PostgreSQL 客户端工具
choco install postgresql --params '/Password:postgres'
```

#### 方法 B: 使用 Scoop

```powershell
# 安装 Scoop（如果还没有）
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex

# 安装 PostgreSQL
scoop install postgresql
```

#### 方法 C: 手动下载安装

1. 访问: https://www.postgresql.org/download/windows/
2. 下载 PostgreSQL 安装程序
3. 安装时选择 **"Command Line Tools"** 组件
4. 确保安装目录的 `bin` 文件夹在 PATH 环境变量中

#### 方法 D: 使用安装助手脚本

```powershell
.\scripts\setup_psql.ps1
```

### 步骤 3: 设置数据库密码

```powershell
# 方法 1: 设置环境变量（推荐）
$env:PGPASSWORD = "your-password-here"

# 方法 2: 在脚本中直接提供（见步骤 4）
```

### 步骤 4: 运行查询脚本

```powershell
# 查看所有表
.\scripts\query_db_local.ps1 -Password "your-password" -Query tables

# 查看表结构
.\scripts\query_db_local.ps1 -Password "your-password" -Query structure

# 查看外键
.\scripts\query_db_local.ps1 -Password "your-password" -Query fks

# 查看统计信息
.\scripts\query_db_local.ps1 -Password "your-password" -Query stats

# 查看所有信息
.\scripts\query_db_local.ps1 -Password "your-password" -Query all
```

---

## 📋 直接使用 psql 命令

### 连接数据库

```powershell
# 设置密码
$env:PGPASSWORD = "your-password"

# 连接（进入交互式模式）
psql -h db.hbbhtmvcqpdybclbdtot.supabase.co -p 5432 -U postgres -d postgres
```

### 常用查询命令

#### 查看所有表
```sql
\dt
-- 或
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

#### 查看表结构
```sql
\d profiles
-- 或详细结构
\d+ profiles
```

#### 查看所有表的列信息
```sql
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

#### 查看外键
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

#### 查看表大小
```sql
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size('public.' || tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.' || tablename) DESC;
```

#### 查看表行数
```sql
SELECT COUNT(*) FROM public.profiles;
```

### 退出交互式模式
```sql
\q
```

---

## 🔧 非交互式查询（一行命令）

```powershell
# 设置密码
$env:PGPASSWORD = "your-password"

# 查看所有表
psql -h db.hbbhtmvcqpdybclbdtot.supabase.co -p 5432 -U postgres -d postgres -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"

# 查看特定表的结构
psql -h db.hbbhtmvcqpdybclbdtot.supabase.co -p 5432 -U postgres -d postgres -c "\d+ profiles"

# 查看表数据（前10行）
psql -h db.hbbhtmvcqpdybclbdtot.supabase.co -p 5432 -U postgres -d postgres -c "SELECT * FROM public.profiles LIMIT 10;"
```

---

## 📝 创建查询脚本文件

创建 `my_query.sql`:

```sql
-- 查看所有表及其行数
SELECT 
    'profiles' AS table_name,
    COUNT(*) AS row_count
FROM public.profiles
UNION ALL
SELECT 'merchants', COUNT(*) FROM public.merchants
UNION ALL
SELECT 'events', COUNT(*) FROM public.events;
```

运行:

```powershell
$env:PGPASSWORD = "your-password"
psql -h db.hbbhtmvcqpdybclbdtot.supabase.co -p 5432 -U postgres -d postgres -f my_query.sql
```

---

## 🎯 实用示例

### 查看特定表的所有列
```powershell
$env:PGPASSWORD = "your-password"
psql -h db.hbbhtmvcqpdybclbdtot.supabase.co -p 5432 -U postgres -d postgres -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' ORDER BY ordinal_position;"
```

### 查看表的索引
```powershell
$env:PGPASSWORD = "your-password"
psql -h db.hbbhtmvcqpdybclbdtot.supabase.co -p 5432 -U postgres -d postgres -c "\d+ profiles"
```

### 查看 RLS 策略
```powershell
$env:PGPASSWORD = "your-password"
psql -h db.hbbhtmvcqpdybclbdtot.supabase.co -p 5432 -U postgres -d postgres -c "SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles';"
```

---

## ⚠️ 故障排除

### psql: command not found
- 确保 PostgreSQL 客户端工具已安装
- 检查 `bin` 目录是否在 PATH 中
- 重新打开 PowerShell 窗口

### 连接超时
- 检查网络连接
- 检查 Supabase 项目是否正常运行
- 检查防火墙设置

### 认证失败
- 检查密码是否正确
- 检查用户名是否为 `postgres`
- 检查数据库名称是否为 `postgres`

### 权限错误
- 确保使用 `postgres` 用户
- 检查 Supabase Dashboard 中的数据库设置

---

## 📚 相关文件

- `scripts/query_db_local.ps1` - 主查询脚本
- `scripts/setup_psql.ps1` - 安装助手脚本
- `docs/quick-query.sql` - SQL 查询示例
- `LOCAL_DB_QUERY_GUIDE.md` - 本指南

---

## 💡 提示

1. **保存密码**: 可以创建 `.env` 文件存储密码（不要提交到 Git）
2. **使用别名**: 创建 PowerShell 函数简化命令
3. **交互式模式**: 使用 `psql` 进入交互式模式，更方便浏览

### 创建 PowerShell 别名

```powershell
# 添加到 PowerShell Profile ($PROFILE)
function Connect-Supabase {
    $env:PGPASSWORD = "your-password"
    psql -h db.hbbhtmvcqpdybclbdtot.supabase.co -p 5432 -U postgres -d postgres
}

function Query-Supabase {
    param([string]$Query)
    $env:PGPASSWORD = "your-password"
    psql -h db.hbbhtmvcqpdybclbdtot.supabase.co -p 5432 -U postgres -d postgres -c $Query
}
```

使用:
```powershell
Connect-Supabase
Query-Supabase "SELECT COUNT(*) FROM public.profiles;"
```
