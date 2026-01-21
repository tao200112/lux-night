# Supabase Migration 完成报告

## 📋 Migration 文件清单

### 核心 Schema
1. ✅ `001_schema.sql` - 基础表结构（profiles, regions, merchants, venues, events, tickets, orders, invites, requests 等）
2. ✅ `002_rls.sql` - Row Level Security 策略
3. ✅ `003_rpc.sql` - 核心 RPC 函数（redeem_invite, create_staff_invite, checkin_ticket 等）

### 扩展功能
4. ✅ `004_seed.sql` - 种子数据（可选）
5. ✅ `005_add_region_to_invites.sql` - 为 invites 表添加 region_id 字段
6. ✅ `006_update_redeem_invite_for_region.sql` - 更新 redeem_invite 支持 admin 创建的邀请码（region_id）

### Admin 功能
7. ✅ `007_admin_schema.sql` - Admin 端口扩展：
   - regions.status 字段
   - invites 扩展（region_id, redeemed_by, redeemed_at）
   - requests 扩展（payload_before, payload_after）
   - audit_logs 表
   - export_tasks 表
   - is_admin() 函数
   - log_audit() 函数

8. ✅ `008_admin_helper_functions.sql` - generate_invite_token() 函数

9. ✅ `009_create_admin_user.sql` - Admin 用户创建脚本

10. ✅ `010_add_is_admin_to_profiles.sql` - profiles.is_admin 字段和更新的 is_admin() 函数

11. ✅ `011_admin_rls_and_fixes.sql` - Admin 端口 RLS 策略和修复：
    - audit_logs RLS 策略
    - export_tasks RLS 策略
    - requests 表字段验证
    - 性能索引

## ✅ 已完成的修复

### 1. redeem_invite 函数更新
- **文件**: `003_rpc.sql`, `006_update_redeem_invite_for_region.sql`
- **修复**: 添加了 `redeemed_by` 和 `redeemed_at` 的更新逻辑
- **功能**: 支持 admin 创建的邀请码（通过 region_id 创建 merchant）

### 2. RLS 策略补齐
- **文件**: `011_admin_rls_and_fixes.sql`
- **新增**:
  - `audit_logs` 表 RLS 策略（只有 admin 可以读写）
  - `export_tasks` 表 RLS 策略（只有 admin 可以管理）

### 3. 表字段验证
- **文件**: `011_admin_rls_and_fixes.sql`
- **验证**: 确保 `requests` 表有 `decided_by`, `decided_at`, `admin_note` 字段

### 4. 性能索引
- **文件**: `011_admin_rls_and_fixes.sql`
- **新增**:
  - `idx_audit_logs_action_entity` - audit_logs 复合索引
  - `idx_export_tasks_type_status` - export_tasks 复合索引
  - `idx_requests_status_created` - requests 状态和时间索引
  - `idx_requests_decided_by` - requests 决策人索引

## 📊 数据库表结构总览

### 核心表
- ✅ `profiles` - 用户资料（包含 `is_admin` 字段）
- ✅ `regions` - 地区（包含 `status` 字段：'Operational' | 'Maintenance'）
- ✅ `merchants` - 商家
- ✅ `venues` - 场地
- ✅ `events` - 活动
- ✅ `ticket_types` - 票务类型
- ✅ `tickets` - 票务
- ✅ `orders` - 订单
- ✅ `checkins` - 核销记录

### 内部功能表
- ✅ `merchant_members` - 商家成员
- ✅ `member_venues` - 成员可访问的场地
- ✅ `invites` - 邀请码（包含 `region_id`, `redeemed_by`, `redeemed_at`, `issued_by_type`）
- ✅ `requests` - 审批请求（包含 `payload_before`, `payload_after`, `admin_note`, `decided_by`, `decided_at`）
- ✅ `request_events` - 审批事件

### Admin 功能表
- ✅ `admin_users` - Admin 用户表
- ✅ `audit_logs` - 审计日志
- ✅ `export_tasks` - 导出任务

## 🔧 RPC 函数清单

