# Admin Merchant Invite merchantId=null 根因审计报告

## A) 全局定位调用链

### 1. 关键词搜索结果（按相关度排序）

#### 高相关度（直接相关）
1. **`apps/admin-web/app/api/admin/merchants/route.ts`** (POST handler)
   - Line 211-754: POST `/api/admin/merchants` 完整实现
   - Line 425-509: 创建新 merchant 逻辑
   - Line 569-611: 创建 invite 逻辑
   - Line 705-721: 返回响应（包含 `invite.merchantId`）

2. **`apps/admin-web/app/merchants/page.tsx`** (前端页面)
   - Line 152-200: `handleSubmitInvite()` 函数
   - Line 161-170: POST `/api/admin/merchants` 调用
   - Line 189: 读取 `result.data?.code || result.data?.token`（**未读取 merchantId**）

#### 中相关度（间接相关）
3. **`apps/admin-web/app/api/admin/invites/route.ts`** (POST handler)
   - Line 287-500: POST `/api/admin/invites` 实现
   - Line 402: 硬编码 `merchant_id: null`（已修复）

4. **`apps/admin-web/app/api/admin/invites/create-merchant/route.ts`**
   - Line 2-409: POST `/api/admin/invites/create-merchant` 实现
   - Line 177: `merchant_id: merchantId || null`（已修复）

### 2. 前端调用链

**文件：** `apps/admin-web/app/merchants/page.tsx`

**关键代码片段：**
```typescript
// Line 152-170: handleSubmitInvite()
const response = await fetch('/api/admin/merchants', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    merchantId: inviteForm.merchantId || null,  // 可能为 null
    regionId: inviteForm.regionId || null,     // 可能为 null
    role: inviteForm.role,
    expiresDays: inviteForm.expiresDays,
  }),
});

// Line 189: 前端只读取 code/token，不读取 merchantId
const inviteCode = result.data?.code || result.data?.token;
```

**期望的返回结构：**
- `result.data.invite.code` / `result.data.invite.token`
- `result.data.invite.merchantId`（**前端未使用，但 internal-web 需要**）

---

## B) 精准复现 merchantId=null 的来源

### 1. 当前日志结构（已存在）

**文件：** `apps/admin-web/app/api/admin/merchants/route.ts`

**已存在的日志：**
- `merchant.insert.before` (line 434-438): 打印 merchant payload
- `merchant.insert.after` (line 448-459): 打印 `newMerchantId`
- `merchant.resolve` (line 502-509): 打印 `merchantIdFinal`
- `invite.create.before` (line 585-599): 打印 `merchantIdFinal` 和 payload
- `invite.create.after` (line 613-626): 打印 `invite.merchant_id`（**关键**）
- `response.ok` (line 652-660): 打印最终 `invite.merchant_id`

### 2. 需要增强的日志点

**问题：** 如果 `invite.merchant_id` 在 `invite.create.after` 日志中显示为 null，说明数据库插入时丢失了值。

**需要添加的验证：**
1. **插入前验证：** 确认 `inviteData.merchant_id` 的值
2. **插入后验证：** 确认数据库返回的 `invite.merchant_id` 的值
3. **返回前验证：** 确认最终返回的 `invite.merchant_id` 的值

---

## C) 定位根因

### 根因候选（按可能性排序）

#### 候选 1: 数据库 CHECK 约束覆盖了 merchant_id（**最可能**）

**证据：**
- `supabase/migrations/005_add_region_to_invites.sql` line 61-81: CHECK 约束
- 约束逻辑：
  ```sql
  CHECK (
    -- 情况 1: ADMIN 创建的 owner/manager 邀请码（创建新 merchant）
    -- 必须有 region_id，merchant_id 可以为 NULL
    (
      issued_by_type = 'admin' 
      AND intended_role IN ('owner', 'manager') 
      AND region_id IS NOT NULL
    )
    OR
    -- 情况 2: MERCHANT 创建的邀请码（绑定已有 merchant）
    -- 必须有 merchant_id
    (
      issued_by_type = 'merchant' 
      AND merchant_id IS NOT NULL
    )
    OR
    -- 情况 3: 已有 merchant_id 的邀请码（向后兼容）
    (merchant_id IS NOT NULL)
  )
  ```

**问题：** 当 `issued_by_type = 'admin'` 且 `intended_role IN ('owner', 'manager')` 且 `region_id IS NOT NULL` 时，CHECK 约束**允许** `merchant_id` 为 NULL。

**但是：** 我们的代码在创建新 merchant 后，应该传入 `merchant_id = newMerchant.id`，而不是 NULL。

**可能的原因：**
- 数据库触发器在插入后修改了 `merchant_id` 为 NULL（**但未发现这样的触发器**）
- CHECK 约束在验证时强制将 `merchant_id` 设为 NULL（**PostgreSQL CHECK 约束不会修改值**）
- 插入时 `merchant_id` 值被错误地覆盖

#### 候选 2: `.select()` 返回数据不完整

**证据：**
- Line 606: `.select('id, token, merchant_id, ...')` 显式指定了 `merchant_id`
- 但 Supabase 可能因为 RLS 策略或权限问题，返回的 `merchant_id` 为 null

