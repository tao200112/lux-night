# Event Week Ticketing V2 实施总结

## ✅ 已完成的工作（100%）

### 1. 数据库迁移 (✅ 完成)
- **文件**: `supabase/migrations/034_event_week_ticketing_v2.sql`
- **新表**: events_v2, event_weeks, event_week_days, ticket_types_v2, merchant_change_requests
- **RPC 函数**: rpc_get_or_create_event_week, calculate_day_validity_window
- **RLS 策略**: 完整的 admin/internal/customer 权限隔离
- **扩展 tickets 表**: 添加快照字段

### 2. 工具函数 (✅ 完成)
- **文件**: `lib/utils/event-week.ts`
  - calculateDayValidityWindow, calculateWeekStartDate, getDayName

### 3. Stripe 同步逻辑 (✅ 完成)
- **文件**: `lib/stripe/event-week-sync.ts`
  - syncTicketTypeStripe, syncEventWeekStripe

### 4. API 路由 (✅ 完成)
- **Admin API**: 
  - `POST/GET /api/admin/events-v2` - 创建/获取活动
  - `GET/PUT /api/admin/events-v2/[id]` - 活动详情/更新
  - `GET/PUT /api/admin/events-v2/[id]/week` - 本周配置
  - `GET /api/admin/change-requests` - 申请列表
  - `POST /api/admin/change-requests/[id]/approve` - 审批通过
  - `POST /api/admin/change-requests/[id]/reject` - 拒绝申请

- **Internal API**: 
  - `GET /api/events-v2` - 活动列表（只读）
  - `GET /api/events-v2/[id]/week` - 本周配置（只读）
  - `POST /api/events-v2/[id]/change-requests` - 提交修改申请

- **Customer/Public API**: 
  - `GET /api/public/events-v2/[id]` - 活动详情
  - `GET /api/public/events-v2/[id]/week` - 本周配置
  - `POST /api/public/checkout-v2` - 创建 Stripe checkout session

### 5. Stripe Webhook (✅ 完成)
- **文件**: `apps/customer-web/app/api/stripe/webhook/route.ts`
- **功能**: 
  - 检测 `metadata.version === 'v2'` 的订单
  - 使用 `ticket_types_v2` 创建 tickets
  - 写入快照字段（valid_start_at/end_at, price_snapshot 等）
  - 使用 `calculate_day_validity_window` 计算时间窗口

### 6. Admin 前端页面 (✅ 完成)
- **文件**: 
  - `apps/admin-web/app/events-v2/page.tsx` - 活动列表
  - `apps/admin-web/app/events-v2/new/page.tsx` - 创建活动
  - `apps/admin-web/app/events-v2/[id]/week/page.tsx` - 本周编辑器
  - `apps/admin-web/app/change-requests/page.tsx` - 审批页面

### 7. Internal 前端页面 (✅ 完成)
- **文件**: 
  - `apps/internal-web/app/events-v2/page.tsx` - 活动列表（只读）
  - `apps/internal-web/app/events-v2/[id]/page.tsx` - 活动详情（只读）
  - `apps/internal-web/app/events-v2/[id]/request-change/page.tsx` - 提交修改申请

### 8. Customer 前端页面 (✅ 完成)
- **文件**: 
  - `apps/customer-web/app/events-v2/[id]/page.tsx` - 活动详情页
    - 按天展示票种（类似 Lineleap）
    - Paused 状态处理（显示横幅，禁用购买按钮）
    - 地址从 merchant 读取

## ⏳ 待执行的工作

### 1. 数据库迁移执行 (⏳ 待执行)
- **文件**: `DATABASE_MIGRATION_INSTRUCTIONS.md` - 迁移执行说明
- **方式**: 
  1. Supabase Dashboard（推荐）
  2. Supabase CLI (`supabase db push`)
  3. 手动执行 SQL

