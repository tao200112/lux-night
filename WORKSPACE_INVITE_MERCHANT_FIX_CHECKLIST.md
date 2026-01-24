# 工作区/邀请码/商家编辑功能自检清单

## 修改摘要

本次修复包含三个主要任务：
1. **A. internal-web：consume invite 后强制切换到新 workspace**
2. **B. internal-web：workspace 选择页/弹窗文案与排序优化**
3. **C. admin-web：Merchants 支持编辑商家名称**

---

## A. internal-web：consume invite 后强制切换到新 workspace

### 修改文件
- `apps/internal-web/app/api/invite/consume/route.ts`
- `apps/internal-web/app/invite/page.tsx`

### 关键变更
1. **consume API 成功后自动设置 workspace**：
   - 在创建 `merchant_members` 成功后，调用 `setDefaultWorkspace(invite.merchant_id)` 设置新 merchant 为 active
   - 幂等情况下（已存在 membership）也会设置 workspace
   - 返回 `next=/dashboard` 而不是 `/workspaces`

2. **前端重定向**：
   - `/invite` 页面使用 API 返回的 `next` 路径（默认 `/dashboard`）

### 验收步骤

#### 1. Admin 创建 merchant + 创建 owner invite
**操作步骤：**
1. 登录 admin-web
2. 进入 Merchants 页面
3. 点击 "+" 按钮创建 merchant invite
4. 选择 Region（或选择已有 Merchant）
5. 选择 Role: Owner
6. 点击 "Create Invite"
7. 复制返回的 invite code

**预期结果：**
- API 返回 `{ ok: true, data: { code: "...", merchantId: "..." } }`
- `merchantId` 不为 null（如果是新创建的 merchant，merchantId 等于新 merchant.id）
- Vercel logs 显示：
  ```
  [ADMIN MERCHANTS POST] { debugId, step: 'merchant.insert.after', merchantId: '...' }
  [ADMIN MERCHANTS POST] { debugId, step: 'invite.create.after', merchantId: '...' }
  ```

**关键日志点：**
- `step: 'merchant.insert.after'` - 确认 merchantId 已生成
- `step: 'invite.create.after'` - 确认 invite.merchant_id 等于 merchantId

---

#### 2. internal-web 用 invite consume
**操作步骤：**
1. 登录 internal-web（或新用户注册）
2. 进入 `/invite` 页面
3. 输入步骤 1 复制的 invite code
4. 点击 "Continue"

**预期结果：**
- API 返回 `{ success: true, data: { merchant_id: "...", role: "owner", next: "/dashboard" }, debugId: "..." }`
- 自动跳转到 `/dashboard`（不再跳转到 `/workspaces`）
- Vercel logs 显示：
  ```
  [INVITE CONSUME] { debugId, step: 'membership.insert', ok: true, newMembershipId: '...' }
  [INVITE CONSUME] { debugId, step: 'workspace.setDefault', ok: true, merchantId: '...' }
  [INVITE CONSUME] { debugId, step: 'response.ok', next: '/dashboard', merchantId: '...' }
  ```

**关键日志点：**
- `step: 'membership.insert'` - 确认 merchant_members 已创建
- `step: 'workspace.setDefault'` - 确认 workspace 已设置
- `step: 'response.ok'` - 确认返回 next=/dashboard

---

#### 3. consume 后自动切换 workspace
**操作步骤：**
1. 完成步骤 2（consume invite）
2. 检查是否自动跳转到 `/dashboard`
3. 检查 Settings 页面的 "Current Workspace" 显示

**预期结果：**
- 跳转到 `/dashboard`（不是 `/workspaces`）
- Settings 页面显示新 merchant 名称（不是旧 merchant 或 "Unknown"）
- 数据库 `profiles.default_merchant_id` 等于新 merchant.id

**验证方法：**
- 在 Supabase 查询：
  ```sql
  SELECT id, default_merchant_id 
  FROM profiles 
  WHERE id = '<user_id>';
  ```
- 确认 `default_merchant_id` 等于新 merchant.id

---

#### 4. Settings 显示正确 merchant 名字
**操作步骤：**
1. 完成步骤 2（consume invite）
2. 进入 Settings 页面（或任意需要显示 merchant 名称的页面）
3. 检查 "Current Workspace" 或 merchant 名称显示

