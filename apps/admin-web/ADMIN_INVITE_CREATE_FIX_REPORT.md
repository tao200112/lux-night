# Admin 邀请码创建 merchant_id null 问题修复报告

## 问题描述

**错误：** invites 表里大量 admin/owner 邀请码 `merchant_id = null`（例如 token `UQMC9GVF`），导致 internal-web `/api/invite/consume` 拦截报错 `(step: invite.invalid_merchant_id)`。

**根因：** Admin 端创建邀请码的接口直接写入了 `merchant_id: null`，没有验证 merchantId 的有效性。

---

## A. 全局搜索与定位

### 1. Admin 创建邀请码的调用链

#### 路径 1: `/invites` 页面 → `/api/admin/invites` POST

**前端页面：** `apps/admin-web/app/invites/page.tsx`
- **函数：** `handleCreateInvite()` (line 114-162)
- **API 调用：** `POST /api/admin/invites`
- **请求体：** `{ type, region, expiresAt, expiresDays }`
- **问题：** 没有传递 `merchantId`，后端直接写 `merchant_id: null` (line 402)

**后端 API：** `apps/admin-web/app/api/admin/invites/route.ts`
- **Handler：** `POST` (line 290-461)
- **问题：** line 402 硬编码 `merchant_id: null`
- **修复：** 添加 merchantId 验证，如果 type 是 "VIP Access" 或 "General"（owner 角色），要求 merchantId

#### 路径 2: `/merchants` 页面 → `/api/admin/merchants` POST

**前端页面：** `apps/admin-web/app/merchants/page.tsx`
- **函数：** `handleSubmitInvite()` (line 152-199)
- **API 调用：** `POST /api/admin/merchants`
- **请求体：** `{ merchantId, regionId, role, expiresDays }`
- **问题：** 如果 merchantId 无效（字符串 "null" 或非 UUID），后端直接写 `merchant_id: merchantId || null`

**后端 API：** `apps/admin-web/app/api/admin/merchants/route.ts`
- **Handler：** `POST` (line 193-362)
- **问题：** line 271 写 `merchant_id: merchantId || null`，没有验证 merchantId 格式
- **修复：** 添加 UUID 验证，如果 merchantId 无效，返回 400

#### 路径 3: `/api/admin/invites/create-merchant` POST

**后端 API：** `apps/admin-web/app/api/admin/invites/create-merchant/route.ts`
- **Handler：** `POST` (line 12-221)
- **问题：** line 177 写 `merchant_id: merchantId || null`，没有验证 merchantId 格式
- **修复：** 添加 UUID 验证，如果 merchantId 无效，返回 400

---

## B. 结构化日志增强

### 所有接口现在都打印以下日志步骤：

1. **env.check** - 环境变量检查
   - `hasSupabaseUrl`, `hasAnonKey`, `hasServiceRoleKey`

2. **auth.getUser** - 用户认证
   - `ok`, `hasUser`, `userId`, `userEmail`, `authError`

3. **request.readBody** - 请求体解析
   - `ok`, `error` (如果解析失败)

4. **request.body** - 请求体内容
   - `merchantId`, `merchantIdRaw`, `merchantIdType`, `merchantIdIsValid`, `intendedRole`, `issuedByType`

5. **validate.uuid** - UUID 验证
   - `ok`, `merchantId`, `merchantIdIsValid`

6. **merchant.resolve** - Merchant 解析
   - `ok`, `merchantIdFinal`, `merchantName`, `merchantError`

7. **db.insert** - 数据库插入
   - `ok`, `inviteId`, `token`, `merchant_id写入值`, `insertError`

8. **response.ok** - 成功响应
   - `ok`, `inviteId`, `token`, `merchant_id`, `intendedRole`

9. **catch.unhandled** - 未捕获异常
   - `ok`, `error.name`, `error.message`, `error.stack`

**所有错误现在都返回 JSON：**
```json
{
  "success": false,
  "error": "...",
  "code": "...",
  "message": "...",
  "debugId": "...",
  "step": "...",
  "details": { ... }
}
```

---

## C. 强制 merchant_id 注入与校验

### 1. UUID 验证函数

**位置：** 所有三个接口都添加了 `isValidUuid()` 函数

**逻辑：**
- 检查非空字符串
- 排除字符串 `"null"` 或 `"NULL"`
- 正则校验 UUID v1/v4 格式：`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`