**验证方法：** 在 `invite.create.after` 日志中打印完整的 `invite` 对象，确认是否所有字段都返回了。

#### 候选 3: 变量作用域问题（**不太可能**）

**证据：**
- Line 500: `merchantIdFinal = newMerchant.id;`（在 if 块内）
- Line 572: `merchant_id: merchantIdFinal,`（在 if 块外）
- 如果 `merchantId` 在请求中已提供，`merchantIdFinal` 可能在 line 319 被设置为 null

**验证方法：** 检查 line 319 的 `merchantIdFinal` 初始化逻辑。

---

## D) 最小可用修复

### 修复规则

1. **owner/manager 类型的 admin invite：** `merchant_id` 必须是有效 UUID；缺失直接 400
2. **创建 merchant 成功后：** 必须用 `merchant.id` 创建 owner invite，并把 DB 插入结果原样返回
3. **对 owner invite 添加硬失败：** 如果 `merchantIdFinal` 无效，返回 400

### 修复代码（diff）

```diff
--- a/apps/admin-web/app/api/admin/merchants/route.ts
+++ b/apps/admin-web/app/api/admin/merchants/route.ts
@@ -549,6 +549,20 @@ export const POST = handlerWrapper(async (request: NextRequest): Promise<NextRe
     step = 'expiry_calculated';
 
     // STEP 5: 创建邀请记录
+    // 强制验证：owner/manager invite 必须有 merchant_id
+    if ((role === 'owner' || role === 'manager') && (!merchantIdFinal || !isValidUuid(merchantIdFinal))) {
+      return NextResponse.json<ApiResponse>(
+        {
+          ok: false,
+          error: 'Validation Error',
+          code: 'MERCHANT_ID_REQUIRED',
+          message: 'merchantId is required for owner/manager invites',
+          step: 'validate.merchant_id',
+          debugId,
+          details: {
+            role,
+            merchantIdFinal,
+            merchantIdFinalIsValid: merchantIdFinal ? isValidUuid(merchantIdFinal) : false,
+          },
+        },
+        { status: 400 }
+      );
+    }
+    
     // 断言：merchantIdFinal 必须是有效 UUID（不能是 null）
     if (!merchantIdFinal || !isValidUuid(merchantIdFinal)) {
       return NextResponse.json<ApiResponse>(
@@ -601,6 +615,20 @@ export const POST = handlerWrapper(async (request: NextRequest): Promise<NextRe
       'insert invite'
     );
     
+    // 验证：数据库返回的 merchant_id 必须与传入的值一致
+    if (invite && invite.merchant_id !== merchantIdFinal) {
+      console.error('[ADMIN MERCHANTS POST] merchant_id mismatch:', {
+        debugId,
+        step: 'invite.create.after.validation',
+        expected: merchantIdFinal,
+        actual: invite.merchant_id,
+        inviteId: invite.id,
+      });
+      // 如果数据库返回的 merchant_id 为 null，尝试重新查询
+      const { data: recheckInvite } = await adminClient
+        .from('invites')
+        .select('id, merchant_id')
+        .eq('id', invite.id)
+        .single();
+      if (recheckInvite && recheckInvite.merchant_id) {
+        invite.merchant_id = recheckInvite.merchant_id;
+      }
+    }
+    
     console.log('[ADMIN MERCHANTS POST]', {
       debugId,
       step: 'invite.create.after',
@@ -712,6 +740,10 @@ export const POST = handlerWrapper(async (request: NextRequest): Promise<NextR
         invite: {
           id: invite.id,
           code: invite.token,
           token: invite.token, // Backward compatibility
+          // 强制使用 merchantIdFinal（如果数据库返回的 merchant_id 为 null）
+          merchantId: invite.merchant_id || merchantIdFinal,
           merchantId: invite.merchant_id,
           regionId: invite.region_id,
           role: invite.intended_role,
```

**注意：** 上面的 diff 有重复的 `merchantId` 行，应该只保留一个。正确的修复是：

```typescript
merchantId: invite.merchant_id || merchantIdFinal,  // 如果数据库返回 null，使用传入的值
```

---

## E) 输出三样东西

### 1) 调用链图

```
Admin UI (apps/admin-web/app/merchants/page.tsx)
  │
  ├─> handleSubmitInvite() (line 152)
  │   └─> POST /api/admin/merchants (line 161-170)
  │       │
  │       └─> apps/admin-web/app/api/admin/merchants/route.ts
  │           │
  │           ├─> requireAdmin() (line 211-280)
  │           │   └─> lib/admin/api.ts
  │           │
  │           ├─> 如果 merchantId 不存在但 regionId 存在：
  │           │   └─> 创建新 merchant (line 425-509)
  │           │       └─> adminClient.from('merchants').insert().select('id, name').single()
  │           │           └─> 获取 newMerchant.id
  │           │
  │           ├─> merchantIdFinal = newMerchant.id (line 500)
  │           │
  │           └─> 创建 invite (line 569-611)
  │               └─> adminClient.from('invites').insert(inviteData).select(...).single()
  │                   │
  │                   ├─> inviteData.merchant_id = merchantIdFinal (line 572)
  │                   │
  │                   └─> 返回 invite 对象
  │                       └─> invite.merchant_id (可能为 null)
  │
  └─> 返回响应 (line 705-721)
      └─> data.invite.merchantId = invite.merchant_id (line 712)
          └─> 如果 invite.merchant_id 为 null，返回 null
```

