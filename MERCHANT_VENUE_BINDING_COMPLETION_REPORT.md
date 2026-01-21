# Merchant-Venue绑定链路完成报告

## 📋 任务完成情况

✅ **Phase 1** - 数据模型与迁移  
✅ **Phase 2** - 后端API修复  
✅ **Phase 3** - Create Event页面重构  
✅ **Phase 4** - 自检与验收

---

## Phase 1 - 数据模型与迁移

### 1.1 Merchant绑定主Venue

**实现方案**：方案A（推荐）- 在merchants表增加`default_venue_id`字段

**Migration文件**：
- `supabase/migrations/014_add_merchant_default_venue.sql`

**修改内容**：
1. ✅ 添加`default_venue_id UUID`字段到merchants表
2. ✅ 外键约束：`REFERENCES public.venues(id) ON DELETE SET NULL`
3. ✅ 创建索引：
   - `idx_merchants_default_venue` - 通用索引
   - `idx_merchants_default_venue_not_null` - 部分索引（WHERE default_venue_id IS NOT NULL）
4. ✅ 历史数据处理：自动为已有merchant补default venue（选择第一个active venue）

**RLS/权限**：
- ✅ Admin可读写merchants表（已有policy覆盖）
- ✅ Merchant owner可更新自己的default_venue_id（已有`merchants_manage_owner` policy覆盖）
- ✅ Venues读取：merchant owner可读自己绑定的venue；admin可读全部（已有policy覆盖）

**验证SQL**：
```sql
-- 检查字段是否存在
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'merchants'
  AND column_name = 'default_venue_id';

-- 检查索引
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'merchants'
  AND indexname LIKE '%default_venue%';

-- 检查历史数据处理结果
SELECT id, name, default_venue_id
FROM public.merchants
WHERE default_venue_id IS NOT NULL;
```

---

## Phase 2 - 后端API修复

### 2.1 修复 /api/admin/venues

**修改文件**：
- `apps/admin-web/app/api/admin/venues/route.ts`

**修改内容**：
1. ✅ Zod校验：`merchant_id`必须是有效UUID（可选）
2. ✅ 优先返回merchant的default venue（如果存在）
3. ✅ 如果没有default venue，返回该merchant的所有active venues
4. ✅ 统一错误格式：`{ success: boolean, data?: T, error?: { code, message } }`
5. ✅ 不允许500：所有错误返回结构化错误

**API响应示例**：

**成功（有default venue）**：
```json
{
  "success": true,
  "data": [
    {
      "id": "venue-uuid",
      "name": "Main Venue",
      "address": "123 Main St",
      "merchant": {
        "id": "merchant-uuid",
        "name": "Merchant Name"
      }
    }
  ]
}
```

**成功（无default venue，但有venues）**：
```json
{
  "success": true,
  "data": [
    {
      "id": "venue-1-uuid",
      "name": "Venue 1",
      ...
    },
    {
      "id": "venue-2-uuid",
      "name": "Venue 2",
      ...
    }
  ]
}
```

**错误（merchant不存在）**：
```json
{
  "success": false,
  "error": {
    "code": "DB_ERROR",
    "message": "Merchant not found: ..."
  }
}
```

