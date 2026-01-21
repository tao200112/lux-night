# 基于地区的邀请码系统设计

## 目标流程

1. **管理员创建商家邀请码**
   - 指定 `region_id`（必须）
   - 指定 `intended_role`（通常为 'owner'）
   - 不需要预先创建 merchant

2. **用户兑换商家邀请码**
   - 如果没有 merchant，自动创建新 merchant（使用 invite 的 `region_id`）
   - 用户成为该 merchant 的 owner
   - 自动绑定地区

3. **员工邀请码**（保持不变）
   - 商家 owner/manager 创建
   - 必须指定 `merchant_id`
   - 员工绑定到现有商家

## 数据模型变更

### invites 表需要修改

**当前结构**：
- `merchant_id` NOT NULL - 必须预先有 merchant
- 没有 `region_id` 字段

**新结构**：
- `merchant_id` NULLABLE - 对于 ADMIN_TO_MERCHANT 邀请码，可以为 NULL
- 新增 `region_id` UUID - 对于创建新 merchant 的邀请码，必须指定

**约束逻辑**：
- 如果 `issued_by_type = 'admin'` 且 `intended_role IN ('owner', 'manager')`：
  - `merchant_id` 可以为 NULL
  - `region_id` 必须 NOT NULL（用于创建新 merchant）
- 如果 `issued_by_type = 'merchant'`：
  - `merchant_id` 必须 NOT NULL
  - `region_id` 可以为 NULL（继承 merchant 的 region_id）

## 实现方案

### 方案 1：修改 invites 表结构（推荐）

优点：
- 清晰的数据模型
- 类型安全

缺点：
- 需要数据库迁移
- 需要更新现有数据

### 方案 2：使用 merchant_id = NULL 的特殊值 + 新字段

- 添加 `region_id` 字段
- 让 `merchant_id` 变为可选
- 添加 CHECK 约束确保逻辑正确

## 具体实现步骤

### 步骤 1: 数据库迁移

```sql
-- 1. 添加 region_id 字段
ALTER TABLE public.invites 
ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES public.regions(id);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_invites_region ON public.invites(region_id) WHERE region_id IS NOT NULL;

-- 3. 修改 merchant_id 为可选（对于 ADMIN_TO_MERCHANT）
-- 注意：需要先迁移现有数据，确保所有 invite 都有 merchant_id

-- 4. 添加 CHECK 约束
ALTER TABLE public.invites
ADD CONSTRAINT invites_merchant_or_region_check 
CHECK (
  -- 如果是 admin 创建的 owner/manager 邀请码，必须至少有 region_id
  (issued_by_type = 'admin' AND intended_role IN ('owner', 'manager') AND region_id IS NOT NULL)
  OR
  -- 如果是 merchant 创建的邀请码，必须有 merchant_id
  (issued_by_type = 'merchant' AND merchant_id IS NOT NULL)
  OR
  -- 如果 merchant_id 不为 NULL，必须通过外键约束（已存在）
  (merchant_id IS NOT NULL)
);
```

### 步骤 2: 修改 redeem_invite RPC

关键变更：
- 如果 `v_invite.merchant_id IS NULL` 且 `v_invite.region_id IS NOT NULL`：
  1. 创建新 merchant（使用 `v_invite.region_id`）
  2. 更新 invite 的 `merchant_id`（可选，或者保持 NULL）
  3. 创建 merchant_member

### 步骤 3: 修改创建邀请码 API

- `POST /api/admin/invites/create-merchant` 支持传入 `regionId`
- 如果提供了 `regionId`，`merchantId` 可以为空

## 工作流程示例

### 创建商家邀请码

```typescript
POST /api/admin/invites/create-merchant
{
  "regionId": "xxx-xxx-xxx",  // 必须
  "merchantId": null,          // 可选（如果提供则绑定已有 merchant）
  "role": "owner",
  "token": "1461",
  "maxUses": 999999
}
```

### 兑换商家邀请码

```sql
-- redeem_invite('1461') 执行流程：
1. 查找 invite（token='1461'）
2. 发现 merchant_id IS NULL, region_id IS NOT NULL
3. 创建新 merchant:
   INSERT INTO merchants (region_id, name, status)
   VALUES (invite.region_id, 'Merchant for user@email.com', 'active')
4. 创建 merchant_member:
   INSERT INTO merchant_members (merchant_id, user_id, role)
   VALUES (new_merchant_id, current_user_id, 'owner')
5. 更新 invite.used_count
```

## 向后兼容

- 现有的 merchant_id 不为 NULL 的邀请码仍然可以正常使用
- 只需要在新创建管理员邀请码时提供 region_id
