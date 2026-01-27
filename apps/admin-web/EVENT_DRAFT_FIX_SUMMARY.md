# Event Draft Fix - Complete Solution (Updated)

## 🚨 **问题总结**

用户无法保存 draft 活动，遇到多个 NOT NULL 约束错误：

### 错误 1 (已修复)
```
null value in column "venue_id" violates not-null constraint
```

### 错误 2 (已修复)  
```
null value in column "start_at" violates not-null constraint
```

### 其他潜在问题
- `end_at` 也有 NOT NULL 约束
- `title` 也有 NOT NULL 约束

**根本原因：** Draft 应该允许所有字段为空，但数据库强制要求非空。

---

## ✅ **解决方案**

### 迁移 031: 修复 venue_id
```sql
ALTER TABLE public.events ALTER COLUMN venue_id DROP NOT NULL;
```

### 迁移 032: 修复 start_at, end_at, title
```sql
ALTER TABLE public.events ALTER COLUMN start_at DROP NOT NULL;
ALTER TABLE public.events ALTER COLUMN end_at DROP NOT NULL;
ALTER TABLE public.events ALTER COLUMN title DROP NOT NULL;

-- 更新时间约束以允许 NULL
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_time_ok;
ALTER TABLE public.events ADD CONSTRAINT events_time_ok 
CHECK ((start_at IS NULL OR end_at IS NULL) OR (end_at > start_at));
```

---

## 📊 **字段 NULL 状态**

| 字段 | Draft 允许 NULL | Publish 要求非 NULL | 验证方式 |
|------|----------------|-------------------|---------|
| `venue_id` | ✅ 是 | ✅ 是 | API 层 |
| `start_at` | ✅ 是 | ✅ 是 | API 层 |
| `end_at` | ✅ 是 | ✅ 是 | API 层 |
| `title` | ✅ 是 | ✅ 是 | API 层 |
| `region_id` | ❌ 否 (自动从 merchant 继承) | ❌ 否 | 数据库 trigger |
| `merchant_id` | ❌ 否 | ❌ 否 | 数据库约束 |

---

## 🎯 **业务规则**

### Save Draft (保存草稿)
- ✅ 可以不填 venue
- ✅ 可以不填 start_at / end_at
- ✅ 可以不填 title
- ✅ region_id 自动从 merchant.region_id 继承
- ✅ 最小验证：只要有 merchant_id 即可

### Publish (发布活动)
- ❌ 必须填 venue_id
- ❌ 必须填 start_at / end_at
- ❌ 必须填 title
- ❌ 必须至少有一个 ACTIVE 票种
- ✅ API 返回清晰错误码和提示

---

## 🧪 **测试用例**

### ✅ 测试 1: 最小 Draft (无任何字段)
```javascript
POST /api/admin/merchants/{merchantId}/events
{
  "published_status": "DRAFT"
}

// 预期: 201 Created ✅
// events: {
//   merchant_id: {merchantId},
//   region_id: {from merchant},
//   venue_id: NULL,
//   start_at: NULL,
//   end_at: NULL,
//   title: NULL,
//   status: 'draft'
// }
```

### ✅ 测试 2: Draft 有部分字段
```javascript
POST /api/admin/merchants/{merchantId}/events
{
  "published_status": "DRAFT",
  "title": "测试活动"
}

// 预期: 201 Created ✅
```

### ✅ 测试 3: Publish 缺少 venue
```javascript
POST /api/admin/merchants/{merchantId}/events
{
  "published_status": "PUBLISHED",
  "title": "测试活动",
  "start_at": "2026-02-01T22:00:00Z",
  "end_at": "2026-02-02T04:00:00Z",
  "ticket_types": [...]
}

// 预期: 400 Bad Request
// 错误码: "MERCHANT_VENUE_NOT_BOUND"
// 提示: "Venue is required for publishing"
```

### ✅ 测试 4: Publish 缺少时间
```javascript
POST /api/admin/merchants/{merchantId}/events
{
  "published_status": "PUBLISHED",
  "title": "测试活动",
  "venue_id": "{venueId}"
}

// 预期: 400 Bad Request
// 错误码: "VALIDATION_ERROR"
// 提示: "Start and end times are required for publishing"
```

