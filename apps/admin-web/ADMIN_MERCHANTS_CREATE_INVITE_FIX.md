# Admin 创建商家 + Owner Invite 链路修复报告

## 问题描述

**错误：** `/api/admin/merchants` POST 返回的 `invite.merchantId = null`，导致 internal-web `/api/invite/consume` 报错 `invite.invalid_merchant_id`。

**根因：** 当传入 `regionId` 而没有 `merchantId` 时，接口直接创建 invite 并写入 `merchant_id: null`，没有先创建 merchant。

---

## 修复内容

### 1. 修复顺序：先创建 merchant，再创建 invite

**文件：** `apps/admin-web/app/api/admin/merchants/route.ts`

**修复逻辑：**
- 如果传入 `regionId` 而没有 `merchantId`：
  1. 验证 region 存在
  2. 创建新 merchant（使用默认名称：`New Merchant - {regionName} - {date}`）
  3. 断言 merchant.id 是有效 UUID
  4. 创建 owner invite，使用新创建的 merchant.id
  5. 断言 invite.merchant_id 是有效 UUID（不能是 null）

**关键代码片段：**

```typescript
// 如果没有 merchantId，需要先创建 merchant
if (!merchantId) {
  // 验证 region 存在
  const { data: regionData, error: regionError } = await adminClient
    .from('regions')
    .select('id, name')
    .eq('id', regionId)
    .single();
  
  // 创建新 merchant
  step = 'merchant.insert';
  const merchantName = `New Merchant - ${regionData.name} - ${new Date().toISOString().slice(0, 10)}`;
  
  const { data: newMerchant, error: merchantInsertError } = await adminClient
    .from('merchants')
    .insert({
      name: merchantName,
      region_id: regionId,
      status: 'active',
    })
    .select('id, name')
    .single();
  
  // 断言：merchantId 必须是有效 UUID
  if (!newMerchant.id || !isValidUuid(newMerchant.id)) {
    return NextResponse.json({
      ok: false,
      code: 'MERCHANT_CREATE_MISSING_ID',
      step: 'merchant.create.missing_id',
      // ...
    }, { status: 500 });
  }
  
  merchantIdFinal = newMerchant.id;
}

// 创建 invite 前再次断言
if (!merchantIdFinal || !isValidUuid(merchantIdFinal)) {
  return NextResponse.json({
    ok: false,
    code: 'MERCHANT_CREATE_MISSING_ID',
    step: 'merchant.create.missing_id',
    // ...
  }, { status: 500 });
}

// 创建 invite（merchant_id 必须是有效 UUID）
const inviteData = {
  token: inviteCode,
  merchant_id: merchantIdFinal, // 必须是有效 UUID（不能是 null）
  // ...
};
```

### 2. 返回值一致性

**修复：**
- 返回的 `invite.merchantId` 现在使用 `invite.merchant_id`（数据库字段）
- 确保 `invite.merchantId` 不是 null

**代码：**
```typescript
return NextResponse.json<ApiResponse>({
  ok: true,
  data: {
    invite: {
      id: invite.id,
      code: invite.token,
      token: invite.token,
      merchantId: invite.merchant_id, // 使用数据库字段 merchant_id
      regionId: invite.region_id,
      role: invite.intended_role,
      expiresAt: invite.expires_at,
    },
  },
  step,
  debugId,
});
```

### 3. 字段名一致性

**确认：**
- 前端传：`merchantId` (camelCase) ✅
- 后端解构：`merchantId` ✅
- 数据库写入：`merchant_id` (snake_case) ✅
- 返回字段：`merchantId` (camelCase，从 `merchant_id` 映射) ✅

### 4. 结构化日志

**所有关键步骤都打印日志：**

1. **env.check** - 环境变量检查
2. **auth.getUser** - 用户认证
3. **request.body** - 请求体内容
4. **merchant.insert** - 创建 merchant（输出 newMerchantId）
5. **merchant.resolve** - Merchant 解析
6. **invite.insert** - 创建 invite（输出 merchant_id/token/intended_role）
7. **response.ok** - 成功响应

**日志示例：**
```json
{
  "debugId": "xxxxxxxx",
  "step": "merchant.insert",
  "ok": true,
  "newMerchantId": "valid-uuid",
  "newMerchantName": "New Merchant - Region Name - 2025-01-XX"
}
```

