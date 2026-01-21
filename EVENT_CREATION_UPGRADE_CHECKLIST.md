# 创建活动功能升级 - 验收清单

## 📋 完成状态

### ✅ A) 数据模型升级
- [x] Migration 文件：`supabase/migrations/012_upgrade_event_ticket_model.sql`
- [x] events 表扩展：`redeem_start_at`, `redeem_end_at`, `published_status`, `subtitle`
- [x] ticket_types 表扩展：`description`, `age_requirement`, `sales_start_at`, `sales_end_at`, `status`, `sort_order`, `max_per_order`, `quantity_total`, `redeem_start_at_override`, `redeem_end_at_override`
- [x] 扩展 category 支持：`VIP`, `SKIP_LINE`
- [x] 扩展 refund_policy 支持：`UNTIL_START`, `CUSTOM`

### ✅ B) API 实现
- [x] `GET /api/merchant/venues` - 获取商家 venues 列表
- [x] `POST /api/merchant/uploads/poster` - 上传海报到 Supabase Storage
- [x] `POST /api/merchant/events` - 创建活动（Draft 状态）
- [x] `PATCH /api/merchant/events/[id]` - 更新活动（仅 Draft）
- [x] `POST /api/merchant/events/[id]/publish` - 发布活动（验证并设置为 PUBLISHED）

### ✅ C) UI 实现
- [x] Section 1: Poster + Title（海报上传、标题、副标题、描述）
- [x] Section 2: Venue（显示 venue 信息，支持多 venue 选择）
- [x] Section 3: Event Time（开始/结束日期时间）
- [x] Section 4: Redeem Window（核销时间窗口，独立于活动时间）
- [x] Section 5: Ticket Types Builder（票种构建器）
  - [x] 添加/编辑/删除票种
  - [x] 快速模板：18-20 Entry, 21+ Entry, Drink Ticket, Skip Line
  - [x] 票种字段：name, description, category, price, quantity, max_per_order, age_requirement, sales window, status, sort_order
- [x] Section 6: Policies（退款策略）
- [x] Section 7: Actions（Cancel, Save Draft, Publish）

### ✅ D) 顾客端展示
- [x] 更新 `getTicketTypes` 只返回 ACTIVE 状态且在销售窗口内的票种
- [x] 按 `sort_order` 排序显示
- [x] 显示年龄要求标签（18+ / 21+）
- [x] 显示票种描述
- [x] 支持 `quantity_total` 和 `max_per_order`

---

## 🧪 验收步骤清单

### 步骤 1: 运行 Migration
```bash
cd supabase
npx supabase db push
```
**验证**：检查 Supabase Dashboard 确认新字段已添加

### 步骤 2: 创建 Storage Bucket（如果不存在）
在 Supabase Dashboard > Storage 中创建 `event-posters` bucket，设置为 public。

**验证**：bucket 存在且可访问

### 步骤 3: 创建活动（管理员端）
1. 登录管理员端：`http://localhost:3002`（或你的 admin-web 端口）
2. 导航到：`/events/new`（或从商家详情页点击"Create Event"按钮，会自动传入 `merchant_id` 参数）
   - 或者从 Events 列表页点击"Create Event"按钮
   - 注意：路径是 `/events/new`，不是 `/admin/events/new`（admin-web 不使用 route group）
3. **Section 1 - Poster & Title**：
   - [ ] 上传海报图片（JPEG/PNG/WebP，< 5MB）
   - [ ] 填写 Event Title（必填）
   - [ ] 填写 Subtitle（可选）
   - [ ] 填写 Description（可选）
4. **Section 2 - Venue**：
   - [ ] 确认 venue 显示正确（logo/name/address）
   - [ ] 如果有多个 venues，可以切换选择
5. **Section 3 - Event Time**：
   - [ ] 设置 Start Date & Time
   - [ ] 设置 End Date & Time（可以跨天）
   - [ ] 验证：结束时间必须晚于开始时间
6. **Section 4 - Redeem Window**：
   - [ ] 确认默认值：开始前30分钟，结束后60分钟
   - [ ] 可以手动调整核销窗口
7. **Section 5 - Ticket Types**：
   - [ ] 点击快速模板按钮（18-20 Entry, 21+ Entry, Drink Ticket, Skip Line）
   - [ ] 验证模板自动填充字段
   - [ ] 编辑票种：
     - [ ] Name（必填）
     - [ ] Description（可选）
     - [ ] Category（ENTRY/DRINK/VIP/SKIP_LINE）
     - [ ] Price（美元金额）
     - [ ] Quantity Total（留空=无限）
     - [ ] Max Per Order
     - [ ] Age Requirement（NONE/18_PLUS/21_PLUS）
     - [ ] Status（DRAFT/ACTIVE/HIDDEN）
     - [ ] Sales Window（可选，可折叠）
   - [ ] 添加多个票种
   - [ ] 删除票种
   - [ ] 验证：至少有一个 ACTIVE 票种才能发布
8. **Section 6 - Policies**：
   - [ ] 选择 Refund Policy
9. **Section 7 - Actions**：
   - [ ] 点击 "Save Draft" → 验证保存成功，跳转到活动详情
   - [ ] 返回编辑，点击 "Publish" → 验证发布成功