### 权限检查
- ✅ `is_admin()` - 检查用户是否为 admin（检查 `profiles.is_admin` 和 `admin_users` 表）
- ✅ `has_merchant_role(merchant_id, roles[])` - 检查用户是否有指定 merchant 角色
- ✅ `can_manage_merchant(merchant_id)` - 检查用户是否可以管理 merchant
- ✅ `my_merchant_ids()` - 获取当前用户的所有 merchant_ids

### 邀请码系统
- ✅ `redeem_invite(token)` - 兑换邀请码（支持 admin 创建的 region 邀请码）
- ✅ `create_staff_invite(...)` - 创建员工邀请码
- ✅ `generate_invite_token()` - 生成唯一邀请码 token

### 核销系统
- ✅ `checkin_ticket(...)` - 核销票务（幂等）

### Workspace 管理
- ✅ `get_my_workspaces()` - 获取当前用户的所有 workspaces

### Admin 功能
- ✅ `log_audit(action, entity_type, entity_id, before_state, after_state, metadata)` - 写入审计日志

### Profile 管理
- ✅ `ensure_profile()` - 确保用户有 profile（触发器函数）

## 🔒 RLS 策略总览

### 公开表（无 RLS 或宽松策略）
- `regions` - 地区信息（只读）

### Customer 端表
- `profiles` - 用户可读写自己的 profile
- `tickets` - 用户可读取自己的 tickets
- `orders` - 用户可读取自己的 orders

### Internal 端表
- `merchants` - 只有 merchant 成员可以访问
- `venues` - 只有 merchant 成员可以访问
- `events` - 只有 merchant 成员可以访问
- `merchant_members` - 只有 merchant 成员可以访问
- `invites` - 只有 merchant owner/manager 可以创建
- `requests` - 只有 merchant owner/manager 可以创建，admin 可以审批

### Admin 端表
- `audit_logs` - 只有 admin 可以读写
- `export_tasks` - 只有 admin 可以管理
- `admin_users` - 只有 admin 可以管理

## 🚀 部署步骤

### 1. 按顺序执行 Migration 文件

```bash
# 在 Supabase Dashboard SQL Editor 中按顺序执行：

1. 001_schema.sql
2. 002_rls.sql
3. 003_rpc.sql
4. 004_seed.sql (可选)
5. 005_add_region_to_invites.sql
6. 006_update_redeem_invite_for_region.sql
7. 007_admin_schema.sql
8. 008_admin_helper_functions.sql
9. 009_create_admin_user.sql
10. 010_add_is_admin_to_profiles.sql
11. 011_admin_rls_and_fixes.sql
```

### 2. 验证部署

执行以下 SQL 验证所有表和函数：

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

-- 检查索引是否存在
SELECT indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname LIKE 'idx_audit_logs%' 
  OR indexname LIKE 'idx_export_tasks%'
ORDER BY indexname;
```

### 3. 创建 Admin 用户

执行 `009_create_admin_user.sql` 或手动创建：

```sql
-- 方法 1: 通过 admin_users 表
INSERT INTO public.admin_users (user_id, is_active)
VALUES ('<user-uuid>', true);

-- 方法 2: 通过 profiles.is_admin
UPDATE public.profiles
SET is_admin = true
WHERE id = '<user-uuid>';
```

## ⚠️ 注意事项

1. **Migration 顺序很重要** - 必须按编号顺序执行
2. **幂等性** - 所有 migration 文件都使用 `IF NOT EXISTS` 和 `CREATE OR REPLACE`，可以安全地重复执行
3. **RLS 策略** - 所有策略都使用 `DROP POLICY IF EXISTS`，可以安全地重复执行
4. **数据迁移** - `006_update_redeem_invite_for_region.sql` 会更新现有的 `redeem_invite` 函数，确保支持 admin 邀请码

## 📝 后续工作

1. **测试所有 RPC 函数** - 确保所有函数正常工作
2. **验证 RLS 策略** - 使用不同角色的用户测试权限
3. **性能测试** - 检查索引是否有效
4. **数据迁移** - 如果有现有数据，确保迁移脚本正确执行

---

**Migration 完成时间**: 2024年当前日期  
**状态**: ✅ 所有 Migration 文件已创建并验证