```json
{
  "debugId": "xxxxxxxx",
  "step": "invite.insert",
  "ok": true,
  "inviteId": "xxx-xxx-xxx",
  "token": "ABC12345",
  "merchant_id": "valid-uuid",
  "intended_role": "owner"
}
```

---

## 验证 Checklist

### 测试场景 1: Admin 创建新商家 + Owner Invite

**测试步骤：**
1. 在 admin `/merchants` 页面点击 "Create Merchant Invite" 按钮
2. 在弹窗中：
   - **Merchant**: 留空（不选择）
   - **Region**: 选择一个 region（必填）
   - **Role**: 选择 "Owner"
   - **Expires (Days)**: 30
3. 点击 "Create Invite" 按钮
4. 复制返回的 `invite.token`

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
      "merchantId": "valid-uuid",  // ✅ 必须是有效 UUID，不能是 null
      "regionId": "region-uuid",
      "role": "owner",
      "expiresAt": "..."
    }
  },
  "debugId": "xxxxxxxx"
}
```

**数据库验证：**
```sql
-- 1. 检查 merchant 是否创建
SELECT id, name, region_id, status 
FROM merchants 
WHERE id = 'valid-uuid';
-- 应该有一条记录，name 类似 "New Merchant - Region Name - 2025-01-XX"

-- 2. 检查 invite 是否创建
SELECT id, token, merchant_id, intended_role, issued_by_type 
FROM invites 
WHERE token = 'ABC12345';
-- merchant_id 必须是 'valid-uuid'（NOT NULL）
-- intended_role 必须是 'owner'
-- issued_by_type 必须是 'admin'
```

**Vercel Logs（按 debugId 聚合）：**
```
[ADMIN MERCHANTS POST] { debugId: 'xxxxxxxx', step: 'env.check', ... }
[ADMIN MERCHANTS POST] { debugId: 'xxxxxxxx', step: 'auth.getUser', ok: true, ... }
[ADMIN MERCHANTS POST] { debugId: 'xxxxxxxx', step: 'request.body', regionId: 'region-uuid', merchantId: null, ... }
[ADMIN MERCHANTS POST] { debugId: 'xxxxxxxx', step: 'merchant.insert', ok: true, newMerchantId: 'valid-uuid', newMerchantName: '...' }
[ADMIN MERCHANTS POST] { debugId: 'xxxxxxxx', step: 'merchant.resolve', ok: true, merchantIdFinal: 'valid-uuid', ... }
[ADMIN MERCHANTS POST] { debugId: 'xxxxxxxx', step: 'invite.insert', ok: true, inviteId: 'xxx-xxx-xxx', token: 'ABC12345', merchant_id: 'valid-uuid', intended_role: 'owner' }
[ADMIN MERCHANTS POST] { debugId: 'xxxxxxxx', step: 'response.ok', ok: true, merchant_id: 'valid-uuid', ... }
```

---

### 测试场景 2: Internal-web Consume 成功

**测试步骤：**
1. 使用测试场景 1 创建的 invite token
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
  "debugId": "yyyyyyyy"
}
```

**数据库验证：**
```sql
-- 检查 merchant_members 是否创建
SELECT id, user_id, merchant_id, role, is_active 
FROM merchant_members 
WHERE user_id = 'current-user-id' AND merchant_id = 'valid-uuid';
-- 应该有一条记录，is_active = true, role = 'owner'
```

**Vercel Logs（internal-web）：**
```
[INVITE CONSUME] { debugId: 'yyyyyyyy', step: 'invite.lookup', ok: true, merchantId: 'valid-uuid', merchantIdIsValid: true, ... }
[INVITE CONSUME] { debugId: 'yyyyyyyy', step: 'membership.insert', ok: true, ... }
[INVITE CONSUME] { debugId: 'yyyyyyyy', step: 'response.ok', ok: true, ... }
```

---

### 测试场景 3: 使用已存在的 Merchant 创建 Invite

**测试步骤：**
1. 在 admin `/merchants` 页面点击 "Create Merchant Invite" 按钮
2. 在弹窗中：
   - **Merchant**: 选择一个已存在的 merchant
   - **Role**: 选择 "Owner"
   - **Expires (Days)**: 30
3. 点击 "Create Invite" 按钮