### 2. `/api/admin/invites` POST 修复

**修复内容：**
- 如果 type 是 "VIP Access" 或 "General"（owner 角色），要求 merchantId
- 如果 body 中有 merchantId，验证它必须是有效的 UUID
- 验证 merchant 存在
- 如果 merchantId 无效或缺失（对于 owner 角色），返回 400
- Staff 类型可以没有 merchantId（用于创建新 merchant）

**关键代码：**
```typescript
// 如果 body 中有 merchantId，使用它
if (merchantId) {
  merchantIdFinal = merchantId;
  merchantIdSource = 'request.body';
}

// 验证 merchant_id（如果提供了）
if (merchantIdFinal) {
  if (!isValidUuid(merchantIdFinal)) {
    return NextResponse.json({ ... }, { status: 400 });
  }
  // 验证 merchant 存在
  // ...
} else {
  // 如果没有 merchantId，对于 owner/manager 角色，这是错误的
  if (intendedRole === 'owner' || intendedRole === 'manager') {
    return NextResponse.json({ ... }, { status: 400 });
  }
}

// 写入时使用 merchantIdFinal（已验证的 UUID 或 null）
merchant_id: merchantIdFinal,
```

### 3. `/api/admin/invites/create-merchant` POST 修复

**修复内容：**
- 如果提供了 merchantId，验证它必须是有效的 UUID
- 验证 merchant 存在
- 如果 merchantId 无效，返回 400
- 写入时使用验证后的 merchantIdFinal

**关键代码：**
```typescript
// 如果提供了 merchantId，验证它必须是有效的 UUID
if (merchantId && !isValidUuid(merchantId)) {
  return NextResponse.json({ ... }, { status: 400 });
}

// 验证 merchant 存在
if (merchantId) {
  merchantIdFinal = merchantId; // 已验证是有效的 UUID
  // 验证 merchant 存在
  // ...
}

// 写入时使用 merchantIdFinal
merchant_id: merchantIdFinal,
```

### 4. `/api/admin/merchants` POST 修复

**修复内容：**
- 如果提供了 merchantId，验证它必须是有效的 UUID
- 验证 merchant 存在
- 如果 merchantId 无效，返回 400
- 写入时使用验证后的 merchantIdFinal

**关键代码：**
```typescript
// 如果提供了 merchantId，验证它必须是有效的 UUID
if (merchantId) {
  if (!isValidUuid(merchantId)) {
    return NextResponse.json({ ... }, { status: 400 });
  }
  merchantIdFinal = merchantId;
  // 验证 merchant 存在
  // ...
}

// 写入时使用 merchantIdFinal
merchant_id: merchantIdFinal,
```

---

## D. 字段/参数一致性修复

### 1. 前端传参检查

**`/invites` 页面：**
- 当前：只传 `{ type, region, expiresAt, expiresDays }`
- **问题：** 没有传 `merchantId`
- **修复建议：** 如果 type 是 "VIP Access" 或 "General"，应该要求用户选择 merchant 或从某个地方获取 merchantId

**`/merchants` 页面：**
- 当前：传 `{ merchantId, regionId, role, expiresDays }`
- **问题：** merchantId 可能无效（字符串 "null" 或非 UUID）
- **修复：** 后端已添加验证，如果无效返回 400

### 2. 后端字段名检查

**所有接口：**
- 前端传：`merchantId` (camelCase)
- 后端解构：`merchantId` ✅
- 数据库写入：`merchant_id` (snake_case) ✅
- **一致性：** ✅ 正确

### 3. RPC 调用检查

**`/api/admin/invites` POST：**
- 不使用 RPC，直接 insert ✅

**`/api/admin/invites/create-merchant` POST：**
- 不使用 RPC，直接 insert ✅

**`/api/admin/merchants` POST：**
- 不使用 RPC，直接 insert ✅

---

## E. 最小验证用例

### 测试场景 1: Admin 创建 owner invite（指定 merchant）

**测试步骤：**
1. 在 admin `/merchants` 页面选择一个 merchant
2. 点击 "Create Invite" 按钮
3. 填写表单：`merchantId: "valid-uuid"`, `role: "owner"`, `expiresDays: 30`
4. 提交表单

