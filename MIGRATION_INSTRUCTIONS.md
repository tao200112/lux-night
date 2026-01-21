# 数据库迁移指南

## ⚠️ 重要提示

由于架构发生了重大变化（新的表结构、字段名称变更），**必须重新运行数据库迁移**。

---

## 🔄 方法 1：通过 Supabase Dashboard（推荐）

### 步骤 1：清理旧数据库（如果之前运行过旧迁移）

1. 打开 Supabase Dashboard → 你的项目 → **SQL Editor**
2. 如果之前运行过旧迁移，执行以下清理脚本（**注意：这会删除所有数据**）：

```sql
-- 删除所有表和函数（如果存在旧表）
DROP TABLE IF EXISTS public.checkins CASCADE;
DROP TABLE IF EXISTS public.tickets CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.ticket_tiers CASCADE;
DROP TABLE IF EXISTS public.ticket_types CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;
DROP TABLE IF EXISTS public.venues CASCADE;
DROP TABLE IF EXISTS public.merchant_members CASCADE;
DROP TABLE IF EXISTS public.merchants CASCADE;
DROP TABLE IF EXISTS public.admin_users CASCADE;
DROP TABLE IF EXISTS public.invites CASCADE;
DROP TABLE IF EXISTS public.stripe_events CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.regions CASCADE;

-- 删除函数（如果存在）
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.has_merchant_role(UUID, TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS public.can_manage_merchant(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.checkin_ticket(UUID, TEXT, UUID, BIGINT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.redeem_invite(TEXT) CASCADE;
```

### 步骤 2：运行新的迁移文件

按顺序在 Supabase SQL Editor 中运行以下文件：

#### 迁移 1：初始架构
1. 打开 `supabase/migrations/001_initial_schema.sql`
2. 复制全部内容
3. 在 SQL Editor 中粘贴并执行（点击 "Run"）

#### 迁移 2：RLS 策略
1. 打开 `supabase/migrations/002_rls_policies.sql`
2. 复制全部内容
3. 在 SQL Editor 中粘贴并执行

#### 迁移 3：RPC 函数
1. 打开 `supabase/migrations/003_rpc_functions.sql`
2. 复制全部内容
3. 在 SQL Editor 中粘贴并执行

### 步骤 3：验证迁移成功

执行以下查询验证表是否创建成功：

```sql
-- 检查表是否存在
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 应该看到以下表：
-- admin_users
-- checkins
-- events
-- invites
-- merchant_members
-- merchants
-- order_items
-- orders
-- profiles
-- regions
-- stripe_events
-- ticket_types
-- tickets
-- venues

-- 检查 RPC 函数是否存在
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_type = 'FUNCTION';

-- 应该看到：
-- checkin_ticket
-- redeem_invite
-- is_admin
-- has_merchant_role
-- can_manage_merchant
-- set_updated_at
```

---

## 🛠️ 方法 2：使用 Supabase CLI（如果已安装）

如果你已经安装了 Supabase CLI：

```bash
# 1. 链接到你的 Supabase 项目
supabase link --project-ref your-project-ref

# 2. 重置数据库（⚠️ 会删除所有数据）
supabase db reset

# 或者手动推送迁移
supabase db push
```

---

## 📝 新架构主要变化

### 字段名称变更
- `profiles.region_id` → `profiles.last_region_id`
- `tickets.qr_token` → `tickets.qr_seed`
- `orders.total_amount` → `orders.amount_cents`
- `ticket_types.price` → `ticket_types.price_cents`
- `ticket_types.available` → `ticket_types.sold_count` + `inventory_limit`

### 新表
- `merchants` - 商户组织
- `merchant_members` - 商户成员角色
- `venues` - 场地（关联到 merchant）
- `checkins` - 兑换审计日志

### 新 RPC 函数
- `checkin_ticket()` - 原子性兑换票务
- `redeem_invite()` - 兑换邀请

---

## ⚡ 快速开始（新项目）

如果是全新项目，直接运行三个迁移文件即可，无需清理步骤。

---

## 🔍 迁移后检查清单

- [ ] 所有表已创建
- [ ] RLS 策略已启用
- [ ] RPC 函数已创建
- [ ] 在 Supabase Dashboard → Authentication → Policies 确认 RLS 已启用
- [ ] 测试创建 profile（用户注册后自动创建）
- [ ] 测试区域查询（`/api/regions`）
- [ ] 测试兑换票务（`/api/tickets/[id]/redeem`）

---

## 💡 提示

- 迁移文件已使用 `CREATE TABLE IF NOT EXISTS`，理论上可以重复运行
- 但建议先清理旧表，避免字段冲突
- 如果是生产环境，请先备份数据！
