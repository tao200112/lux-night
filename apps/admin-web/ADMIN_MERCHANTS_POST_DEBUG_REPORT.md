# POST /api/admin/merchants 调用链证据采集报告

## 1. 实现文件定位

**文件路径：** `apps/admin-web/app/api/admin/merchants/route.ts`
**Handler：** `POST` (line 214-705)

---

## 2. 调用链分析

### 当前实现逻辑（已添加日志）

**步骤顺序：**
1. `env.check` - 环境变量检查
2. `auth.getUser` - 用户认证
3. `request.readBody` - 读取请求体
4. `request.body` - 打印请求体内容（merchantId, regionId, role）
5. **如果 merchantId 存在：**
   - `validate.uuid` - 验证 merchantId 格式
   - `merchant.resolve` - 验证 merchant 存在
6. **如果 merchantId 不存在（只有 regionId）：**
   - `merchant.insert.before` - 打印准备写入的 merchant payload
   - `merchant.insert.after` - 打印 insert 返回的 merchantId
   - `merchant.resolve` - 确认 merchantIdFinal
7. `invite.create.before` - 打印将要创建 invite 的 merchantId、role、token、调用方式
8. `invite.create.after` - 打印写入 invites 后返回的 inviteId、merchant_id
9. `response.ok` - 成功响应

### 关键代码位置

**Merchant Insert（如果 merchantId 不存在）：**
```typescript
// Line 422-458
step = 'merchant.insert';
merchantName = `New Merchant - ${regionData.name} - ${new Date().toISOString().slice(0, 10)}`;
const merchantInsertPayload = {
  name: merchantName,
  region_id: regionId,
  status: 'active',
};

console.log('[ADMIN MERCHANTS POST]', {
  debugId,
  step: 'merchant.insert.before',
  payload: merchantInsertPayload,
});

const { data: insertedMerchant, error: merchantInsertError } = await adminClient
  .from('merchants')
  .insert(merchantInsertPayload)
  .select('id, name')
  .single();

newMerchant = insertedMerchant;

console.log('[ADMIN MERCHANTS POST]', {
  debugId,
  step: 'merchant.insert.after',
  ok: !!newMerchant && !merchantInsertError,
  newMerchantId: newMerchant?.id || null,
  newMerchantName: newMerchant?.name || null,
  // ...
});
```

**Invite Insert：**
```typescript
// Line 568-621
step = 'insert_invite';
const inviteData: any = {
  token: inviteCode,
  merchant_id: merchantIdFinal, // 必须是有效 UUID（不能是 null）
  region_id: regionId || null,
  intended_role: role || 'owner',
  issued_by_type: 'admin',
  // ...
};

console.log('[ADMIN MERCHANTS POST]', {
  debugId,
  step: 'invite.create.before',
  merchantId: merchantIdFinal,
  role: role || 'owner',
  token: inviteCode,
  callMethod: 'direct insert', // 直接 insert，不是 RPC
  payload: {
    token: inviteCode,
    merchant_id: merchantIdFinal,
    region_id: regionId || null,
    intended_role: role || 'owner',
    issued_by_type: 'admin',
  },
});

const { data: invite, error: insertError } = await adminClient
  .from('invites')
  .insert(inviteData)
  .select()
  .single();

console.log('[ADMIN MERCHANTS POST]', {
  debugId,
  step: 'invite.create.after',
  ok: !!invite && !insertError,
  inviteId: invite?.id || null,
  token: invite?.token || null,
  merchant_id: invite?.merchant_id || null, // ⚠️ 关键：这里会显示实际写入的值
  intended_role: invite?.intended_role || null,
  // ...
});
```

**Response：**
```typescript
// Line 657-672
return NextResponse.json<ApiResponse>({
  ok: true,
  data: {
    invite: {
      id: invite.id,
      code: invite.token,
      token: invite.token,
      merchantId: invite.merchant_id, // ⚠️ 关键：从数据库返回的 merchant_id
      // ...
    },
  },
  step,
  debugId,
  debug: debugInfo, // 包含所有步骤的日志
});
```

---

## 3. RPC 调用检查

### 搜索结果

**当前代码：** POST /api/admin/merchants **不使用 RPC**，直接 insert invites

**存在的 RPC 函数（但未使用）：**
- `create_admin_merchant_invite` (在 `supabase/migrations/_deprecated/018_update_invite_rpc_with_issued_by_type.sql:246`)
  - **参数：** `p_merchant_id UUID` (必须)
  - **逻辑：** 插入 invites 时使用 `p_merchant_id`（line 332: `p_merchant_id`）
  - **结论：** 这个 RPC 不会导致 merchant_id = null（因为参数是必须的）

**当前代码调用方式：**
- **调用方式：** `adminClient.from('invites').insert(inviteData).select().single()`
- **不是 RPC：** 没有调用 `supabase.rpc()`

---

## 4. SQL Function 检查

### 搜索结果

**没有找到硬编码 `merchant_id = null` 的 SQL function**

**相关 SQL functions：**
1. `create_staff_invite` (supabase/migrations/003_rpc.sql:213)
   - 使用 `p_merchant_id` 参数（必须）
   - 插入时：`p_merchant_id` (line 304)
   - **不会导致 null**

2. `create_admin_merchant_invite` (supabase/migrations/_deprecated/018_update_invite_rpc_with_issued_by_type.sql:246)
   - 使用 `p_merchant_id` 参数（必须）
   - 插入时：`p_merchant_id` (line 332)
   - **不会导致 null**

