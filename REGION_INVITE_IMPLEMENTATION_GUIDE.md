# 基于地区的邀请码系统实现指南

## 概述

系统已更新为支持基于地区的商家邀请码创建。管理员创建邀请码时指定地区，用户兑换时自动创建商家并绑定地区。

## 数据库迁移

### 步骤 1: 执行迁移

按顺序执行以下迁移文件：

1. `supabase/migrations/005_add_region_to_invites.sql`
   - 添加 `region_id` 字段
   - 添加约束确保逻辑正确

2. `supabase/migrations/006_update_redeem_invite_for_region.sql`
   - 更新 `redeem_invite` 函数支持创建新 merchant

### 执行命令

```bash
# 在 Supabase Dashboard SQL Editor 中执行，或使用 CLI：
npx supabase db push
```

## API 使用

### 创建商家邀请码（绑定地区）

```typescript
POST /api/admin/invites/create-merchant
Content-Type: application/json

{
  "regionId": "xxx-xxx-xxx",  // 必须：地区 ID
  "merchantId": null,          // 可选：如果不提供，兑换时会创建新 merchant
  "role": "owner",             // owner 或 manager
  "token": "1461",             // 可选：自定义 token，不提供则自动生成
  "maxUses": 999999,           // 可选：最大使用次数
  "expiresDays": null          // 可选：过期天数，null 表示永不过期
}
```

**响应**：
```json
{
  "success": true,
  "id": "invite-id",
  "token": "1461",
  "merchant_id": null,
  "merchant_name": null,
  "region_id": "xxx-xxx-xxx",
  "role": "owner",
  "issued_by_type": "admin",
  "max_uses": 999999,
  "expires_at": null,
  "note": "Will create new merchant on redemption"
}
```

### 创建商家邀请码（绑定已有商家）

```typescript
POST /api/admin/invites/create-merchant
{
  "merchantId": "xxx-xxx-xxx",  // 必须：已有商家 ID
  "regionId": null,              // 可选：会自动使用 merchant 的 region_id
  "role": "owner",
  ...
}
```

## 兑换流程

### 用户兑换邀请码

1. 用户调用 `redeem_invite('1461')`

2. **如果 merchant_id 为 NULL**：
   - 系统检查 `region_id` 是否存在
   - 创建新 merchant（使用 `region_id`）
   - 生成 merchant 名称（基于用户邮箱）
   - 可选：更新 invite 的 `merchant_id`

3. **创建 merchant_member**：
   - 用户成为 merchant 的 owner/manager
   - 自动绑定地区（通过 merchant.region_id）

4. **返回结果**：
   ```json
   {
     "ok": true,
     "merchant_id": "new-merchant-id",
     "merchant_name": "user@email.com",
     "region_id": "xxx-xxx-xxx",
     "role": "owner",
     "merchant_created": true,
     "message": "Successfully joined user@email.com"
   }
   ```

## 数据模型

### invites 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `merchant_id` | UUID (NULLABLE) | 商家 ID（对于创建新商家的邀请码可为 NULL） |
| `region_id` | UUID (NULLABLE) | 地区 ID（对于 ADMIN_TO_MERCHANT 必须） |
| `issued_by_type` | TEXT | 'admin' 或 'merchant' |
| `intended_role` | TEXT | 'owner', 'manager', 'staff' |

**约束**：
- 如果 `issued_by_type = 'admin'` 且 `intended_role IN ('owner', 'manager')`：
  - `region_id` 必须 NOT NULL
  - `merchant_id` 可以为 NULL
- 如果 `issued_by_type = 'merchant'`：
  - `merchant_id` 必须 NOT NULL

## 工作流程示例

### 场景 1: 创建新商家（推荐）

```
管理员创建邀请码：
  POST /api/admin/invites/create-merchant
  { regionId: "la-region-id", role: "owner", token: "1461" }

用户兑换：
  redeem_invite('1461')
  → 自动创建 merchant (region_id = "la-region-id")
  → 用户成为 owner
  → 商家自动绑定到 Los Angeles 地区
```

### 场景 2: 绑定已有商家

```
管理员创建邀请码：
  POST /api/admin/invites/create-merchant
  { merchantId: "existing-merchant-id", role: "owner" }

用户兑换：
  redeem_invite('xxx')
  → 加入已有 merchant
  → 用户成为 owner
```

## 验证

### 检查邀请码

```sql
-- 查看所有管理员邀请码
SELECT 
  token,
  intended_role,
  merchant_id,
  region_id,
  issued_by_type,
  max_uses,
  used_count
FROM public.invites
WHERE issued_by_type = 'admin'
ORDER BY created_at DESC;
```

### 检查商家地区绑定

```sql
-- 查看商家及其地区
SELECT 
  m.id,
  m.name,
  m.region_id,
  r.name AS region_name
FROM public.merchants m
INNER JOIN public.regions r ON r.id = m.region_id
ORDER BY m.created_at DESC;
```

## 注意事项

1. **向后兼容**：现有的 `merchant_id` 不为 NULL 的邀请码仍然可以正常使用

2. **地区必须存在**：创建邀请码时，提供的 `regionId` 必须在 `regions` 表中存在且 `is_active = true`

3. **Merchant 名称**：自动创建的 merchant 名称基于用户邮箱，如果重复会自动添加序号

4. **并发安全**：`redeem_invite` 使用 `FOR UPDATE` 锁确保并发安全

5. **权限检查**：只有 `issued_by_type = 'admin'` 且 `intended_role IN ('owner', 'manager')` 的邀请码才能创建新 merchant
