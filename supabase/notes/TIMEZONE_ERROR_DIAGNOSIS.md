# Merchants Insert Timezone Error 诊断报告

## 问题描述
POST `/api/admin/merchants` 报错：
```
code: 42703
message: 'column "timezone" does not exist'
details: 'There is a column named "timezone" in table "venues", but it cannot be referenced from this part of the query.'
```

## 根因分析

### 罪魁祸首
**Trigger Function: `public.ensure_merchant_default_venue()`**

**位置：** `supabase/migrations/016_fix_merchant_default_venue.sql:435-469`

**问题：**
1. **Line 443:** 检查 `NEW.status = 'active'`，但 merchants 表可能没有 `status` 列，或者 `status` 在 BEFORE INSERT 时还没有值
2. **Line 445-460:** 在 BEFORE INSERT trigger 中插入 venues 表时，可能触发了 RLS policy 检查，导致 timezone 引用错误
3. **缺少 SECURITY DEFINER:** trigger function 没有 `SECURITY DEFINER`，无法绕过 RLS，导致在插入 venues 时被 RLS policy 拦截

### 错误链路
```
POST /api/admin/merchants
  ↓
INSERT INTO merchants (name, region_id)
  ↓
BEFORE INSERT trigger: trg_ensure_merchant_default_venue
  ↓
Function: ensure_merchant_default_venue()
  ↓
检查: NEW.status = 'active' (可能失败，因为 merchants 表没有 status 列)
  ↓
INSERT INTO venues (..., timezone, ...)
  ↓
RLS policy 检查 venues 插入权限
  ↓
错误：column "timezone" does not exist (在错误的上下文中引用)
```

## 修复方案

### 修复内容
1. **移除 `NEW.status` 检查：** 因为 merchants 表可能没有 status 列
2. **添加 `SECURITY DEFINER`：** 让 trigger function 以定义者权限运行，绕过 RLS
3. **设置 `search_path`：** 确保函数在正确的 schema 中执行

### 修复脚本
见 `supabase/migrations/fix_merchant_insert_timezone_error.sql`

## 验证步骤

### 1. 执行修复脚本
在 Supabase SQL Editor 中执行：
```sql
-- 运行 fix_merchant_insert_timezone_error.sql
```

### 2. 验证 merchants insert 成功
通过 API 测试：
```bash
POST /api/admin/merchants
{
  "regionId": "valid-region-uuid",
  "role": "owner",
  "expiresDays": 30
}
```

**预期结果：**
- 返回 `{ ok: true, data: { merchant, invite }, step: 'success' }`
- `merchant.default_venue_id` 应该被自动设置
- `invite.merchantId` 应该等于新创建的 `merchant.id`

### 3. 检查数据库
```sql
-- 检查最新创建的 merchant 是否有 default_venue_id
SELECT m.id, m.name, m.default_venue_id, v.name AS venue_name
FROM public.merchants m
LEFT JOIN public.venues v ON v.id = m.default_venue_id
ORDER BY m.created_at DESC
LIMIT 5;
```

**预期结果：**
- 所有新创建的 merchant 都应该有 `default_venue_id`
- 对应的 venue 应该存在且 `is_active = true`

## 定位脚本（已创建）

已创建 `supabase/migrations/find_timezone_reference.sql`，包含以下查询：
1. 查找 RLS policy 中引用 timezone
2. 查找 trigger 中引用 timezone
3. 查找函数中引用 timezone
4. 查找视图中引用 timezone
5. 查找 trigger 函数的完整定义

## 修复后验证

修复后，merchants insert 应该：
1. ✅ 不再报 timezone 错误
2. ✅ 自动创建 default venue
3. ✅ 设置 merchant.default_venue_id
4. ✅ 返回正确的 merchant 和 invite 数据
