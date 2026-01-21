# 🚨 立即执行：重置并推送 Migrations

## 当前状态

❌ **错误**: `Remote migration versions not found in local migrations directory`

**原因**: 远程数据库有旧 migration history（001-930），但本地只有新的 001-004

**解决**: 必须先重置远程数据库，清空 migration history

---

## ✅ 执行步骤（3 步完成）

### 步骤 1: 打开 Supabase Dashboard

访问：https://app.supabase.com

选择你的项目

---

### 步骤 2: 执行 Reset SQL

1. 点击左侧菜单 **SQL Editor**

2. 打开文件并复制全部内容：
   ```
   C:\Users\yesod\Desktop\lux-night\supabase\scripts\reset-remote.sql
   ```

3. 粘贴到 SQL Editor

4. 点击右上角 **[Run]** 按钮

**预期输出：**
```
✅ Remote database reset complete!

Next steps:
1. Run: npx supabase db push
2. This will apply all migrations in order
```

⚠️ **警告**: 这将删除所有 public schema 的表和数据！
- ✅ auth.users（登录账号）会保留
- ✅ storage（文件存储）会保留
- ❌ 所有业务数据（events、orders、tickets）会删除

如果需要备份数据，请先在 Dashboard → Database → Backups 中创建备份。

---

### 步骤 3: 推送新 Migrations

Reset 成功后，在项目根目录执行：

```powershell
cd C:\Users\yesod\Desktop\lux-night
npx supabase db push
```

**预期输出：**
```
Applying migration 001_schema.sql...
✅ Schema created successfully!
   - 19 tables created
   - All indexes and constraints applied
   - All triggers created

Applying migration 002_rls.sql...
✅ RLS policies created successfully!
   - 19 tables secured
   - 4 helper functions created
   - 60+ policies applied

Applying migration 003_rpc.sql...
✅ RPC functions created successfully!
   - redeem_invite()
   - create_staff_invite()
   - get_my_workspaces()
   - checkin_ticket()
   - ensure_profile() trigger

Applying migration 004_seed.sql...
✅ Seed data created successfully!

Test invite code: 1461
  - Merchant: Test Merchant (Invite 1461)
  - Role: OWNER
  - Max uses: 999999
  - Expires: Never
```

---

## ✅ 验证成功

推送成功后，验证邀请码 1461：

### 前端验证

1. 访问 Internal App: `http://localhost:3001`
2. Google/Apple 登录
3. 输入邀请码: **1461**
4. 成功加入 "Test Merchant (Invite 1461)" 为 **OWNER**
5. 自动跳转到 Dashboard

### SQL 验证

在 Supabase Dashboard SQL Editor 执行：

```sql
-- 检查邀请码
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

-- 预期输出：
-- token='1461', role='owner', max_uses=999999, expires_at=NULL
```

---

## 📋 Checklist

执行完成后确认：

- [ ] Reset SQL 执行成功（看到 ✅ 提示）
- [ ] `npx supabase db push` 执行成功（4 个 migrations 应用）
- [ ] 19 个表已创建
- [ ] RLS policies 已应用
- [ ] RPC functions 可调用
- [ ] 测试邀请码 1461 存在
- [ ] 可以登录 Internal App
- [ ] 可以使用 1461 加入 merchant

---

## 🐛 如果遇到问题

### 问题 1: Reset SQL 执行失败

**可能原因**: 权限不足或语法错误

**解决**:
1. 确保使用的是 **Owner** 或 **Admin** 账号
2. 检查 SQL Editor 中是否有完整的 SQL（从 `-- =========================================================` 开始）
3. 尝试分段执行（每次执行一个 `DO $$ ... END $$;` 块）

### 问题 2: Push 时仍报 "migration versions not found"

**可能原因**: Reset 没有清空 supabase_migrations 表

**解决**:
在 SQL Editor 中额外执行：
```sql
TRUNCATE supabase_migrations.schema_migrations;
```

然后重新 `npx supabase db push`

### 问题 3: Push 时报 "policy already exists"

**可能原因**: Reset 没有完全删除旧 policies

**解决**:
在 SQL Editor 中额外执行：
```sql
-- 删除所有 public policies
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || 
            ' ON ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$;
```

---

## 🎯 快速参考

| 步骤 | 位置 | 操作 |
|------|------|------|
| 1 | Supabase Dashboard | 打开 SQL Editor |
| 2 | 复制 reset-remote.sql | 执行 [Run] |
| 3 | 本地终端 | `npx supabase db push` |
| 4 | Internal App | 测试邀请码 1461 |

---

**准备好了就开始执行步骤 1-3！** 🚀