**预期结果：**
- 显示新 merchant 的名称（不是 "Unknown"）
- 如果 merchant.name 为空，显示 `Merchant <merchantId前8位>`

**关键日志点：**
- `/api/me` 返回 `defaultWorkspace: { merchantId: "...", venueId: "..." }`
- `/api/dashboard` 返回 `workspace.merchantName` 不为空

---

## B. internal-web：workspace 选择页/弹窗文案与排序优化

### 修改文件
- `apps/internal-web/app/api/me/route.ts`
- `apps/internal-web/app/workspaces/page.tsx`

### 关键变更
1. **排序逻辑**：
   - 当前 active workspace 放第一
   - 最近加入（created_at 最近的）放第二
   - 其他按 created_at 降序

2. **显示优化**：
   - merchantName 不为空且不等于 "Unknown"
   - 如果 merchantName 为空，显示 `Merchant <merchantId前8位>`
   - Active workspace 显示 "Active" 标签

3. **API 增强**：
   - `/api/me` 返回 `defaultWorkspace` 和 `created_at` 字段

### 验收步骤

#### 5. Workspace 选择页排序和显示
**操作步骤：**
1. 用户有多个 merchant memberships（例如：Merchant A 和 Merchant B）
2. 当前 active workspace 是 Merchant A
3. 进入 `/workspaces` 页面

**预期结果：**
- Merchant A 显示在第一位，带有 "Active" 标签
- Merchant B 显示在第二位
- 两个 merchant 的名称都正确显示（不是 "Unknown"）
- 如果 merchant.name 为空，显示 `Merchant <merchantId前8位>`

**关键日志点：**
- `/api/me` 返回：
  ```json
  {
    "memberships": [
      { "merchantId": "...", "merchantName": "...", "createdAt": "..." },
      ...
    ],
    "defaultWorkspace": { "merchantId": "...", "venueId": "..." }
  }
  ```

---

## C. admin-web：Merchants 支持编辑商家名称

### 修改文件
- `apps/admin-web/app/api/admin/merchants/[id]/route.ts`（添加 PATCH handler）
- `apps/admin-web/app/merchants/page.tsx`

### 关键变更
1. **PATCH API**：
   - `PATCH /api/admin/merchants/[merchantId]`
   - 支持更新 `name`、`regionId`、`status`
   - 至少需要一个字段
   - name 必须 trim + 非空校验

2. **前端编辑功能**：
   - 每个 merchant 卡片右上角添加 "Edit" 按钮
   - 点击后弹出编辑弹窗
   - 保存成功后本地列表立即更新（乐观更新）

### 验收步骤

#### 6. Admin 修改 merchant 名字
**操作步骤：**
1. 登录 admin-web
2. 进入 Merchants 页面
3. 找到任意 merchant 卡片
4. 点击右上角 "Edit" 按钮（铅笔图标）
5. 修改 merchant name
6. 点击 "Save"

**预期结果：**
- API 返回 `{ ok: true, data: { id: "...", name: "...", ... }, step: 'success', debugId: '...' }`
- 本地列表立即更新（不需要刷新页面）
- Vercel logs 显示：
  ```
  [ADMIN MERCHANTS PATCH] { debugId, step: 'success', merchantId: '...', updatedFields: ['name'] }
  ```

**关键日志点：**
- `step: 'update_merchant'` - 确认更新操作
- `step: 'success'` - 确认更新成功

---

#### 7. internal-web 刷新后能看到新名字
**操作步骤：**
1. 完成步骤 6（admin 修改 merchant 名字）
2. 在 internal-web 中，刷新页面或重新进入相关页面
3. 检查 workspace 选择页、Settings 页面、Dashboard 等显示 merchant 名称的地方

**预期结果：**
- 所有显示 merchant 名称的地方都显示新名称
- 不再显示旧名称或 "Unknown"

**验证方法：**
- 检查 `/api/me` 返回的 `memberships[].merchantName`
- 检查 `/api/dashboard` 返回的 `workspace.merchantName`
- 检查 `/workspaces` 页面显示的 merchant 名称

---

## 完整测试流程

### 端到端测试
1. **Admin 创建 merchant + invite**：
   - Admin 创建新 merchant（或选择已有 merchant）
   - 生成 owner invite code
   - 确认 `invite.merchantId` 不为 null

2. **Internal-web consume invite**：
   - 新用户（或已有用户）输入 invite code
   - 确认自动跳转到 `/dashboard`（不是 `/workspaces`）
   - 确认 Settings 显示新 merchant 名称