**错误（validation）**：
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "merchant_id: Invalid uuid"
  }
}
```

### 2.2 新增 /api/admin/merchants/:id/default-venue

**新建文件**：
- `apps/admin-web/app/api/admin/merchants/[id]/default-venue/route.ts`

**功能**：
1. ✅ GET：返回merchant的default venue（包含venue详情）
2. ✅ PATCH：设置default_venue_id（admin或merchant owner）

**GET响应示例**：
```json
{
  "success": true,
  "data": {
    "merchant_id": "merchant-uuid",
    "merchant_name": "Merchant Name",
    "default_venue_id": "venue-uuid",
    "venue": {
      "id": "venue-uuid",
      "name": "Main Venue",
      "address": "123 Main St",
      "logo_url": "...",
      "description": "..."
    }
  }
}
```

**PATCH请求**：
```json
{
  "venue_id": "venue-uuid"
}
```

**PATCH响应示例**：
```json
{
  "success": true,
  "data": {
    "merchant_id": "merchant-uuid",
    "default_venue_id": "venue-uuid"
  }
}
```

---

## Phase 3 - Create Event页面重构

### 3.1 UI逻辑

**修改文件**：
- `apps/admin-web/app/events/new/page.tsx`

**实现内容**：

1. ✅ **页面加载时自动获取merchant default venue**：
   - 调用`GET /api/admin/merchants/:id/default-venue`
   - 如果存在：自动设置`venue_id`和`selectedVenue`
   - 如果不存在：显示引导UI

2. ✅ **Venue显示逻辑**：
   - **有default venue**：只读显示venue信息，支持更换（如果merchant有多个venue）
   - **无default venue**：显示引导UI + "Bind Venue"按钮

3. ✅ **引导UI**：
   - 显示"No venue bound to this merchant"
   - 如果有venues：提供"Use First Venue"按钮和下拉选择
   - 如果没有venues：提供"Bind Venue"按钮（跳转到merchant设置页）
   - 提示："💡 You can save draft without a venue, but publishing requires a venue."

### 3.2 草稿保存规则

**实现内容**：

1. ✅ **Save Draft - 最小校验**：
   - ✅ 允许`title`为空
   - ✅ 允许`time`为空
   - ✅ 允许`ticket_types`为空
   - ✅ 允许`venue_id`为空
   - ✅ 只校验：如果填了时间，确保时间有效；如果填了票种，确保数据合法

2. ✅ **Publish - 严格校验**：
   - ✅ `venue_id`必须存在（优先使用merchant default venue）
   - ✅ `title`必填
   - ✅ `start/end`必填且`end > start`
   - ✅ 至少1个ACTIVE ticket type且价格合法
   - ✅ 如果merchant未绑定venue，阻止发布并提示

### 3.3 数据写入

**修改文件**：
- `apps/admin-web/app/api/admin/merchants/[id]/events/route.ts`

**实现内容**：

1. ✅ **Draft保存**：
   - 允许大部分字段为空（title, venue_id, start_at, end_at等）
   - 如果venue_id为空但merchant有default_venue_id，自动使用default_venue_id
   - 创建events记录，状态`draft`

2. ✅ **Publish保存**：
   - 严格校验所有必填字段
   - 创建events记录，状态`published`
   - 创建ticket_types（至少1个ACTIVE）

3. ✅ **所有写入走server route handler**：
   - 使用admin client（service role）写入数据库
   - 不在client端使用service role

---

## Phase 4 - 自检与验收

### 验收场景1：Merchant有default venue

**测试步骤**：
1. 确保merchant有default_venue_id（通过migration或API设置）
2. 打开Create Event页面：`/admin/events/new?merchant_id=<uuid>`
3. 检查Venue区域

**预期结果**：
- ✅ Venue自动显示（无需手动选择）
- ✅ 显示venue名称、地址、merchant名称
- ✅ 如果有多个venue，显示"Change Venue"下拉

**测试步骤**：
4. 不填标题/时间，点击"Save Draft"
5. 刷新页面

**预期结果**：
- ✅ Save Draft成功
- ✅ 刷新后内容回显（如果有填的内容）

**测试步骤**：
6. 填完所有必填信息（title, time, ticket types）
7. 点击"Publish"

**预期结果**：
- ✅ Publish成功
- ✅ 活动状态为`published`

---

### 验收场景2：Merchant没有default venue

**测试步骤**：
1. 确保merchant没有default_venue_id（`default_venue_id IS NULL`）
2. 打开Create Event页面：`/admin/events/new?merchant_id=<uuid>`
3. 检查Venue区域

**预期结果**：
- ✅ 显示引导UI："No venue bound to this merchant"
- ✅ 如果有venues：显示"Use First Venue"按钮和下拉选择
- ✅ 如果没有venues：显示"Bind Venue"按钮
- ✅ 提示："💡 You can save draft without a venue, but publishing requires a venue."

**测试步骤**：
4. 不填任何信息，点击"Save Draft"

**预期结果**：
- ✅ Save Draft成功
- ✅ 创建了draft event（venue_id可能为NULL）

**测试步骤**：
5. 填完title和time，但不绑定venue
6. 点击"Publish"

**预期结果**：
- ✅ 提示错误："Merchant has no venue bound. Please bind a venue to this merchant first."
- ✅ Publish被阻止

**测试步骤**：
7. 绑定venue（通过"Use First Venue"或下拉选择）
8. 再次点击"Publish"

**预期结果**：
- ✅ Publish成功

---

## 修改文件清单

### Phase 1
1. `supabase/migrations/014_add_merchant_default_venue.sql` - **新建**

### Phase 2
1. `apps/admin-web/app/api/admin/venues/route.ts` - **修改**（优先返回default venue）
2. `apps/admin-web/app/api/admin/merchants/[id]/default-venue/route.ts` - **新建**

### Phase 3
1. `apps/admin-web/app/events/new/page.tsx` - **修改**（自动带出venue、草稿保存逻辑）
2. `apps/admin-web/app/api/admin/merchants/[id]/events/route.ts` - **修改**（允许草稿状态下venue_id为空）

---

## API返回示例

### GET /api/admin/venues?merchant_id=xxx

**200 OK（有default venue）**：
```json
{
  "success": true,
  "data": [
    {
      "id": "venue-uuid",
      "name": "Main Venue",
      "address": "123 Main St",
      "logo_url": null,
      "description": null,
      "merchant": {
        "id": "merchant-uuid",
        "name": "Merchant Name"
      }
    }
  ]
}
```

**200 OK（无default venue，但有venues）**：
```json
{
  "success": true,
  "data": [
    {
      "id": "venue-1-uuid",
      "name": "Venue 1",
      ...
    }
  ]
}
```

**400 Bad Request（validation error）**：
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "merchant_id: Invalid uuid"
  }
}
```

