# Supabase Database Reset & Migration Guide

## 概述

本指南提供完整的数据库重置和迁移流程，用于将 Supabase 远程数据库重置为干净状态，并应用最新的 schema。

---

## 📁 文件结构

```
supabase/
├── migrations/
│   ├── 001_schema.sql          # 完整表结构（最终态）
│   ├── 002_rls.sql             # RLS 策略
│   ├── 003_rpc.sql             # RPC 函数
│   ├── 004_seed.sql            # 测试数据（token=1461）
│   └── _deprecated/            # 旧 migrations（已弃用）
│       ├── 001_initial_schema.sql
│       ├── 002_rls_policies.sql
│       └── ... (009-930)
└── scripts/
    └── reset-remote.sql        # 远程数据库重置脚本
```

---

## 🚨 重要提醒

**⚠️ WARNING: 重置操作会删除 public schema 的所有数据！**

- ✅ 不会影响 `auth.users`（用户账号保留）
- ✅ 不会影响 `storage`（文件存储保留）
- ❌ 会删除所有 public 表数据（profiles、orders、tickets 等）

**请确保：**
1. 已备份重要数据
2. 在开发/测试环境执行
3. 如果是生产环境，请三思而后行

---

## 📋 执行流程

### 方法 1: Supabase Dashboard（推荐）

#### 步骤 1: 重置远程数据库

1. 打开 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **SQL Editor**
4. 打开文件 `supabase/scripts/reset-remote.sql`
5. 复制全部内容到 SQL Editor
6. 点击 **Run** 执行

**预期输出：**
```
✅ Remote database reset complete!

Next steps:
1. Run: npx supabase db push
2. This will apply all migrations in order
```

#### 步骤 2: 应用新 migrations

在项目根目录执行：

```bash
npx supabase db push
```

**预期输出：**
```
Applying migration 001_schema.sql...
✅ Schema created successfully!
   - 19 tables created
   
Applying migration 002_rls.sql...
✅ RLS policies created successfully!
   - 19 tables secured
   
Applying migration 003_rpc.sql...
✅ RPC functions created successfully!
   - redeem_invite()
   - create_staff_invite()
   
Applying migration 004_seed.sql...
✅ Seed data created successfully!

Test invite code: 1461
  - Merchant: Test Merchant (Invite 1461)
  - Role: OWNER
```

---

### 方法 2: Supabase CLI（本地 + 远程）

#### 前置要求

确保已安装 Supabase CLI：

```bash
npm install -g supabase
```

并已登录和链接项目：

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

#### 本地开发环境

如果使用本地 Supabase 容器：

```bash
# 1. 启动本地 Supabase
supabase start

# 2. 重置本地数据库
supabase db reset

# 3. 查看本地数据库
supabase db diff
```

#### 推送到远程

```bash
# 推送 migrations 到远程数据库
npx supabase db push
```

---

## ✅ 验证步骤

### 1. 检查表结构

在 Supabase Dashboard SQL Editor 执行：

```sql
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

**预期结果：** 应该看到 19 个表及其字段

### 2. 检查 RLS 策略

```sql
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**预期结果：** 应该看到 60+ 个 policies

### 3. 检查 RPC 函数

```sql
SELECT 
  proname AS function_name,
  pg_get_function_identity_arguments(oid) AS arguments
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND prokind = 'f'
ORDER BY proname;
```

**预期函数列表：**
- `checkin_ticket`
- `create_staff_invite`
- `ensure_profile`
- `get_my_workspaces`
- `has_merchant_role`
- `is_admin`
- `my_merchant_ids`
- `my_venue_ids`
- `redeem_invite`
- `set_updated_at`

### 4. 测试邀请码 1461

#### 前端测试（Internal App）

1. 访问 Internal App: `http://localhost:3001` 或 `https://internal.yourdomain.com`
2. 使用 Google/Apple 登录
3. 首次登录会自动跳转到 `/internal/invite`
4. 输入邀请码: `1461`
5. 点击确认加入

**预期结果：**
- ✅ 成功加入 "Test Merchant (Invite 1461)"
- ✅ 角色为 OWNER
- ✅ 自动跳转到 `/internal/dashboard`

#### SQL 测试

在 Supabase Dashboard SQL Editor 执行：

```sql
-- 检查 invite 是否存在
SELECT 
  token,
  merchant_id,
  intended_role,
  issued_by_type,
  max_uses,
  used_count,
  expires_at
FROM public.invites
WHERE token = '1461';
```

**预期输出：**
```
token | merchant_id | intended_role | issued_by_type | max_uses | used_count | expires_at
------|-------------|---------------|----------------|----------|------------|------------
1461  | <uuid>      | owner         | admin          | 999999   | 0          | NULL
```

