# Supabase Migration Push 指南

## 🚀 方法 1: 使用 Supabase CLI（推荐）

### 前提条件
1. 已安装 Supabase CLI
2. 已链接到远程项目

### 推送步骤

```bash
# 1. 进入项目根目录
cd C:\Users\yesod\Desktop\lux-night

# 2. 检查 Supabase 状态
supabase status

# 3. 如果未链接，先链接到远程项目
supabase link --project-ref <your-project-ref>

# 4. 推送所有 migration
supabase db push
```

### 如果 CLI 未安装

#### Windows (使用 Scoop)
```powershell
# 安装 Scoop（如果未安装）
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex

# 安装 Supabase CLI
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

#### 或使用 npm
```bash
npm install -g supabase
```

---

## 🚀 方法 2: 通过 Supabase Dashboard（如果 CLI 不可用）

### 步骤

1. **打开 Supabase Dashboard**
   - 访问 https://supabase.com/dashboard
   - 选择你的项目

2. **打开 SQL Editor**
   - 在左侧菜单点击 "SQL Editor"

3. **按顺序执行 Migration 文件**

   按以下顺序在 SQL Editor 中执行每个 migration 文件：

   ```
   1. supabase/migrations/001_schema.sql
   2. supabase/migrations/002_rls.sql
   3. supabase/migrations/003_rpc.sql
   4. supabase/migrations/004_seed.sql (可选)
   5. supabase/migrations/005_add_region_to_invites.sql
   6. supabase/migrations/006_update_redeem_invite_for_region.sql
   7. supabase/migrations/007_admin_schema.sql
   8. supabase/migrations/008_admin_helper_functions.sql
   9. supabase/migrations/009_create_admin_user.sql
   10. supabase/migrations/010_add_is_admin_to_profiles.sql
   11. supabase/migrations/011_admin_rls_and_fixes.sql
   ```

4. **验证执行结果**
   
   每个 migration 文件执行后，应该看到类似输出：
   ```
   ✅ Success. No rows returned
   ```
   
   或
   ```
   NOTICE: ✅ Admin schema extensions created!
   ```

5. **验证 Migration 成功**

   执行以下 SQL 验证：

   ```sql
   -- 检查表是否存在
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
     AND table_name IN (
       'audit_logs', 
       'export_tasks', 
       'invites', 
       'requests', 
       'regions'
     )
   ORDER BY table_name;
   
   -- 应该返回：
   -- audit_logs
   -- export_tasks
   -- invites
   -- requests
   -- regions
   
   -- 检查函数是否存在
   SELECT routine_name 
   FROM information_schema.routines 
   WHERE routine_schema = 'public' 
     AND routine_name IN (
       'is_admin', 
       'log_audit', 
       'generate_invite_token', 
       'redeem_invite'
     )
   ORDER BY routine_name;
   
   -- 应该返回：
   -- generate_invite_token
   -- is_admin
   -- log_audit
   -- redeem_invite
   ```

---

## ⚠️ 重要提示

### 1. Migration 顺序
**必须按编号顺序执行**，因为后面的 migration 依赖前面的。

### 2. 幂等性
所有 migration 文件都使用了 `IF NOT EXISTS` 和 `CREATE OR REPLACE`，可以安全地重复执行。

### 3. 如果遇到错误
- **表已存在**: 可以忽略（使用了 `IF NOT EXISTS`）
- **函数已存在**: 可以忽略（使用了 `CREATE OR REPLACE`）
- **策略已存在**: 可以忽略（使用了 `DROP POLICY IF EXISTS`）

### 4. 数据备份
在执行 migration 之前，建议先备份数据库（特别是生产环境）。

---

## 📋 Migration 文件清单

| 文件 | 说明 | 必需 |
|------|------|------|
| 001_schema.sql | 基础表结构 | ✅ |
| 002_rls.sql | RLS 策略 | ✅ |
| 003_rpc.sql | RPC 函数 | ✅ |
| 004_seed.sql | 种子数据 | ⚠️ 可选 |
| 005_add_region_to_invites.sql | invites 扩展 | ✅ |
| 006_update_redeem_invite_for_region.sql | redeem_invite 更新 | ✅ |
| 007_admin_schema.sql | Admin 表结构 | ✅ |
| 008_admin_helper_functions.sql | Admin 辅助函数 | ✅ |
| 009_create_admin_user.sql | Admin 用户创建 | ⚠️ 需要配置 |
| 010_add_is_admin_to_profiles.sql | profiles.is_admin | ✅ |
| 011_admin_rls_and_fixes.sql | Admin RLS 和修复 | ✅ |

---

## 🔍 验证 Checklist

执行完所有 migration 后，验证以下内容：

- [ ] `audit_logs` 表存在且有 RLS 策略
- [ ] `export_tasks` 表存在且有 RLS 策略
- [ ] `invites` 表有 `region_id`, `redeemed_by`, `redeemed_at` 字段
- [ ] `requests` 表有 `payload_before`, `payload_after`, `admin_note`, `decided_by`, `decided_at` 字段
- [ ] `regions` 表有 `status` 字段
- [ ] `profiles` 表有 `is_admin` 字段
- [ ] `is_admin()` 函数存在
- [ ] `log_audit()` 函数存在
- [ ] `generate_invite_token()` 函数存在
- [ ] `redeem_invite()` 函数已更新（支持 admin 邀请码和 redeemed_by/redeemed_at）

---

## 🆘 常见问题

### Q: 执行 migration 时出现 "relation already exists" 错误
**A**: 这是正常的，因为 migration 使用了 `IF NOT EXISTS`。可以安全地忽略或继续。

### Q: 如何知道 migration 是否成功？
**A**: 执行验证 SQL（见上方），检查表和函数是否存在。

### Q: 可以跳过某些 migration 吗？
**A**: 不建议。所有 migration 都是按顺序设计的，跳过可能导致后续 migration 失败。

### Q: 如何回滚 migration？
**A**: Supabase migration 系统不支持自动回滚。如果需要回滚，需要手动编写反向 SQL。

---

**完成时间**: 2024年当前日期  
**状态**: ✅ Migration 文件已准备就绪，等待推送