**预期结果：**
- HTTP Status: `200`
- Response JSON:
```json
{
  "ok": true,
  "data": {
    "invite": {
      "id": "xxx-xxx-xxx",
      "code": "ABC12345",
      "token": "ABC12345",
      "merchantId": "valid-uuid",
      "role": "owner",
      "expiresAt": "..."
    }
  },
  "debugId": "xxxxxxxx"
}
```

**数据库验证：**
```sql
SELECT id, token, merchant_id, intended_role, issued_by_type 
FROM invites 
WHERE token = 'ABC12345';
```
- `merchant_id` 必须是 `valid-uuid`（NOT NULL）
- `intended_role` 必须是 `owner`
- `issued_by_type` 必须是 `admin`

**Vercel Logs（按 debugId 聚合）：**
```
[ADMIN MERCHANTS POST] { debugId: 'xxxxxxxx', step: 'env.check', hasSupabaseUrl: true, ... }
[ADMIN MERCHANTS POST] { debugId: 'xxxxxxxx', step: 'auth.getUser', ok: true, hasUser: true, ... }
[ADMIN MERCHANTS POST] { debugId: 'xxxxxxxx', step: 'request.readBody', ok: true, ... }
[ADMIN MERCHANTS POST] { debugId: 'xxxxxxxx', step: 'request.body', merchantId: 'valid-uuid', merchantIdIsValid: true, ... }
[ADMIN MERCHANTS POST] { debugId: 'xxxxxxxx', step: 'validate.uuid', ok: true, merchantIdIsValid: true }
[ADMIN MERCHANTS POST] { debugId: 'xxxxxxxx', step: 'merchant.resolve', ok: true, merchantIdFinal: 'valid-uuid', merchantName: '...' }
[ADMIN MERCHANTS POST] { debugId: 'xxxxxxxx', step: 'db.insert', ok: true, inviteId: 'xxx-xxx-xxx', merchant_id写入值: 'valid-uuid' }
[ADMIN MERCHANTS POST] { debugId: 'xxxxxxxx', step: 'response.ok', ok: true, merchant_id: 'valid-uuid' }
```

---

### 测试场景 2: Admin 创建 owner invite（无效 merchantId）

**测试步骤：**
1. 在 admin `/merchants` 页面
2. 提交表单：`merchantId: "null"` 或 `merchantId: "invalid-uuid"`

**预期结果：**
- HTTP Status: `400`
- Response JSON:
```json
{
  "ok": false,
  "error": "Bad Request",
  "code": "INVALID_MERCHANT_ID",
  "message": "Invalid merchant_id format: null. merchant_id must be a valid UUID.",
  "debugId": "yyyyyyyy",
  "step": "validate.uuid",
  "details": {
    "merchantId": "null",
    "merchantIdType": "string"
  }
}
```

**Vercel Logs：**
```
[ADMIN MERCHANTS POST] { debugId: 'yyyyyyyy', step: 'request.body', merchantId: 'null', merchantIdIsValid: false, ... }
[ADMIN MERCHANTS POST] { debugId: 'yyyyyyyy', step: 'validate.uuid', ok: false, merchantIdIsValid: false }
```

---

### 测试场景 3: Internal-web consume 成功

**测试步骤：**
1. 使用测试场景 1 创建的邀请码（merchant_id 是有效 UUID）
2. 在 internal-web `/invite` 页面输入 token
3. POST `/api/invite/consume`

**预期结果：**
- HTTP Status: `200`
- Response JSON:
```json
{
  "success": true,
  "data": {
    "merchant_id": "valid-uuid",
    "role": "owner",
    "next": "/workspaces"
  },
  "debugId": "zzzzzzzz"
}
```

**数据库验证：**
```sql
SELECT id, user_id, merchant_id, role, is_active 
FROM merchant_members 
WHERE user_id = 'current-user-id' AND merchant_id = 'valid-uuid';
```
- 应该有一条记录，`is_active = true`, `role = 'owner'`

---

## 修改文件列表

1. ✅ `apps/admin-web/app/api/admin/invites/route.ts`
   - 添加 `isValidUuid()` 函数
   - 添加结构化日志（env.check, auth.getUser, request.body, validate.uuid, merchant.resolve, db.insert, response.ok, catch.unhandled）
   - 修复 merchant_id 验证：如果 type 是 "VIP Access" 或 "General"（owner 角色），要求 merchantId
   - 如果 merchantId 无效或缺失（对于 owner 角色），返回 400
   - 写入时使用验证后的 merchantIdFinal