**预期结果：**
- HTTP Status: `200`
- Response JSON 中的 `invite.merchantId` 必须是选中的 merchant.id（有效 UUID）

**数据库验证：**
```sql
SELECT id, token, merchant_id, intended_role 
FROM invites 
WHERE token = '...';
-- merchant_id 必须是选中的 merchant.id（NOT NULL）
```

---

## 修改文件列表

1. ✅ `apps/admin-web/app/api/admin/merchants/route.ts`
   - 修复创建顺序：先创建 merchant，再创建 invite
   - 添加 merchant.insert 日志
   - 添加断言：merchantId 必须是有效 UUID
   - 修复返回值：确保 invite.merchantId 不是 null

---

## 关键代码片段

### Merchant Insert + Invite Insert

```typescript
// 如果没有 merchantId，先创建 merchant
if (!merchantId) {
  // 验证 region 存在
  const { data: regionData, error: regionError } = await adminClient
    .from('regions')
    .select('id, name')
    .eq('id', regionId)
    .single();
  
  // 创建新 merchant
  step = 'merchant.insert';
  const merchantName = `New Merchant - ${regionData.name} - ${new Date().toISOString().slice(0, 10)}`;
  
  const { data: newMerchant, error: merchantInsertError } = await adminClient
    .from('merchants')
    .insert({
      name: merchantName,
      region_id: regionId,
      status: 'active',
    })
    .select('id, name')
    .single();
  
  // 断言：merchantId 必须是有效 UUID
  if (!newMerchant.id || !isValidUuid(newMerchant.id)) {
    return NextResponse.json({
      ok: false,
      code: 'MERCHANT_CREATE_MISSING_ID',
      step: 'merchant.create.missing_id',
      // ...
    }, { status: 500 });
  }
  
  merchantIdFinal = newMerchant.id;
}

// 创建 invite 前再次断言
if (!merchantIdFinal || !isValidUuid(merchantIdFinal)) {
  return NextResponse.json({
    ok: false,
    code: 'MERCHANT_CREATE_MISSING_ID',
    step: 'merchant.create.missing_id',
    // ...
  }, { status: 500 });
}

// 创建 invite（merchant_id 必须是有效 UUID）
const inviteData = {
  token: inviteCode,
  merchant_id: merchantIdFinal, // 必须是有效 UUID（不能是 null）
  region_id: regionId || null,
  intended_role: role || 'owner',
  issued_by_type: 'admin',
  // ...
};

const { data: invite, error: insertError } = await adminClient
  .from('invites')
  .insert(inviteData)
  .select()
  .single();

// 返回结果
return NextResponse.json({
  ok: true,
  data: {
    invite: {
      id: invite.id,
      code: invite.token,
      token: invite.token,
      merchantId: invite.merchant_id, // ✅ 使用数据库字段 merchant_id
      regionId: invite.region_id,
      role: invite.intended_role,
      expiresAt: invite.expires_at,
    },
  },
});
```

---

## 如何验证

### 最小自测步骤

1. **Admin 端创建 merchant + invite：**
   - 打开 admin `/merchants` 页面
   - 点击 "Create Merchant Invite" 按钮
   - 选择 Region（不选 Merchant）
   - 选择 Role: "Owner"
   - 点击 "Create Invite"
   - **验证：** 返回的 JSON 中 `invite.merchantId` 必须是有效 UUID（不是 null）
   - **复制：** `invite.token`

2. **Internal-web consume：**
   - 打开 internal-web `/invite` 页面
   - 输入步骤 1 复制的 token
   - 点击提交
   - **验证：** 应该成功创建 `merchant_members` 记录，跳转到 `/workspaces`

3. **数据库验证：**
   ```sql
   -- 检查 merchant 是否创建
   SELECT id, name, region_id FROM merchants WHERE id = '返回的merchantId';
   
   -- 检查 invite 是否正确
   SELECT id, token, merchant_id, intended_role FROM invites WHERE token = '复制的token';
   -- merchant_id 必须是有效 UUID（不是 null）
   
   -- 检查 merchant_members 是否创建
   SELECT id, user_id, merchant_id, role FROM merchant_members WHERE merchant_id = '返回的merchantId';
   ```

---

**修复完成时间：** 2025-01-XX
**代码版本：** 最新（已修复创建顺序和返回值）
