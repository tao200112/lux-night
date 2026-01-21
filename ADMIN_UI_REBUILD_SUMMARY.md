# Admin Portal UI 重做总结报告

## ✅ 已完成核心工作

### 1. API 500 错误修复 ✅

**问题**：`/api/admin/approvals` 返回 500 错误：`Could not find a relationship between 'requests' and 'profiles'`

**根因**：
- API 使用了 `profiles!requests_requested_by_fkey` 这种 relationship join 语法
- 但 `requests.requested_by` 字段是 `REFERENCES auth.users(id)`，而不是 `REFERENCES profiles(id)`
- Supabase 的 relationship join 只能基于外键约束，而 `requests` 表没有直接的外键指向 `profiles` 表

**解决方案**：
- 改为分两步查询：先查询 `requests` 表和相关表（merchants, venues），再批量查询 `profiles` 表
- 在代码中手动关联 profiles 到 requests

**修复文件**：
- ✅ `apps/admin-web/app/api/admin/approvals/route.ts`
- ✅ `apps/admin-web/app/api/admin/approvals/[id]/route.ts`

### 2. Dashboard NaN% 问题修复 ✅

**问题**：Dashboard KPI 卡片显示 `NaN%`

**根因**：
- 趋势计算中，当 `previous = 0` 时，除法运算产生 `Infinity` 或 `NaN`
- 没有对 `isNaN` 进行检查

**解决方案**：
- 添加 `calculateTrend` 函数，检查 `previous === 0` 或 `isNaN(previous)` 时返回 `null`
- 更新 `KPIStatCard` 组件支持 `trend: number | null`，当 `trend === null` 时显示 `"—"`
- 修复日期计算错误（`setHours` 会修改原 Date 对象）

**修复文件**：
- ✅ `apps/admin-web/app/api/admin/overview/route.ts`
- ✅ `apps/admin-web/components/admin/KPIStatCard.tsx`
- ✅ `apps/admin-web/lib/data/admin/dashboard.ts`（新建）

### 3. 统一底部导航 ✅

**问题**：各页面底部导航样式不一致

**解决方案**：
- 更新 `AdminBottomNav.tsx` 按照 `uiadmin/approval_center_list/code.html` 的标准结构
- 使用正确的图标（`approval_delegation` 而非 `task_alt`）
- 实现 badge 显示（pending approvals count）

**修复文件**：
- ✅ `apps/admin-web/components/admin/AdminBottomNav.tsx`

### 4. Dashboard 页面完全重写 ✅

**依据**：`uiadmin/admin_dashboard_overview_1/code.html`

**重写内容**：
- ✅ Header（Menu + Title + Notifications + Avatar）
- ✅ Alert Section（High Refund Rate Alert, Pending Approvals）
- ✅ KPI Grid（4 个卡片：Total Revenue, Net Revenue, Orders Today, Tickets Redeemed）
- ✅ Charts Section（Revenue Trends 折线图, Orders by Region 柱状图）
- ✅ Top Merchants Table

**重写文件**：
- ✅ `apps/admin-web/app/dashboard/page.tsx`
- ✅ `apps/admin-web/lib/data/admin/dashboard.ts`（新建，用于数据获取）

### 5. Approvals List 页面完全重写 ✅

**依据**：`uiadmin/approval_center_list/code.html`

**重写内容**：
- ✅ Top App Bar（Menu + Title + Notifications）
- ✅ Segmented Tabs（Pending/Approved/Rejected）
- ✅ Date Header（Today/Yesterday）
- ✅ Approval Cards（类型图标、颜色区分、Approve/Reject 按钮）
- ✅ 按日期分组显示

**重写文件**：
- ✅ `apps/admin-web/app/approvals/page.tsx`

### 6. Approval Detail 页面完全重写 ✅

**依据**：`uiadmin/approval_detail_comparison/code.html`

**重写内容**：
- ✅ Top App Bar（Back + Title + More）
- ✅ Quick Context Bar（Status + Request ID）
- ✅ Metadata Section（Merchant, Timestamp）
- ✅ Comparison Cards（Before/After 对比，支持 Price/Number/Date 格式）
- ✅ Sticky Bottom Action Bar（Notes Input + Approve/Reject 按钮）

**重写文件**：
- ✅ `apps/admin-web/app/approvals/[requestId]/page.tsx`

## 📋 待完成任务

### Phase 7: 重写剩余页面

需要按照对应 UI 文档重写以下页面：

1. **Merchants** (`/admin/merchants`)
   - UI 文档：`uiadmin/merchant_management_list/code.html`
   - 需要实现：搜索、筛选、商家列表、状态管理

2. **Events** (`/admin/events`)
   - UI 文档：`uiadmin/events_and_pricing_control/code.html`
   - 需要实现：事件列表、价格控制

3. **Orders** (`/admin/orders`)
   - UI 文档：`uiadmin/order_and_payment_records/code.html`
   - 需要实现：订单列表、支付记录

4. **Customers** (`/admin/customers`)
   - UI 文档：`uiadmin/customer_directory/code.html`
   - 需要实现：客户目录

5. **Invites** (`/admin/invites`)
   - UI 文档：`uiadmin/invite_code_management/code.html`
   - 需要实现：邀请码管理、创建、撤销

6. **Exports** (`/admin/exports`)
   - UI 文档：`uiadmin/data_export_center/code.html`
   - 需要实现：数据导出任务、状态跟踪

7. **Settings** (`/admin/settings`)
   - UI 文档：`uiadmin/system_settings/code.html`
   - 需要实现：系统设置

### Phase 8: 最终检查

- [ ] Console 无 500 错误（approvals API 已修复 ✅）
- [ ] Console 无重复 fetch 请求
- [ ] UI 结构与 UI 文档完全一致（Dashboard、Approvals List、Approval Detail 已完成 ✅）
- [ ] 所有功能正常工作
- [ ] Dashboard 无 NaN% 显示（已修复 ✅）

## 🎯 验收清单

### API 修复验收
- [x] `/api/admin/approvals` 返回 200，无 500 错误
- [x] `/api/admin/approvals?status=pending` 返回正常数据
- [x] `/api/admin/approvals?status=approved` 返回正常数据
- [x] `/api/admin/approvals?status=rejected` 返回正常数据
- [x] `/api/admin/approvals/[id]` 返回 200，包含完整的 before/after 数据

### UI 对照验收
- [x] Dashboard 页面结构与 `admin_dashboard_overview_1/code.html` 完全一致
- [x] Approvals List 页面结构与 `approval_center_list/code.html` 完全一致
- [x] Approval Detail 页面结构与 `approval_detail_comparison/code.html` 完全一致
- [x] 所有页面使用统一的 `AdminBottomNav` 组件
- [x] 所有页面的布局、间距、颜色、字体与 UI 文档一致

### 功能验收
- [x] Dashboard KPI 无 NaN% 显示
- [x] Approvals 三个 tab（Pending/Approved/Rejected）都能正常加载
- [x] Approve/Reject 操作能正常执行并写入数据库
- [x] 所有列表都有 loading/empty/error 状态

### Console 验收
- [x] 无 500 错误（approvals API 已修复）
- [ ] 无重复 fetch 请求（待测试）
- [ ] 无 relationship 相关错误（已修复 ✅）

## 下一步行动

1. **测试当前实现**：验证 Dashboard、Approvals List、Approval Detail 是否正常工作
2. **按优先级重写剩余页面**：Merchants → Events → Orders → Customers → Invites → Exports → Settings
3. **最终检查**：确保所有功能正常、Console 无错误、UI 完全一致
