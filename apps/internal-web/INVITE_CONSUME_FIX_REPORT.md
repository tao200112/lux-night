# 邀请码消费 500 错误修复报告

## 问题描述

**错误：** Postgres 22P02（uuid 字段收到 "null"）
**位置：** `/api/invite/consume` 在 `membership.checkExisting` 步骤
**根因：** `invite.merchant_id` 为 `null` 或字符串 `"null"`，导致 UUID 查询失败

---

## A. 定位 consume 里出错点

### 1. UUID 验证函数

**文件路径：** `apps/internal-web/app/api/invite/consume/route.ts:28-44`

**代码：**
```typescript
/**
 * 验证 UUID 格式（v1 或 v4）
 * @param v 待验证的值
 * @returns 是否为有效的 UUID
 */
function isValidUuid(v: any): boolean {
  if (!v || typeof v !== 'string') {
    return false;
  }
  
  // 检查是否为字符串 "null"
  if (v === 'null' || v === 'NULL') {
    return false;
  }
  
  // UUID v1/v4 格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(v);
}
```

### 2. merchant_id 原始值打印

**文件路径：** `apps/internal-web/app/api/invite/consume/route.ts:224-247`

**日志字段：**
- `merchantId` - 原始值
- `merchantIdRaw` - 字符串化值（用于调试）
- `merchantIdType` - 类型（string/null/undefined）
- `merchantIdIsValid` - 是否通过 UUID 验证

### 3. merchant_id 验证（在 membership.checkExisting 前）

**文件路径：** `apps/internal-web/app/api/invite/consume/route.ts:280-303`

**验证逻辑：**
```typescript
if (!invite.merchant_id || !isValidUuid(invite.merchant_id)) {
  return NextResponse.json({
    success: false,
    error: 'Invite is missing merchant_id. This invite was generated incorrectly.',
    debugId,
    step: 'invite.invalid_merchant_id',
    details: {
      merchantId: invite.merchant_id,
      inviteId: invite.id,
    },
  }, { status: 400 });
}
```

---

## B. 止血修复（consume）

### 修复内容

1. **添加 merchant_id 验证**
   - 在 `membership.checkExisting` 前验证 `invite.merchant_id`
   - 如果无效，返回 400 + JSON（包含 debugId, step, details）

2. **前端错误显示改进**
   - **文件路径：** `apps/internal-web/app/invite/page.tsx:65-80`
   - 现在显示：`error + (Step: step) + (Debug ID: debugId)`
   - 示例：`"Invite is missing merchant_id. This invite was generated incorrectly. (Step: invite.invalid_merchant_id) (Debug ID: xxxxxxxx)"`

---

## C. 根治：修复“创建商家邀请码”的接口

### 1. 创建邀请码接口位置

**文件路径：** `apps/internal-web/app/api/invites/create/route.ts`

### 2. 修复内容

**添加 UUID 验证：**
```typescript
// 如果没有提供 merchantId，从当前 workspace 获取
if (!merchantId) {
  const workspace = await getActiveWorkspace();
  if (!workspace || !workspace.merchantId) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'merchantId is required. Please select a workspace first.' },
      { status: 400 }
    );
  }
  merchantId = workspace.merchantId;
}

// 验证 merchantId 是有效的 UUID
if (!isValidUuid(merchantId)) {
  return NextResponse.json(
    { 
      error: 'INVALID_MERCHANT_ID', 
      message: `Invalid merchant_id format: ${merchantId}. merchant_id must be a valid UUID.`,
      details: {
        merchantId,
        merchantIdType: typeof merchantId,
      },
    },
    { status: 400 }
  );
}
```

**关键改进：**
1. 如果 body 中没有 `merchantId`，自动从 `getActiveWorkspace()` 获取
2. 验证 `merchantId` 必须是有效的 UUID（使用 `isValidUuid`）
3. 如果无效，直接返回 400，拒绝调用 RPC

### 3. RPC 函数验证

**RPC 函数：** `create_staff_invite` (在 `supabase/migrations/003_rpc.sql`)