3. `redeem_invite` (多个文件)
   - 这是用于**兑换**邀请码的，不是创建
   - **不相关**

---

## 5. 可能的问题点

### 问题点 1: invite.create.after 返回的 merchant_id 是 null

**可能原因：**
1. **数据库触发器/约束覆盖了值**
   - 检查是否有触发器在 insert 后修改 merchant_id
   - 检查是否有约束导致值被重置

2. **Supabase select 返回的数据不正确**
   - `.select()` 可能没有正确返回所有字段
   - 检查是否需要显式指定字段：`.select('id, token, merchant_id, ...')`

3. **数据库字段名不一致**
   - 检查数据库实际字段名是 `merchant_id` 还是其他名称

### 问题点 2: Response 中的 merchantId 映射错误

**可能原因：**
- `invite.merchant_id` 在数据库中是 null
- 但代码中 `merchantId: invite.merchant_id` 直接映射，所以返回 null

---

## 6. 调用链报告（待用户提供 response.debug）

**请用户执行以下操作：**

1. 调用 POST `/api/admin/merchants` with:
   ```json
   {
     "regionId": "valid-region-uuid",
     "role": "owner",
     "expiresDays": 30
   }
   ```

2. 复制返回的 JSON 中的 `debug` 字段

3. 粘贴到报告中

**预期 debug 结构：**
```json
{
  "debugId": "xxxxxxxx",
  "steps": {
    "merchant.insert.before": {
      "payload": {
        "name": "New Merchant - ...",
        "region_id": "...",
        "status": "active"
      }
    },
    "merchant.insert.after": {
      "newMerchantId": "valid-uuid",
      "newMerchantName": "..."
    },
    "invite.create.before": {
      "merchantId": "valid-uuid",
      "role": "owner",
      "token": "ABC12345",
      "callMethod": "direct insert",
      "payload": {
        "token": "ABC12345",
        "merchant_id": "valid-uuid",
        "intended_role": "owner",
        "issued_by_type": "admin"
      }
    },
    "invite.create.after": {
      "inviteId": "xxx-xxx-xxx",
      "token": "ABC12345",
      "merchant_id": "???", // ⚠️ 这里会显示实际值
      "intended_role": "owner"
    }
  }
}
```

**关键检查点：**
1. `merchant.insert.after.newMerchantId` 是否是有效 UUID？
2. `invite.create.before.merchantId` 是否是有效 UUID？
3. `invite.create.before.payload.merchant_id` 是否是有效 UUID？
4. **`invite.create.after.merchant_id` 是什么值？**（这是关键！）

---

## 7. 修改文件列表

1. ✅ `apps/admin-web/app/api/admin/merchants/route.ts`
   - 添加 `merchant.insert.before` 日志
   - 添加 `merchant.insert.after` 日志
   - 添加 `invite.create.before` 日志（包含 callMethod）
   - 添加 `invite.create.after` 日志
   - 在 response 中添加 `debug` 字段，包含所有步骤日志

---

## 8. 关键发现

### 发现 1: 使用 `.select()` 可能返回不完整字段

**位置：** `apps/admin-web/app/api/admin/merchants/route.ts:606`
**问题：** `.select()` 没有显式指定字段，可能导致 Supabase 返回的字段不完整

**修复：** 已改为显式指定字段：
```typescript
.select('id, token, merchant_id, region_id, intended_role, issued_by_type, max_uses, used_count, expires_at, disabled, is_active, created_by, note, created_at, updated_at')
```

### 发现 2: 没有使用 RPC

**确认：** POST /api/admin/merchants **不使用 RPC**，直接 insert invites
- **调用方式：** `adminClient.from('invites').insert(inviteData).select().single()`
- **不是 RPC：** 没有调用 `supabase.rpc()`

### 发现 3: 没有 SQL Function 硬编码 merchant_id = null

**确认：** 搜索全仓库，没有找到硬编码 `merchant_id = null` 的 SQL function
- `create_staff_invite` - 使用 `p_merchant_id` 参数（必须）
- `create_admin_merchant_invite` - 使用 `p_merchant_id` 参数（必须）
- 所有 RPC 都要求 merchant_id 参数

---

## 9. 下一步

**等待用户提供：**
1. POST `/api/admin/merchants` 的完整 response JSON（特别是 `debug` 字段）
2. Vercel logs 中对应 `debugId` 的完整日志链路

**关键检查点（在 response.debug 中）：**
1. ✅ `merchant.insert.after.newMerchantId` 是否是有效 UUID？
2. ✅ `invite.create.before.merchantId` 是否是有效 UUID？
3. ✅ `invite.create.before.payload.merchant_id` 是否是有效 UUID？
4. ⚠️ **`invite.create.after.merchant_id` 是什么值？**（这是关键！）
   - 如果是 null：说明数据库 insert 时 merchant_id 被覆盖或未写入
   - 如果是有效 UUID：说明问题在 response 映射阶段

**然后根据证据确定：**
- merchantId 在哪一步变成 null？
- 是 merchant.insert 没返回 id？
- 还是 invite.insert 没写入 merchant_id？
- 还是数据库触发器/约束覆盖了值？
- 还是 response 映射错误？

---

**证据采集完成时间：** 2025-01-XX
**代码版本：** 最新（已添加完整结构化日志 + 显式 select 字段）