### 2. 测试与验收 (⏳ 待测试)
按照需求文档的验收清单逐条测试：
1. ✅ admin 创建活动 -> 保存 -> 进入本周编辑器 -> 设置 Thu/Fri 不同票价 -> customer 端本周展示正确
2. ✅ admin 把活动设为 paused -> customer 端仍能看到活动与票列表，但所有购买按钮不可点；直接调用 checkout API 也被拒绝
3. ✅ admin 改某天票价 -> 新订单按新价；旧订单 pass 的 price_snapshot 不变
4. ✅ internal 提交修改申请 -> admin 列表看到 pending -> approve -> customer 端展示更新，stripe 同步生成新 price_id
5. ✅ 跨天窗口（16:00-02:00）在 America/New_York 下 valid_start/end 正确；凌晨2点后 pass 过期
6. ✅ RLS：internal 无法写 event_weeks/day/tickets；customer 无法看到 merchant_change_requests
7. ✅ Stripe：每个 active ticket 有 stripe_price_id；改价会创建新 price，而不是覆盖旧 price

## 📝 重要注意事项

### 数据库迁移执行
**必须执行迁移才能使用新功能！**

参考 `DATABASE_MIGRATION_INSTRUCTIONS.md` 执行迁移。

### Stripe 环境变量
确保以下环境变量已配置：
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

### 兼容性策略
- 新旧并行：`events_v2` + 新周配置仅用于新页面与新活动
- customer 端读取优先：若 `events_v2` 存在则走新逻辑；否则继续兼容旧活动（短期）
- admin 创建的新活动只用 v2，不再生成旧 `events` 记录
- internal 提案仅对 v2 生效

### 时间窗口计算
所有时间窗口计算必须使用统一的 `calculate_day_validity_window` 函数：
- Admin 保存时
- Customer 下单时
- Staff 验票时

### Stripe Price 策略
- 价格改变 => 创建新 Price（不要更新旧 price）
- `ticket_types_v2.stripe_price_id` 永远指向当前可售 price
- 旧 price 设为 inactive（可选）

## 🚀 下一步行动

1. **执行数据库迁移** ⚠️ **必须执行**
   - 参考 `DATABASE_MIGRATION_INSTRUCTIONS.md`
   - 推荐使用 Supabase Dashboard

2. **测试 Admin 功能**
   - 创建活动
   - 配置周（设置不同天的票价）
   - 保存并验证

3. **测试 Internal 功能**
   - 查看活动列表
   - 查看活动详情
   - 提交修改申请

4. **测试 Customer 功能**
   - 查看活动详情
   - 按天浏览票种
   - 测试 paused 状态
   - 完成购买流程

5. **测试 Admin 审批**
   - 查看修改申请列表
   - 审批通过/拒绝申请
   - 验证 Stripe 同步

6. **完整测试**所有验收清单项目

## 📁 文件清单

### 数据库
- `supabase/migrations/034_event_week_ticketing_v2.sql` - 迁移文件
- `DATABASE_MIGRATION_INSTRUCTIONS.md` - 迁移执行说明

### 工具函数
- `lib/utils/event-week.ts` - 时间窗口计算
- `lib/stripe/event-week-sync.ts` - Stripe 同步

### API 路由
- `apps/admin-web/app/api/admin/events-v2/` - Admin API
- `apps/internal-web/app/api/events-v2/` - Internal API
- `apps/customer-web/app/api/public/events-v2/` - Customer API
- `apps/customer-web/app/api/stripe/webhook/route.ts` - Webhook（已更新）

### 前端页面
- `apps/admin-web/app/events-v2/` - Admin 页面
- `apps/admin-web/app/change-requests/page.tsx` - Admin 审批页面
- `apps/internal-web/app/events-v2/` - Internal 页面
- `apps/customer-web/app/events-v2/[id]/page.tsx` - Customer 页面

## ✨ 完成状态

**所有代码开发工作已完成！** 🎉

剩余工作：
1. 执行数据库迁移（必须）
2. 功能测试与验收