**RPC 参数验证：**
- RPC 函数本身会验证 `p_merchant_id` 是否存在（查询 merchants 表）
- 但不会验证 UUID 格式（PostgreSQL UUID 类型会自动验证）
- **问题：** 如果传入字符串 `"null"`，PostgreSQL 会尝试转换为 UUID，导致 22P02 错误

**修复策略：**
- 在 API 层面（`/api/invites/create`）验证 UUID 格式
- 确保传入 RPC 的 `p_merchant_id` 始终是有效的 UUID

---

## D. 数据库字段一致性

### invites 表字段确认

**主字段：** `token` (TEXT NOT NULL UNIQUE)
- consume 使用：`.eq('token', trimmedCode)` ✅
- RPC 插入使用：`token` 字段 ✅
- **结论：** 使用 `token` 字段，不使用 `code` 字段

**完整字段列表：**
```sql
CREATE TABLE public.invites (
  id UUID PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,           -- 主字段：邀请码
  merchant_id UUID NOT NULL,            -- 必须：商家 ID（外键）
  venue_id UUID,                        -- 可选：场地 ID
  intended_role TEXT NOT NULL,          -- 必须：角色（staff/manager/owner/admin）
  issued_by_type TEXT NOT NULL,         -- 必须：创建者类型（admin/merchant）
  max_uses INTEGER NOT NULL DEFAULT 1, -- 最大使用次数
  used_count INTEGER NOT NULL DEFAULT 0, -- 已使用次数
  expires_at TIMESTAMPTZ,               -- 过期时间
  disabled BOOLEAN NOT NULL DEFAULT false, -- 是否禁用
  is_active BOOLEAN NOT NULL DEFAULT true, -- 是否激活
  created_by UUID,                      -- 创建者
  note TEXT,                            -- 备注
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ                -- 撤销时间
);
```

**字段一致性：** ✅ 所有代码都使用 `token` 字段，没有 `code` 字段

---

## E. 验证结果

### 测试场景 1：坏的邀请码（merchant_id null）

**测试步骤：**
1. 使用一个 `merchant_id` 为 `null` 的邀请码
2. POST `/api/invite/consume` with `{ code: "BADCODE" }`

**预期结果：**
- HTTP Status: `400`
- Response JSON:
```json
{
  "success": false,
  "error": "Invite is missing merchant_id. This invite was generated incorrectly.",
  "debugId": "xxxxxxxx",
  "step": "invite.invalid_merchant_id",
  "details": {
    "merchantId": null,
    "inviteId": "xxx-xxx-xxx"
  }
}
```

**Vercel Logs（按 debugId 聚合）：**
```
[INVITE CONSUME] { debugId: 'xxxxxxxx', step: 'env.check', hasSupabaseUrl: true, hasAnonKey: true, hasServiceRoleKey: true }
[INVITE CONSUME] { debugId: 'xxxxxxxx', step: 'auth.getUser', ok: true, hasUser: true, userId: '...' }
[INVITE CONSUME] { debugId: 'xxxxxxxx', step: 'invite.readBody', ok: true, codeLength: 8, codePreview: 'BA...DE' }
[INVITE CONSUME] { debugId: 'xxxxxxxx', step: 'client.adminClientReady', ok: true, clientAdminClientReady: true }
[INVITE CONSUME] { debugId: 'xxxxxxxx', step: 'invite.lookup', ok: true, found: true, merchantId: null, merchantIdRaw: 'null', merchantIdType: 'object', merchantIdIsValid: false }
[INVITE CONSUME] { debugId: 'xxxxxxxx', step: 'invite.invalid_merchant_id', ok: false, merchantId: null, inviteId: 'xxx-xxx-xxx' }
```

---

### 测试场景 2：新生成的商家邀请码（正常流程）

**测试步骤：**
1. 在 `/invites/create` 页面生成新的邀请码
2. 使用该邀请码 POST `/api/invite/consume`

**预期结果：**
- HTTP Status: `200`
- Response JSON:
```json
{
  "success": true,
  "data": {
    "merchant_id": "valid-uuid",
    "role": "staff",
    "next": "/workspaces"
  },
  "debugId": "yyyyyyyy"
}
```