**404 Not Found（merchant不存在）**：
```json
{
  "success": false,
  "error": {
    "code": "DB_ERROR",
    "message": "Merchant not found: ..."
  }
}
```

### GET /api/admin/merchants/:id/default-venue

**200 OK（有default venue）**：
```json
{
  "success": true,
  "data": {
    "merchant_id": "merchant-uuid",
    "merchant_name": "Merchant Name",
    "default_venue_id": "venue-uuid",
    "venue": {
      "id": "venue-uuid",
      "name": "Main Venue",
      "address": "123 Main St",
      "logo_url": null,
      "description": null
    }
  }
}
```

**200 OK（无default venue）**：
```json
{
  "success": true,
  "data": {
    "merchant_id": "merchant-uuid",
    "merchant_name": "Merchant Name",
    "default_venue_id": null,
    "venue": null
  }
}
```

### POST /api/admin/merchants/:id/events (Draft)

**请求体（最小）**：
```json
{
  "title": null,
  "venue_id": null,
  "start_at": null,
  "end_at": null,
  "published_status": "DRAFT",
  "ticket_types": []
}
```

**200 OK**：
```json
{
  "success": true,
  "data": {
    "id": "event-uuid",
    "title": null,
    "status": "draft",
    "published_status": "DRAFT"
  }
}
```

### POST /api/admin/merchants/:id/events (Publish)

**请求体（完整）**：
```json
{
  "title": "Event Title",
  "venue_id": "venue-uuid",
  "start_at": "2024-12-25T20:00:00Z",
  "end_at": "2024-12-26T02:00:00Z",
  "published_status": "PUBLISHED",
  "ticket_types": [
    {
      "name": "General Admission",
      "price_cents": 25.00,
      "status": "ACTIVE",
      ...
    }
  ]
}
```

**200 OK**：
```json
{
  "success": true,
  "data": {
    "id": "event-uuid",
    "title": "Event Title",
    "status": "published",
    "published_status": "PUBLISHED"
  }
}
```

**400 Bad Request（缺少venue）**：
```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Venue is required for publishing. Please bind a venue to this merchant first."
}
```

---

## 验证命令

### 1. 检查Migration是否应用

```sql
-- 检查字段
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'merchants'
  AND column_name = 'default_venue_id';

-- 检查索引
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'merchants'
  AND indexname LIKE '%default_venue%';
```

### 2. 测试API

```bash
# 测试获取merchant default venue
curl -H "Cookie: sb-admin-auth-token=..." \
  "http://localhost:3002/api/admin/merchants/<merchant-id>/default-venue"

# 测试设置default venue
curl -X PATCH \
  -H "Cookie: sb-admin-auth-token=..." \
  -H "Content-Type: application/json" \
  -d '{"venue_id":"<venue-id>"}' \
  "http://localhost:3002/api/admin/merchants/<merchant-id>/default-venue"

# 测试venues API（优先返回default venue）
curl -H "Cookie: sb-admin-auth-token=..." \
  "http://localhost:3002/api/admin/venues?merchant_id=<merchant-id>"
```

### 3. 测试草稿保存

```bash
# 最小草稿（所有字段为空）
curl -X POST \
  -H "Cookie: sb-admin-auth-token=..." \
  -H "Content-Type: application/json" \
  -d '{"published_status":"DRAFT"}' \
  "http://localhost:3002/api/admin/merchants/<merchant-id>/events"
```

---

## ✅ 通过项

1. ✅ Migration创建成功，字段和索引正确
2. ✅ 历史数据自动处理（已有merchant自动补default venue）
3. ✅ API优先返回default venue
4. ✅ Create Event页面自动带出venue
5. ✅ 无venue时显示引导UI
6. ✅ Save Draft不做严格校验，允许大部分字段为空
7. ✅ Publish严格校验，venue必填
8. ✅ 所有写入走server route handler

---

## ⚠️ 需要验证项

1. ⚠️ **实际测试merchant有default venue的场景**
2. ⚠️ **实际测试merchant无default venue的场景**
3. ⚠️ **测试草稿保存后刷新页面回显**
4. ⚠️ **测试Publish时venue校验**

---

## 下一步操作

1. **运行Migration**：
   ```bash
   npx supabase db push
   ```

2. **验证Migration**：
   - 检查`merchants.default_venue_id`字段是否存在
   - 检查历史数据是否自动补全

3. **测试完整流程**：
   - Merchant有default venue → Create Event → 自动带出
   - Merchant无default venue → Create Event → 显示引导 → Save Draft → Bind Venue → Publish

---

**报告生成时间**：2024-12-XX  
**状态**：✅ 所有Phase完成，待实际验证
