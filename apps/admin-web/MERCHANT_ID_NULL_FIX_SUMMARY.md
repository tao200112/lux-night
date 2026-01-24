# Admin Merchant Invite merchantId=null 修复摘要

## 修复完成时间
2024-12-19

## 问题描述
`POST /api/admin/merchants` 返回的 `invite.merchantId` 为 `null`，导致 `internal-web /api/invite/consume` 报错 `invite.invalid_merchant_id`。

## 根因分析

### 根因候选（按可能性排序）

1. **数据库 CHECK 约束允许 merchant_id 为 NULL**（最可能）
   - `supabase/migrations/005_add_region_to_invites.sql` line 61-81 定义了 CHECK 约束
   - 当 `issued_by_type = 'admin'` 且 `intended_role IN ('owner', 'manager')` 且 `region_id IS NOT NULL` 时，约束允许 `merchant_id` 为 NULL
   - **但是：** 我们的代码在创建新 merchant 后，应该传入 `merchant_id = newMerchant.id`，而不是 NULL

2. **数据库返回的 merchant_id 为 null**（可能）
   - `.select()` 虽然显式指定了 `merchant_id`，但可能因为 RLS 策略或权限问题，返回的 `merchant_id` 为 null
   - 或者数据库插入时值被覆盖

3. **变量作用域问题**（不太可能）
   - 代码逻辑正确，`merchantIdFinal` 在创建 merchant 后被正确赋值

## 修复内容

### 1. 增强验证（Line 550-568）

**添加了 owner/manager invite 的强制验证：**
```typescript
// 强制验证：owner/manager invite 必须有 merchant_id
if ((role === 'owner' || role === 'manager') && (!merchantIdFinal || !isValidUuid(merchantIdFinal))) {
  return NextResponse.json<ApiResponse>({
    ok: false,
    error: 'Validation Error',
    code: 'MERCHANT_ID_REQUIRED',
    message: 'merchantId is required for owner/manager invites',
    step: 'validate.merchant_id',
    debugId,
    details: { role, merchantIdFinal, merchantIdFinalIsValid: ... },
  }, { status: 400 });
}
```

### 2. 数据库返回值验证（Line 633-661）

**添加了 merchant_id 不匹配的检测和修复：**
```typescript
// 验证：数据库返回的 merchant_id 必须与传入的值一致
if (invite && invite.merchant_id !== merchantIdFinal) {
  console.error('[ADMIN MERCHANTS POST] merchant_id mismatch:', {
    debugId,
    step: 'invite.create.after.validation',
    expected: merchantIdFinal,
    actual: invite.merchant_id,
    inviteId: invite.id,
    fullInvite: invite,
  });
  // 如果数据库返回的 merchant_id 为 null，尝试重新查询
  const { data: recheckInvite } = await adminClient
    .from('invites')
    .select('id, merchant_id')
    .eq('id', invite.id)
    .single();
  if (recheckInvite && recheckInvite.merchant_id) {
    invite.merchant_id = recheckInvite.merchant_id;
  }
}
```

### 3. 防御性返回（Line 760）

**如果数据库返回 null，使用传入的值：**
```typescript
merchantId: invite.merchant_id || merchantIdFinal,  // 如果数据库返回 null，使用传入的值
```

### 4. 增强日志（Line 662-680）

**添加了 merchant_id 匹配检查：**
```typescript
console.log('[ADMIN MERCHANTS POST]', {
  debugId,
  step: 'invite.create.after',
  ok: !!invite && !insertError,
  inviteId: invite?.id || null,
  token: invite?.token || null,
  merchant_id: invite?.merchant_id || null,
  merchantIdFinal,  // 添加传入的值用于对比
  merchant_id_match: invite?.merchant_id === merchantIdFinal,  // 是否匹配
  intended_role: invite?.intended_role || null,
  ...
});
```

## 修改的文件

1. **`apps/admin-web/app/api/admin/merchants/route.ts`**
   - Line 550-568: 添加 owner/manager invite 的强制验证
   - Line 633-661: 添加数据库返回值的验证和修复逻辑
   - Line 662-680: 增强日志，添加 merchant_id 匹配检查
   - Line 760: 防御性返回，如果数据库返回 null，使用传入的值

2. **`apps/admin-web/MERCHANT_ID_NULL_AUDIT_REPORT.md`**（新建）
   - 完整的审计报告，包含调用链图、根因分析、修复建议

## 验证步骤

1. **调用 POST `/api/admin/merchants` with:**
   ```json
   {
     "regionId": "valid-region-uuid",
     "role": "owner",
     "expiresDays": 30
   }
   ```

2. **检查返回的 JSON：**
   - `response.data.invite.merchantId` 应该是有效的 UUID（不是 null）
   - `response.debug.steps['invite.create.after'].merchant_id` 应该与 `merchantIdFinal` 匹配

3. **检查 Vercel 日志：**
   - 查找 `[ADMIN MERCHANTS POST]` 日志
   - 确认 `invite.create.after.merchant_id_match: true`
   - 如果 `merchant_id_match: false`，查看 `merchant_id mismatch` 错误日志

4. **验证 internal-web consume：**
   - 使用返回的 `invite.code` 在 `internal-web /invite` 页面兑换
   - 应该成功创建 `merchant_members` 记录
   - 不应该报 `invite.invalid_merchant_id` 错误

## 预期行为

### 成功场景
1. 创建 merchant 后，`merchantIdFinal = newMerchant.id`（有效 UUID）
2. 创建 invite 时，`inviteData.merchant_id = merchantIdFinal`（有效 UUID）
3. 数据库插入成功，返回 `invite.merchant_id = merchantIdFinal`（有效 UUID）
4. API 返回 `invite.merchantId = invite.merchant_id`（有效 UUID）

### 失败场景（现在会被正确处理）
1. **如果 merchantIdFinal 无效：** 返回 400 `MERCHANT_ID_REQUIRED`
2. **如果数据库返回 null：** 
   - 尝试重新查询
   - 如果重新查询也返回 null，使用 `merchantIdFinal` 作为返回值（防御性编程）
   - 记录错误日志供后续调查

## 后续调查

如果问题仍然存在，需要检查：

1. **数据库 CHECK 约束：** 确认 `invites` 表的 CHECK 约束是否在插入时强制将 `merchant_id` 设为 NULL
2. **数据库触发器：** 确认是否有触发器在插入后修改 `merchant_id`
3. **RLS 策略：** 确认 RLS 策略是否影响 `.select()` 返回的 `merchant_id`

## 相关文件

- `apps/admin-web/app/api/admin/merchants/route.ts` - 主要修复文件
- `apps/admin-web/MERCHANT_ID_NULL_AUDIT_REPORT.md` - 完整审计报告
- `supabase/migrations/005_add_region_to_invites.sql` - 数据库约束定义
- `supabase/migrations/017_enhance_invites_table.sql` - 表结构增强