3. **Workspace 选择页**：
   - 如果用户有多个 memberships，进入 `/workspaces`
   - 确认 active workspace 显示在第一位，带有 "Active" 标签
   - 确认所有 merchant 名称正确显示（不是 "Unknown"）

4. **Admin 编辑 merchant 名称**：
   - Admin 修改 merchant 名称
   - 确认本地列表立即更新

5. **Internal-web 刷新**：
   - 刷新 internal-web 页面
   - 确认所有显示 merchant 名称的地方都显示新名称

---

## 预期 JSON 响应示例

### 1. POST /api/admin/merchants（创建 merchant + invite）
```json
{
  "ok": true,
  "data": {
    "merchant": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "New Merchant",
      "region_id": "..."
    },
    "invite": {
      "token": "ABC123XYZ",
      "merchantId": "550e8400-e29b-41d4-a716-446655440000"
    }
  },
  "step": "response.ok",
  "debugId": "a1b2c3d4"
}
```

### 2. POST /api/invite/consume（consume invite）
```json
{
  "success": true,
  "data": {
    "merchant_id": "550e8400-e29b-41d4-a716-446655440000",
    "role": "owner",
    "next": "/dashboard"
  },
  "debugId": "e5f6g7h8"
}
```

### 3. GET /api/me（获取 workspaces）
```json
{
  "user": { "id": "...", "email": "..." },
  "memberships": [
    {
      "merchantId": "550e8400-e29b-41d4-a716-446655440000",
      "merchantName": "New Merchant",
      "role": "owner",
      "createdAt": "2026-01-24T10:00:00Z",
      "venues": []
    }
  ],
  "defaultWorkspace": {
    "merchantId": "550e8400-e29b-41d4-a716-446655440000",
    "venueId": null
  },
  "hasMembership": true
}
```

### 4. PATCH /api/admin/merchants/[id]（编辑 merchant）
```json
{
  "ok": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Updated Merchant Name",
    "regionId": "...",
    "status": "active",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "step": "success",
  "debugId": "i9j0k1l2"
}
```

---

## 关键日志点汇总

### Admin 创建 merchant + invite
- `[ADMIN MERCHANTS POST] { step: 'merchant.insert.after', merchantId: '...' }`
- `[ADMIN MERCHANTS POST] { step: 'invite.create.after', merchantId: '...' }`

### Internal-web consume invite
- `[INVITE CONSUME] { step: 'membership.insert', ok: true, newMembershipId: '...' }`
- `[INVITE CONSUME] { step: 'workspace.setDefault', ok: true, merchantId: '...' }`
- `[INVITE CONSUME] { step: 'response.ok', next: '/dashboard', merchantId: '...' }`

### Admin 编辑 merchant
- `[ADMIN MERCHANTS PATCH] { step: 'update_merchant', merchantId: '...', updatedFields: ['name'] }`
- `[ADMIN MERCHANTS PATCH] { step: 'success', merchantId: '...' }`

---

## 注意事项

1. **幂等性**：
   - consume invite 时，如果 membership 已存在，仍会设置 workspace 并返回成功
   - 不会重复创建 membership

2. **Workspace 设置失败**：
   - 如果 `setDefaultWorkspace` 失败，会记录警告日志但不阻止返回成功
   - 因为 membership 已创建，用户可以手动在 `/workspaces` 页面选择

3. **Merchant 名称显示**：
   - 如果 `merchant.name` 为空或 "Unknown"，会显示 `Merchant <merchantId前8位>`
   - 确保不会出现 "Unknown" 大面积占位

4. **乐观更新**：
   - Admin 编辑 merchant 名称后，本地列表立即更新
   - 不需要等待 API 响应或手动刷新

---

## 回归测试

### 确保不影响现有功能
1. **Customer 端**：
   - 确认 customer-web 不受影响（未修改 customer 相关代码）

2. **Admin 端**：
   - 确认其他 admin 功能正常（approvals、events、orders 等）

3. **Internal 端**：
   - 确认其他 internal 功能正常（dashboard、events、scan 等）

---

## 完成标志

✅ 所有验收步骤通过  
✅ 所有关键日志点正常  
✅ 无 TypeScript 编译错误  
✅ 无 Lint 错误  
✅ 端到端测试通过  
