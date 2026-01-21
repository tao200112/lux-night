# 快速开始：查询数据库结构

## 🚀 最简单的方法：Supabase Dashboard

1. **登录 Supabase Dashboard**
   - 访问: https://supabase.com/dashboard
   - 选择你的项目

2. **打开 SQL Editor**
   - 左侧菜单 → SQL Editor

3. **运行查询**
   - 复制 `docs/quick-query.sql` 中的任意查询
   - 粘贴到 SQL Editor
   - 点击 "Run" 或按 `Ctrl+Enter`

---

## 💻 使用 PowerShell（Windows）

### 前提条件
- 安装 PostgreSQL 客户端工具（psql）
- 如果没有，可以下载: https://www.postgresql.org/download/windows/

### 快速查询

```powershell
# 设置密码
$password = "your-password-here"

# 运行查询脚本
.\scripts\quick_query.ps1 -Password $password
```

### 手动查询特定表

```powershell
$env:PGPASSWORD = "your-password"
psql -h db.hbbhtmvcqpdybclbdtot.supabase.co -p 5432 -U postgres -d postgres -c "\d+ profiles"
```

---

## 📋 常用查询命令

### 查看所有表
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

### 查看表结构
```sql
-- 在 Supabase Dashboard SQL Editor 中运行
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles'  -- 修改表名
ORDER BY ordinal_position;
```

### 查看表数据（前10行）
```sql
SELECT * FROM public.profiles LIMIT 10;
```

### 查看表行数
```sql
SELECT COUNT(*) FROM public.profiles;
```

---

## 🔧 使用数据库客户端工具

### DBeaver（推荐）

1. **下载**: https://dbeaver.io/download/
2. **创建连接**:
   - 类型: PostgreSQL
   - Host: `db.hbbhtmvcqpdybclbdtot.supabase.co`
   - Port: `5432`
   - Database: `postgres`
   - User: `postgres`
   - Password: `[你的密码]`
3. **连接后**:
   - 左侧可以看到所有表
   - 双击表名查看结构
   - 右键表名 → "View Data" 查看数据

### TablePlus

1. **下载**: https://tableplus.com/
2. **创建连接**: 同上
3. **浏览**: 图形化界面，非常直观

---

## 📚 相关文件

- `docs/quick-query.sql` - 快速查询 SQL（用于 Dashboard）
- `docs/query-db-structure.sql` - 完整查询 SQL
- `scripts/quick_query.ps1` - PowerShell 快速查询脚本
- `docs/db-overview.md` - 数据库结构文档（基于 migrations）

---

## ⚠️ 安全提示

- **不要**在代码中硬编码密码
- **不要**将包含密码的文件提交到 Git
- **使用**环境变量或 `.env` 文件存储密码
- **建议**使用 Supabase Dashboard（密码已安全存储）

---

## 🆘 遇到问题？

### psql 命令不存在
- Windows: 安装 PostgreSQL 客户端工具
- 或使用 Supabase Dashboard（无需安装）

### 连接失败
- 检查密码是否正确
- 检查 Supabase 项目是否正常运行
- 检查网络连接

### 权限错误
- 确保使用 `postgres` 用户
- 检查 Supabase Dashboard 中的数据库设置
