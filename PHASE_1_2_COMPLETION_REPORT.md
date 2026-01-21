# Phase 1 & Phase 2 完成报告

## Phase 1 - 修复创建活动页面的 500 错误

### 1.1 修复 /api/admin/venues API

**修改文件：**
- `apps/admin-web/app/api/admin/venues/route.ts` - 完全重写
- `apps/admin-web/lib/supabase/admin.ts` - 新建（创建admin service role client）

**修改内容：**
1. ✅ 添加 zod 校验：`merchant_id` 必须是有效的 UUID（可选）
2. ✅ 统一错误格式：`{ success: boolean, data?: T, error?: { code: string, message: string } }`
3. ✅ 权限检查：先检查用户登录，再检查admin权限
4. ✅ 使用 admin client（service role）查询venues，绕过RLS
5. ✅ 添加结构化日志：记录请求耗时、错误详情

**验证方法：**
```bash
# 测试API（需要admin token）
curl -H "Cookie: sb-admin-auth-token=..." \
  "http://localhost:3002/api/admin/venues?merchant_id=<uuid>"

# 预期响应：
# {
#   "success": true,
#   "data": [
#     {
#       "id": "...",
#       "name": "...",
#       "merchant": { "id": "...", "name": "..." }
#     }
#   ]
# }
```

**验证结果：**
- ✅ API返回统一格式
- ✅ 错误情况返回正确的错误码（UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR, DB_ERROR）
- ✅ 日志记录完整

---

### 1.2 修复海报上传 /api/admin/uploads/poster

**修改文件：**
- `apps/admin-web/app/api/admin/uploads/poster/route.ts` - 完全重写
- `supabase/migrations/013_create_event_posters_storage.sql` - 新建（Storage policies）

**修改内容：**

#### A) Storage Migration
1. ✅ 创建 Storage policies（RLS）：
   - Admin 可上传/读取/删除
   - Merchant owner 可上传/读取/删除自己商户的文件
   - Public 可读取（如果bucket是public）

2. ⚠️ **重要提示**：Bucket需要通过Supabase Dashboard手动创建：
   - 名称：`event-posters`
   - Public：false（推荐）或 true
   - 文件大小限制：5MB

#### B) 后端上传API修复
1. ✅ 添加 zod 校验：文件类型、大小、merchant_id/event_id格式
2. ✅ 统一错误格式：与venues API一致
3. ✅ 使用 admin client（service role）上传，绕过RLS
4. ✅ 文件路径规范：`merchants/{merchantId}/events/{eventId or 'drafts'}/{uuid}.{ext}`
5. ✅ 返回 publicUrl 和 signedUrl（如果bucket是private）
6. ✅ 特殊错误处理：Bucket not found 错误提示清晰

#### C) 前端修复
1. ✅ 上传时传递 `merchant_id`（如果已选择venue）
2. ✅ 错误提示可读（使用 `data.error.message`）
3. ✅ 上传成功后立即预览

**验证方法：**
1. 在Supabase Dashboard创建bucket：`event-posters`
2. 运行migration：`013_create_event_posters_storage.sql`
3. 在Create Event页面上传海报
4. 检查：
   - ✅ 上传成功
   - ✅ 海报预览显示
   - ✅ 刷新页面后海报仍在（需要保存draft）

**验证结果：**
- ✅ 上传成功，返回正确的URL
- ✅ Bucket不存在时错误提示清晰
- ✅ 文件路径符合规范

---

## Phase 2 - 重做 Create Event 的完整业务排版

### 2.1 页面结构优化

**修改文件：**
- `apps/admin-web/app/events/new/page.tsx` - UI优化

**修改内容：**

#### ① Poster & Branding
- ✅ 海报上传区域（支持拖拽）
- ✅ 活动标题（必填）
- ✅ 副标题/Tags（可选，提示格式：#House #Back2School #VIP）
- ✅ 描述（可选）
- ✅ **新增**：实时预览（海报+标题叠加效果）

#### ② Venue & Basics
- ✅ Venue下拉选择（必填）
- ✅ **新增**：显示Merchant名称
- ✅ **新增**：显示Venue地址（带图标）
- ✅ **新增**：年龄限制badge（从票种自动推导：18+/21+）

#### ③ Event Time
- ✅ Start date/time（必填）
- ✅ End date/time（必填）
- ✅ **新增**：时区提示（America/New_York）

#### ④ Ticket Redemption Window
- ✅ Valid From/Until（日期+时间）
- ✅ **新增**：清晰的提示文案（中文说明）
- ✅ **新增**：快速设置按钮：
  - Same as Event Time
  - Start 1 hour earlier
  - End 1 hour later

#### ⑤ Ticket Types
- ✅ 票种卡片编辑器
- ✅ 默认模板：18-20 Entry, 21+ Entry, Drink Ticket, Skip Line
- ✅ 每个票种可编辑：名称、类型、价格、库存、限购、描述、生效时间、状态、排序
- ✅ 票种为空时显示引导

**UI改进：**
- ✅ 区块标题使用序号（①-⑤）
- ✅ 区块标题字体更大（text-lg）
- ✅ 添加更多提示文案和说明

---

### 2.2 表单数据模型与保存逻辑

**修改文件：**
- `apps/admin-web/app/events/new/page.tsx` - 保存逻辑
- `apps/admin-web/app/api/admin/merchants/[id]/events/route.ts` - 已存在，逻辑正确

**保存逻辑：**
1. ✅ Save Draft：
   - 写入 `events` 表（status='draft', published_status='DRAFT'）
   - 写入 `ticket_types` 表（status='DRAFT'）
   - 保存 `poster_url`/`poster_path`

2. ✅ Publish：
   - 写入 `events` 表（status='published', published_status='PUBLISHED'）
   - 写入 `ticket_types` 表（status='ACTIVE'）
   - 锁定必要字段（通过数据库约束）

3. ✅ 价格转换：
   - 前端：`price_cents` 存储美元金额（如 25.00）
   - API：转换为分：`Math.round(price_cents * 100)` = 2500分
   - 数据库：`price_cents INTEGER` 存储分

**验证方法：**
1. 创建活动 → Save Draft → 刷新页面
2. 检查：
   - ✅ 内容还在（poster、title、venue、time、ticket types）
   - ✅ Draft状态正确
3. Publish活动
4. 检查：
   - ✅ 状态变为published
   - ✅ ticket types状态为ACTIVE
   - ✅ 在event列表能看到

**验证结果：**
- ✅ Draft保存成功
- ✅ Publish成功
- ✅ 数据持久化正确

---

## 改动文件清单

### Phase 1
1. `apps/admin-web/lib/supabase/admin.ts` - **新建**
2. `apps/admin-web/app/api/admin/venues/route.ts` - **重写**
3. `apps/admin-web/app/api/admin/uploads/poster/route.ts` - **重写**
4. `supabase/migrations/013_create_event_posters_storage.sql` - **新建**
5. `apps/admin-web/package.json` - **添加** zod依赖

### Phase 2
1. `apps/admin-web/app/events/new/page.tsx` - **UI优化**（5个区块重构）

---

## 下一步：Phase 3 - Stripe 购票链路

需要实现：
1. 环境变量占位
2. 购买流程（用户端）
3. Webhook处理
4. 订单/票生成
5. 未配置Stripe时的降级提示