2. ✅ `apps/admin-web/app/api/admin/invites/create-merchant/route.ts`
   - 添加 `isValidUuid()` 函数
   - 添加结构化日志
   - 修复 merchant_id 验证：如果提供了 merchantId，验证它必须是有效的 UUID
   - 如果 merchantId 无效，返回 400
   - 写入时使用验证后的 merchantIdFinal

3. ✅ `apps/admin-web/app/api/admin/merchants/route.ts`
   - 添加 `isValidUuid()` 函数
   - 添加结构化日志
   - 修复 merchant_id 验证：如果提供了 merchantId，验证它必须是有效的 UUID
   - 如果 merchantId 无效，返回 400
   - 写入时使用验证后的 merchantIdFinal

---

## 根因分析

### 根因 1: `/api/admin/invites` POST 硬编码 `merchant_id: null`

**证据：**
- 文件：`apps/admin-web/app/api/admin/invites/route.ts:402`
- 代码：`merchant_id: null,`（硬编码）
- **问题：** 这个接口是为 region-based invites 设计的（用于创建新 merchant），但如果是 owner 角色，应该要求 merchantId

**修复：**
- 如果 type 是 "VIP Access" 或 "General"（owner 角色），要求 merchantId
- 如果 merchantId 缺失，返回 400

### 根因 2: 所有接口都没有验证 merchantId 格式

**证据：**
- `/api/admin/invites/create-merchant` POST: line 177 写 `merchant_id: merchantId || null`
- `/api/admin/merchants` POST: line 271 写 `merchant_id: merchantId || null`
- **问题：** 如果 merchantId 是字符串 `"null"` 或非 UUID 格式，直接写入数据库，导致 Postgres 22P02 错误

**修复：**
- 所有接口都添加 UUID 验证
- 如果 merchantId 无效，返回 400，拒绝写入

---

## 复现步骤

### 复现 merchant_id null 问题：

1. 在 admin `/invites` 页面
2. 选择 type: "VIP Access" 或 "General"
3. 选择 region
4. 点击 "Generate Code"
5. **结果：** 创建的 invite `merchant_id = null`（因为接口硬编码 null）

### 复现 Postgres 22P02 错误：

1. 在 admin `/merchants` 页面
2. 提交表单：`merchantId: "null"`（字符串）
3. **结果：** 如果后端没有验证，会尝试写入 `merchant_id = "null"`，导致 Postgres 22P02 错误

---

## 验证已修复

### 验证 1: Owner invite 必须有 merchantId

1. 在 admin `/invites` 页面
2. 选择 type: "VIP Access"
3. 选择 region（不传 merchantId）
4. 点击 "Generate Code"
5. **预期：** 返回 400，错误信息：`merchantId is required for owner/manager invites`

### 验证 2: 无效 merchantId 被拒绝

1. 在 admin `/merchants` 页面
2. 提交表单：`merchantId: "null"` 或 `merchantId: "invalid"`
3. **预期：** 返回 400，错误信息：`Invalid merchant_id format`

### 验证 3: 有效 merchantId 成功创建

1. 在 admin `/merchants` 页面
2. 选择一个有效的 merchant
3. 提交表单：`merchantId: "valid-uuid"`, `role: "owner"`
4. **预期：** 返回 200，数据库 `merchant_id = "valid-uuid"`（NOT NULL）

### 验证 4: Internal-web consume 成功

1. 使用验证 3 创建的邀请码
2. 在 internal-web `/invite` 页面输入 token
3. **预期：** 成功创建 `merchant_members` 记录，跳转到 `/workspaces`

---

## 下一步建议

### 前端修复建议：

1. **`/invites` 页面：**
   - 如果 type 是 "VIP Access" 或 "General"，应该要求用户选择 merchant
   - 或者从当前选中的 merchant/workspace 自动获取 merchantId

2. **`/merchants` 页面：**
   - 前端验证 merchantId 格式（可选，后端已保护）
   - 显示更友好的错误信息

---

**修复完成时间：** 2025-01-XX
**代码版本：** 最新（已修复所有 admin 创建邀请码接口）