#### RPC 测试

```sql
-- 测试 redeem_invite（需要先登录）
SELECT public.redeem_invite('1461');
```

**预期输出（成功）：**
```json
{
  "ok": true,
  "role": "owner",
  "merchant_id": "<uuid>",
  "merchant_name": "Test Merchant (Invite 1461)",
  "message": "Successfully joined Test Merchant (Invite 1461)"
}
```

---

## 🔄 后续开发流程

### 添加新 migration

当需要修改数据库结构时：

```bash
# 创建新 migration（自动生成时间戳）
npx supabase migration new add_some_feature

# 编辑生成的文件
# supabase/migrations/20260117_add_some_feature.sql
```

**重要规则：**
- ✅ 所有语句必须幂等（可重复执行）
- ✅ 使用 `IF NOT EXISTS` / `CREATE OR REPLACE`
- ✅ 使用 `DROP ... IF EXISTS` + `CREATE`
- ✅ 测试本地后再推送远程

### 推送新 migration

```bash
# 本地测试
supabase db reset  # 本地重建

# 确认无误后推送
npx supabase db push
```

---

## 🐛 常见问题

### Q1: `supabase db push` 报错 "policy already exists"

**原因：** 旧 migrations 文件没有移动到 `_deprecated/`

**解决：**
```bash
# 确保只有 4 个 migration 文件
ls supabase/migrations/*.sql

# 应该只看到：
# 001_schema.sql
# 002_rls.sql
# 003_rpc.sql
# 004_seed.sql
```

### Q2: 邀请码 1461 提示 "MERCHANT_NOT_FOUND"

**原因：** `004_seed.sql` 没有成功执行

**解决：**
```sql
-- 手动检查 merchant 是否存在
SELECT id, name FROM public.merchants;

-- 如果没有，手动执行 004_seed.sql
```

### Q3: RLS 阻止读取数据

**原因：** Helper 函数或 RLS 策略配置错误

**调试：**
```sql
-- 检查当前用户
SELECT auth.uid(), auth.role();

-- 检查用户的 merchant_members
SELECT * FROM public.merchant_members
WHERE user_id = auth.uid();

-- 检查 helper 函数
SELECT public.is_admin();
SELECT public.my_merchant_ids();
```

### Q4: `infinite recursion detected in policy`

**原因：** RLS 策略在 helper 函数中又触发了 RLS

**解决：** 已在 `002_rls.sql` 中使用 `SECURITY DEFINER` + `SET search_path = public` 避免递归

如果仍出现，请检查是否有 policy 直接引用其他表而不是使用 helper 函数。

---

## 📦 生产环境部署建议

### 1. 备份数据

```bash
# 导出所有数据
npx supabase db dump --data-only > backup.sql

# 或使用 Supabase Dashboard 的 Database Backups
```

### 2. 分阶段迁移

如果生产环境有数据，不要直接 reset，而应：

1. **创建 migration 脚本** 逐步迁移数据
2. **使用事务** 确保原子性
3. **先在 staging 环境测试**
4. **监控迁移过程** 准备回滚

### 3. 零停机迁移

对于大表（如 tickets、orders）：

1. 创建新表（带 `_new` 后缀）
2. 双写（写入旧表和新表）
3. 后台迁移历史数据
4. 切换读取到新表
5. 删除旧表

---

## 📚 参考资料

- [Supabase Database Migrations](https://supabase.com/docs/guides/cli/managing-migrations)
- [PostgreSQL Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase RLS Best Practices](https://supabase.com/docs/guides/auth/row-level-security)

---

## 🎯 快速命令速查

```bash
# 本地开发
supabase start                    # 启动本地容器
supabase db reset                 # 重置本地数据库
supabase db diff                  # 查看 schema 差异
supabase status                   # 查看服务状态

# 远程操作
supabase login                    # 登录
supabase link                     # 链接项目
npx supabase db push              # 推送 migrations
npx supabase db pull              # 拉取远程 schema

# Migration 管理
npx supabase migration new <name> # 创建新 migration
npx supabase migration list       # 列出所有 migrations
```

---

## ✅ Checklist

迁移完成后，请确认：

- [ ] 所有表都已创建（19 tables）
- [ ] RLS 策略已应用（60+ policies）
- [ ] RPC 函数可调用（9 functions）
- [ ] 测试邀请码 1461 可用
- [ ] 可以成功登录 Internal App
- [ ] 可以使用 1461 加入 merchant
- [ ] Dashboard 显示正常
- [ ] Customer App 可以正常浏览 events
- [ ] 无 RLS 递归错误
- [ ] 无 migration 冲突错误

---

**Created:** 2026-01-17  
**Version:** 1.0  
**Author:** Lux Night Engineering Team