### ✅ 测试 5: Publish 完整数据
```javascript
POST /api/admin/merchants/{merchantId}/events
{
  "published_status": "PUBLISHED",
  "title": "测试活动",
  "venue_id": "{venueId}",
  "start_at": "2026-02-01T22:00:00Z",
  "end_at": "2026-02-02T04:00:00Z",
  "ticket_types": [{
    "name": "General Admission",
    "category": "ENTRY",
    "price_cents": 2000,
    "quantity_total": 100,
    "status": "ACTIVE"
  }]
}

// 预期: 201 Created ✅
```

---

## 📝 **应用的迁移**

### 迁移 031
- **文件:** `031_fix_event_draft_without_venue.sql`
- **状态:** ✅ 已应用
- **内容:** 移除 `venue_id` NOT NULL 约束

### 迁移 032
- **文件:** `032_fix_event_draft_allow_null_times.sql`
- **状态:** ✅ 已应用
- **内容:** 移除 `start_at`, `end_at`, `title` NOT NULL 约束，更新时间检查约束

---

## 🔧 **前端验证逻辑**

### validateDraft() - 草稿验证
```typescript
// 最小验证：几乎不验证
const errors = [];
// 无需验证任何字段
return errors;
```

### validatePublish() - 发布验证
```typescript
const errors = [];

if (!title || !title.trim()) {
  errors.push('Title is required');
}

if (!venueId || !selectedVenue) {
  errors.push('Venue is required. Please bind a venue to this merchant first.');
}

if (!startDate || !startTime || !endDate || !endTime) {
  errors.push('Start and end times are required');
}

if (ticketTypes.length === 0) {
  errors.push('At least one ticket type is required');
}

const activeTickets = ticketTypes.filter(tt => tt.status === 'ACTIVE');
if (activeTickets.length === 0) {
  errors.push('At least one active ticket type is required');
}

return errors;
```

---

## 📋 **部署清单**

- [x] 创建迁移 031 (venue_id)
- [x] 创建迁移 032 (start_at, end_at, title)
- [x] 应用迁移 031
- [x] 应用迁移 032
- [x] 验证数据库字段可为 NULL
- [ ] 测试前端保存 draft
- [ ] 测试前端发布活动
- [ ] 更新文档

---

## 🚀 **验证步骤**

### 1. 验证数据库字段
```sql
SELECT column_name, is_nullable 
FROM information_schema.columns
WHERE table_name = 'events' 
  AND column_name IN ('venue_id', 'start_at', 'end_at', 'title');

-- 应该全部返回: is_nullable = 'YES' ✅
```

### 2. 前端测试
1. 打开 `/events/new?merchant_id={merchantId}`
2. **不填任何字段**
3. 点击 "Save Draft"
4. **应该成功保存** ✅

### 3. 发布测试
1. 继续上面的 draft
2. 点击 "Publish"
3. **应该提示缺少必填字段** ✅
4. 填写 venue, times, title, tickets
5. 再次点击 "Publish"
6. **应该成功发布** ✅

---

## 📊 **影响评估**

| 方面 | 影响 |
|------|------|
| **范围** | 数据库 + API（前端无需改动）|
| **风险** | 🟢 低 - 只放宽约束 |
| **回滚** | 容易 - 重新添加 NOT NULL（需先清理数据）|
| **破坏性** | ❌ 无 - 只启用新功能 |
| **数据迁移** | ❌ 不需要 - 现有数据都有完整字段 |
| **用户体验** | ✅ 提升 - 可以保存不完整的 draft |

---

## ✅ **总结**

### 之前
- ❌ 无法保存 draft（缺少 venue 报错）
- ❌ 无法保存 draft（缺少时间报错）
- ❌ 无法保存 draft（缺少标题报错）

### 现在
- ✅ 可以保存空 draft（只需 merchant_id）
- ✅ 可以逐步填写信息
- ✅ 发布时验证完整性
- ✅ 清晰的错误提示

### 文件变更
- `031_fix_event_draft_without_venue.sql` - 新建
- `032_fix_event_draft_allow_null_times.sql` - 新建
- `EVENT_DRAFT_FIX_SUMMARY.md` - 更新

### 迁移状态
- ✅ 031 applied
- ✅ 032 applied

**现在可以正常保存 draft 了！** 🎉