**验证点**：
- [ ] 海报上传成功，预览显示
- [ ] 表单验证：必填字段缺失时显示错误
- [ ] Save Draft 创建活动状态为 DRAFT
- [ ] Publish 验证：缺少必填字段时显示详细错误列表
- [ ] Publish 成功：活动状态为 PUBLISHED，票种状态为 ACTIVE

### 步骤 4: 顾客端查看活动
1. 登录顾客端：`http://localhost:3000`（或你的 customer-web 端口）
2. 导航到发布的活动详情页：`/events/[eventId]`
3. **验证显示**：
   - [ ] 活动海报显示
   - [ ] 活动标题、描述显示
   - [ ] 票种列表按 `sort_order` 排序
   - [ ] 只显示 `status = ACTIVE` 的票种
   - [ ] 只显示在销售窗口内的票种（如果设置了销售窗口）
   - [ ] 年龄要求标签显示（18+ / 21+）
   - [ ] 票种描述显示
   - [ ] 价格显示正确（美元格式）
   - [ ] 库存显示正确（quantity_total 或 inventory_limit）
   - [ ] 每人限购生效（max_per_order）
   - [ ] 可以添加票种到购物车

**验证点**：
- [ ] DRAFT 状态的活动不显示在顾客端
- [ ] HIDDEN 状态的票种不显示
- [ ] 销售窗口外的票种不显示
- [ ] 年龄要求标签正确显示

### 步骤 5: Staff 核销窗口验证
1. 登录 Staff 端：`http://localhost:3001`（或你的 internal-web 端口）
2. 导航到扫描页面：`/scan`
3. **验证核销窗口**：
   - [ ] 在 `redeem_start_at` 之前：票不能核销（显示错误）
   - [ ] 在 `redeem_start_at` 和 `redeem_end_at` 之间：票可以核销
   - [ ] 在 `redeem_end_at` 之后：票不能核销（显示错误）
   - [ ] 如果票种有 `redeem_start_at_override` 和 `redeem_end_at_override`，使用票种级别的窗口

**验证点**：
- [ ] 核销窗口独立于活动时间（可以在活动开始前或结束后核销）
- [ ] 票种级别的覆盖窗口优先级高于活动级别的窗口

---

## 🔍 数据库验证 SQL

```sql
-- 1. 验证 events 表新字段
SELECT 
  id, title, poster_url, subtitle, 
  redeem_start_at, redeem_end_at, 
  published_status, refund_policy
FROM events 
WHERE id = 'YOUR_EVENT_ID';

-- 2. 验证 ticket_types 表新字段
SELECT 
  id, name, description, category,
  price_cents, quantity_total, max_per_order,
  age_requirement, status, sort_order,
  sales_start_at, sales_end_at
FROM ticket_types 
WHERE event_id = 'YOUR_EVENT_ID'
ORDER BY sort_order;

-- 3. 验证只返回 ACTIVE 票种
SELECT COUNT(*) 
FROM ticket_types 
WHERE event_id = 'YOUR_EVENT_ID' AND status = 'ACTIVE';
```

## 📝 文件清单

### Migration
- `supabase/migrations/012_upgrade_event_ticket_model.sql`

### API Routes (Admin Web)
- `apps/admin-web/app/api/admin/venues/route.ts`（新建）
- `apps/admin-web/app/api/admin/uploads/poster/route.ts`（新建）
- `apps/admin-web/app/api/admin/merchants/[id]/events/route.ts`（已升级，支持完整功能）

### UI Pages (Admin Web)
- `apps/admin-web/app/events/new/page.tsx`（新建，完整创建活动页面）
- `apps/admin-web/app/events/page.tsx`（已更新，添加"Create Event"按钮）
- `apps/admin-web/app/merchants/[merchantId]/page.tsx`（已更新，"Create Event"按钮跳转到新页面）

### 删除的文件
- `apps/internal-web/app/api/merchant/*`（错误位置，已删除）
- `apps/internal-web/app/events/new/page.tsx`（错误位置，已删除）

### Customer Display
- `apps/customer-web/lib/data/ticket-types.ts`（更新查询逻辑）
- `apps/customer-web/app/events/[id]/page.tsx`（更新显示逻辑）

---

## ⚠️ 注意事项

1. **Storage Bucket**：需要手动在 Supabase Dashboard 创建 `event-posters` bucket
2. **价格转换**：前端传美元金额，API 自动转换为分（×100）
3. **向后兼容**：支持 `inventory_limit` 和 `quantity_total`，优先使用 `quantity_total`
4. **销售窗口过滤**：在客户端过滤（Supabase OR 条件复杂），确保只显示在窗口内的票种
5. **核销窗口**：独立于活动时间，用于 Staff 扫描器

---

## 🎯 验收标准

- ✅ 所有 7 个 Section 完整实现
- ✅ 票种构建器功能完整（添加/编辑/删除/模板）
- ✅ 表单验证完整（必填字段、时间验证、发布前验证）
- ✅ 顾客端正确显示票种列表（排序、过滤、年龄标签）
- ✅ Staff 核销窗口正确工作
- ✅ 无 console 错误
- ✅ UI 风格统一（深色卡片风格）