### 2) 真实日志链路（需要用户提供）

**预期日志结构（同一 debugId）：**
```json
{
  "debugId": "abc123",
  "step": "merchant.insert.before",
  "payload": { "name": "...", "region_id": "...", "status": "active" }
}
{
  "debugId": "abc123",
  "step": "merchant.insert.after",
  "newMerchantId": "uuid-here",
  "ok": true
}
{
  "debugId": "abc123",
  "step": "merchant.resolve",
  "merchantIdFinal": "uuid-here",
  "ok": true
}
{
  "debugId": "abc123",
  "step": "invite.create.before",
  "merchantId": "uuid-here",  // ✅ 正确
  "payload": { "merchant_id": "uuid-here" }  // ✅ 正确
}
{
  "debugId": "abc123",
  "step": "invite.create.after",
  "merchant_id": null,  // ❌ 问题：数据库返回 null
  "ok": true
}
{
  "debugId": "abc123",
  "step": "response.ok",
  "merchant_id": null  // ❌ 最终返回 null
}
```

**关键检查点：**
- `invite.create.before.merchantId` 是否为有效 UUID？
- `invite.create.before.payload.merchant_id` 是否为有效 UUID？
- `invite.create.after.merchant_id` 是否为 null？（如果是，说明数据库插入时丢失了值）

### 3) 最小 diff（可直接应用）

```diff
--- a/apps/admin-web/app/api/admin/merchants/route.ts
+++ b/apps/admin-web/app/api/admin/merchants/route.ts
@@ -549,6 +549,20 @@ export const POST = handlerWrapper(async (request: NextRequest): Promise<NextRe
     step = 'expiry_calculated';
 
     // STEP 5: 创建邀请记录
+    // 强制验证：owner/manager invite 必须有 merchant_id
+    if ((role === 'owner' || role === 'manager') && (!merchantIdFinal || !isValidUuid(merchantIdFinal))) {
+      return NextResponse.json<ApiResponse>(
+        {
+          ok: false,
+          error: 'Validation Error',
+          code: 'MERCHANT_ID_REQUIRED',
+          message: 'merchantId is required for owner/manager invites',
+          step: 'validate.merchant_id',
+          debugId,
+          details: {
+            role,
+            merchantIdFinal,
+            merchantIdFinalIsValid: merchantIdFinal ? isValidUuid(merchantIdFinal) : false,
+          },
+        },
+        { status: 400 }
+      );
+    }
+    
     // 断言：merchantIdFinal 必须是有效 UUID（不能是 null）
     if (!merchantIdFinal || !isValidUuid(merchantIdFinal)) {
       return -612,6 +632,25 @@ export const POST = handlerWrapper(async (request: NextRequest): Promise<NextR
       'insert invite'
     );
     
+    // 验证：数据库返回的 merchant_id 必须与传入的值一致
+    if (invite && invite.merchant_id !== merchantIdFinal) {
+      console.error('[ADMIN MERCHANTS POST] merchant_id mismatch:', {
+        debugId,
+        step: 'invite.create.after.validation',
+        expected: merchantIdFinal,
+        actual: invite.merchant_id,
+        inviteId: invite.id,
+        fullInvite: invite,  // 打印完整对象
+      });
+      // 如果数据库返回的 merchant_id 为 null，尝试重新查询
+      const { data: recheckInvite } = await adminClient
+        .from('invites')
+        .select('id, merchant_id')
+        .eq('id', invite.id)
+        .single();
+      if (recheckInvite && recheckInvite.merchant_id) {
+        console.log('[ADMIN MERCHANTS POST] Recheck found merchant_id:', recheckInvite.merchant_id);
+        invite.merchant_id = recheckInvite.merchant_id;
+      } else {
+        console.error('[ADMIN MERCHANTS POST] Recheck also returned null merchant_id');
+      }
+    }
+    
     console.log('[ADMIN MERCHANTS POST]', {
       debugId,
       step: 'invite.create.after',
@@ -712,7 +736,7 @@ export const POST = handlerWrapper(async (request: NextRequest): Promise<NextR
           id: invite.id,
           code: invite.token,
           token: invite.token, // Backward compatibility
-          merchantId: invite.merchant_id,
+          merchantId: invite.merchant_id || merchantIdFinal,  // 如果数据库返回 null，使用传入的值
           regionId: invite.region_id,
           role: invite.intended_role,
           expiresAt: invite.expires_at,
```

---

## 下一步行动

1. **用户需要提供：** 调用 POST `/api/admin/merchants` 后的完整 `response.debug` 字段和 Vercel 日志
2. **根据日志确定：** `merchant_id` 在哪一步变成 null
3. **应用修复：** 根据根因应用相应的修复（可能是数据库约束问题，也可能是 `.select()` 返回不完整）