**Vercel Logs（按 debugId 聚合）：**
```
[INVITE CONSUME] { debugId: 'yyyyyyyy', step: 'env.check', hasSupabaseUrl: true, hasAnonKey: true, hasServiceRoleKey: true }
[INVITE CONSUME] { debugId: 'yyyyyyyy', step: 'auth.getUser', ok: true, hasUser: true, userId: '...' }
[INVITE CONSUME] { debugId: 'yyyyyyyy', step: 'invite.readBody', ok: true, codeLength: 8, codePreview: 'AB...CD' }
[INVITE CONSUME] { debugId: 'yyyyyyyy', step: 'client.adminClientReady', ok: true, clientAdminClientReady: true }
[INVITE CONSUME] { debugId: 'yyyyyyyy', step: 'invite.lookup', ok: true, found: true, merchantId: 'valid-uuid', merchantIdIsValid: true }
[INVITE CONSUME] { debugId: 'yyyyyyyy', step: 'parse_role', ok: true, roleToAssign: 'staff' }
[INVITE CONSUME] { debugId: 'yyyyyyyy', step: 'membership.checkExisting', ok: true, count: 0, found: false }
[INVITE CONSUME] { debugId: 'yyyyyyyy', step: 'membership.insert', ok: true, newMembershipId: 'zzz-zzz-zzz' }
[INVITE CONSUME] { debugId: 'yyyyyyyy', step: 'invite.updateUsed', ok: true }
[INVITE CONSUME] { debugId: 'yyyyyyyy', step: 'response.ok', ok: true, next: '/workspaces', role: 'staff' }
```

---

## 修改文件列表

1. ✅ `apps/internal-web/app/api/invite/consume/route.ts`
   - 添加 `isValidUuid()` 函数
   - 在 `invite.lookup` 后打印 `merchant_id` 原始值
   - 在 `membership.checkExisting` 前验证 `merchant_id`
   - 无效时返回 400 + JSON（step: `invite.invalid_merchant_id`）

2. ✅ `apps/internal-web/app/api/invites/create/route.ts`
   - 添加 `isValidUuid()` 函数
   - 如果 body 中没有 `merchantId`，从 `getActiveWorkspace()` 获取
   - 验证 `merchantId` 必须是有效的 UUID
   - 无效时返回 400，拒绝调用 RPC

3. ✅ `apps/internal-web/app/invite/page.tsx`
   - 改进错误显示：显示 `error + (Step: step) + (Debug ID: debugId)`

---

## 字段一致性确认

**invites 表字段：**
- ✅ `token` - 主字段（TEXT NOT NULL UNIQUE）
- ✅ `merchant_id` - 必须（UUID NOT NULL）
- ✅ `intended_role` - 必须（staff/manager/owner/admin）
- ✅ `issued_by_type` - 必须（admin/merchant）
- ✅ `is_active` - 布尔值（NOT NULL DEFAULT true）
- ✅ `disabled` - 布尔值（NOT NULL DEFAULT false）
- ✅ `expires_at` - 时间戳（可选）
- ✅ `used_count` - 整数（NOT NULL DEFAULT 0）
- ✅ `max_uses` - 整数（NOT NULL DEFAULT 1）

**代码使用：**
- consume 查询：`.eq('token', trimmedCode)` ✅
- RPC 插入：`token` 字段 ✅
- **结论：** 使用 `token` 字段，不使用 `code` 字段

---

## 下一步验证

**请在实际环境中测试：**

1. **测试坏的邀请码：**
   - 使用一个 `merchant_id` 为 `null` 的邀请码
   - 应该返回 400，JSON 包含 `step: "invite.invalid_merchant_id"`

2. **测试新生成的邀请码：**
   - 在 `/invites/create` 生成新邀请码
   - 使用该邀请码兑换
   - 应该成功创建 membership

3. **测试创建接口：**
   - 尝试传入无效的 `merchantId`（如 `"null"` 或非 UUID 字符串）
   - 应该返回 400，拒绝创建

**请粘贴实际测试结果和 Vercel logs 到这里：**
```
[等待用户提供测试结果]
```

---

**修复完成时间：** 2025-01-XX
**代码版本：** 最新（已修复 merchant_id 验证）
