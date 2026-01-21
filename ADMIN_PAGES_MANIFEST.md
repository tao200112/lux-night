# Admin 端口页面清单与路由映射

## 页面清单（基于 uiadmin 目录）

### 1. Dashboard (4个变体合并为1个)
- **UI 文件**: `uiadmin/admin_dashboard_overview_1-4/code.html`
- **路由**: `/admin`
- **功能**: 
  - KPI 统计卡片（Total Revenue, Orders, Merchants, Active Events）
  - 图表（Revenue Trend, Orders by Region, Top Merchants）
  - 警告/通知区域
  - 快捷操作

### 2. Approval Center List
- **UI 文件**: `uiadmin/approval_center_list/code.html`
- **路由**: `/admin/approvals`
- **功能**:
  - Segmented Tabs (Pending/Approved/Rejected)
  - 审批列表（Merchant/Event/Price Change 请求）
  - 搜索和筛选

### 3. Approval Detail Comparison
- **UI 文件**: `uiadmin/approval_detail_comparison/code.html`
- **路由**: `/admin/approvals/[requestId]`
- **功能**:
  - Before/After 对比面板
  - 审批操作（Approve/Reject）
  - 备注输入

### 4. Merchant Management List
- **UI 文件**: `uiadmin/merchant_management_list/code.html`
- **路由**: `/admin/merchants`
- **功能**:
  - 商家列表
  - 搜索和筛选（Region, Status）
  - 状态切换（Active/Suspended）

### 5. Merchant Detail (推断，需要从 merchant_management_list 推导)
- **路由**: `/admin/merchants/[merchantId]`
- **功能**:
  - 商家详情
  - 关联的 Venues, Events, Orders
  - 操作历史

### 6. Events and Pricing Control
- **UI 文件**: `uiadmin/events_and_pricing_control/code.html`
- **路由**: `/admin/events`
- **功能**:
  - 事件列表
  - 价格管理（Admin Override）
  - 状态管理

### 7. Event Detail (推断)
- **路由**: `/admin/events/[eventId]`
- **功能**:
  - 事件详情
  - 票务类型和价格
  - 订单统计

### 8. Order and Payment Records
- **UI 文件**: `uiadmin/order_and_payment_records/code.html`
- **路由**: `/admin/orders`
- **功能**:
  - 订单列表
  - 支付记录
  - 退款处理

### 9. Order Detail (推断)
- **路由**: `/admin/orders/[orderId]`
- **功能**:
  - 订单详情
  - 票务详情
  - 支付信息
  - 退款历史

### 10. Customer Directory
- **UI 文件**: `uiadmin/customer_directory/code.html`
- **路由**: `/admin/customers`
- **功能**:
  - 客户列表
  - 搜索和筛选
  - 客户分段（VIP/Regular）

### 11. Customer Detail (推断)
- **路由**: `/admin/customers/[customerId]`
- **功能**:
  - 客户详情
  - 订单历史
  - 偏好设置

### 12. Invite Code Management
- **UI 文件**: `uiadmin/invite_code_management/code.html`
- **路由**: `/admin/invites`
- **功能**:
  - 创建邀请码（Region 必选）
  - 邀请码列表（Recent Codes）
  - Revoke 操作

### 13. Data Export Center
- **UI 文件**: `uiadmin/data_export_center/code.html`
- **路由**: `/admin/exports`
- **功能**:
  - 创建导出任务（Type, Date Range, Region）
  - Recent Activity 列表（状态：PROCESSING/READY/FAILED）
  - 下载链接

### 14. System Settings
- **UI 文件**: `uiadmin/system_settings/code.html`
- **路由**: `/admin/settings`
- **功能**:
  - Region 状态列表（Operational/Maintenance）
  - Admin Users 列表（只读）
  - Force 2FA / API write access（UI toggle，暂时禁用）

### 15. No Access Page (新建)
- **路由**: `/admin/no-access`
- **功能**: 显示权限不足提示

## 路由映射总结

### 主要路由（带底部导航）
1. `/admin` - Dashboard
2. `/admin/approvals` - Approval Center (显示 pending badge)
3. `/admin/merchants` - Merchants
4. `/admin/orders` - Orders
5. `/admin/settings` - Settings

### 详情路由（无底部导航）
- `/admin/approvals/[requestId]` - Approval Detail
- `/admin/merchants/[merchantId]` - Merchant Detail
- `/admin/events/[eventId]` - Event Detail
- `/admin/orders/[orderId]` - Order Detail
- `/admin/customers/[customerId]` - Customer Detail

### 次要路由（从 Settings 或其他入口进入）
- `/admin/events` - Events (可从 Dashboard 或 Merchants 进入)
- `/admin/customers` - Customers (可从 Dashboard 进入)
- `/admin/invites` - Invite Manager (可从 Settings 进入)
- `/admin/exports` - Export Center (可从 Settings 进入)

## 底部导航统一

**强制统一为 5 个 Tab**：
1. **Dashboard** -> `/admin` (icon: dashboard)
2. **Approvals** -> `/admin/approvals` (icon: task_alt, badge: pending count)
3. **Merchants** -> `/admin/merchants` (icon: storefront)
4. **Orders** -> `/admin/orders` (icon: receipt_long)
5. **Settings** -> `/admin/settings` (icon: settings)

**其他页面**（Events, Customers, Invites, Exports）通过页面内入口或 Settings 内入口进入，不再占 bottom tab。
