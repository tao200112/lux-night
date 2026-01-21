# Admin Portal UI 重做进度报告

## ✅ 已完成任务

### Phase 1: 修复 API 500 错误 ✅
- [x] 修复 `/api/admin/approvals` - 改为分两步查询（避免 relationship join 错误）
- [x] 修复 `/api/admin/approvals/[id]` - 改为分两步查询

### Phase 2: 统一底部导航 ✅
- [x] 更新 `AdminBottomNav.tsx` 按照 `uiadmin/approval_center_list/code.html` 标准结构
- [x] 使用正确的图标和样式（`approval_delegation` 图标）
- [x] 实现 badge 显示（pending count）

### Phase 3: Dashboard 修复与重写 ✅

#### 3.1 读取 UI 文档 ✅
- [x] 已读取 `uiadmin/admin_dashboard_overview_1/code.html`

#### 3.2 修复 NaN% 问题 ✅
- [x] 修复 `/api/admin/overview` 中的趋势计算逻辑
- [x] 添加 `calculateTrend` 函数，确保所有除法操作都有 `isNaN` 检查
- [x] 当 `previous = 0` 时返回 `null`，显示 `"—"`
- [x] 更新 `KPIStatCard` 组件支持 `trend: number | null`

#### 3.3 重写 Dashboard 页面 ✅
- [x] 完全按照 UI 文档重写页面结构
- [x] 实现 Alert Section（High Refund Rate Alert, Pending Approvals）
- [x] 实现 KPI Grid（4 个卡片：Total Revenue, Net Revenue, Orders Today, Tickets Redeemed）
- [x] 实现 Charts Section（Revenue Trends 折线图, Orders by Region 柱状图）
- [x] 实现 Top Merchants Table
- [x] 创建 `lib/data/admin/dashboard.ts` 用于数据获取
- [x] 确保所有样式与 UI 文档完全一致

### Phase 4: Approvals List 页面重写 ✅
- [x] 读取 `uiadmin/approval_center_list/code.html`
- [x] 完全重写页面结构（卡片列表、Segmented Tabs、Date Header）
- [x] 实现 Today/Yesterday 分组显示
- [x] 实现 Approve/Reject 按钮功能
- [x] 实现类型图标和颜色区分（Price Change/Event Edit/Inventory Release）
- [x] 确保所有样式与 UI 文档完全一致

### Phase 5: Approval Detail 页面重写 ✅
- [x] 读取 `uiadmin/approval_detail_comparison/code.html`
- [x] 完全重写 Before/After 对比面板
- [x] 实现价格/数量/日期对比卡片
- [x] 实现 Sticky Bottom Action Bar（Notes Input + Approve/Reject 按钮）
- [x] 确保所有样式与 UI 文档完全一致

### Phase 6: 抽取公共组件（可选）
- [x] KPIStatCard - 已更新支持 `trend: number | null`
- [ ] ApprovalCard - 可从 approvals list 页面抽取（当前内联在页面中）
- [ ] 其他可复用组件（如有需要）

### Phase 7: 重写剩余页面（待开始）
- [ ] Merchants (`/admin/merchants`) - 需要读取 `uiadmin/merchant_management_list/code.html`
- [ ] Events (`/admin/events`) - 需要读取 `uiadmin/events_and_pricing_control/code.html`
- [ ] Orders (`/admin/orders`) - 需要读取 `uiadmin/order_and_payment_records/code.html`
- [ ] Customers (`/admin/customers`) - 需要读取 `uiadmin/customer_directory/code.html`
- [ ] Invites (`/admin/invites`) - 需要读取 `uiadmin/invite_code_management/code.html`
- [ ] Exports (`/admin/exports`) - 需要读取 `uiadmin/data_export_center/code.html`
- [ ] Settings (`/admin/settings`) - 需要读取 `uiadmin/system_settings/code.html`

### Phase 8: 最终检查（待开始）
- [ ] Console 无 500 错误（approvals API 已修复）
- [ ] Console 无重复 fetch 请求
- [ ] UI 结构与 UI 文档完全一致（Dashboard、Approvals List、Approval Detail 已完成）
- [ ] 所有功能正常工作
- [ ] Dashboard 无 NaN% 显示（已修复）

## ✅ 已完成核心工作

### 关键修复
1. ✅ **Approvals API 500 错误**：修复了 `profiles!requests_requested_by_fkey` relationship join 错误，改为分两步查询
2. ✅ **Dashboard NaN% 问题**：修复了所有趋势计算中的 NaN 问题，当 previous=0 时显示 `"—"`
3. ✅ **统一底部导航**：所有页面使用统一的 `AdminBottomNav` 组件，样式与 UI 文档完全一致

### 核心页面重写
1. ✅ **Dashboard** (`/admin`)：完全按照 `uiadmin/admin_dashboard_overview_1/code.html` 重写
2. ✅ **Approvals List** (`/admin/approvals`)：完全按照 `uiadmin/approval_center_list/code.html` 重写
3. ✅ **Approval Detail** (`/admin/approvals/[id]`)：完全按照 `uiadmin/approval_detail_comparison/code.html` 重写

## 当前步骤

已完成：**Phase 1-5（API 修复、导航统一、Dashboard 重写、Approvals 重写）**

接下来：**Phase 7 - 重写剩余页面（Merchants/Events/Orders/Customers/Invites/Exports/Settings）**
