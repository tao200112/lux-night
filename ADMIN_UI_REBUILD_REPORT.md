# Admin Portal UI 对照重做 - 自检报告

## A) Step 1: UI 文档扫描结果

### 页面清单与路由映射

| UI 文档路径 | 对应路由 | 数据来源 | 状态 |
|------------|---------|---------|------|
| `uiadmin/admin_dashboard_overview_1/code.html` | `/admin` 或 `/dashboard` | `/api/admin/overview` (KPIs, alerts, trends, top merchants) | ⚠️ 需重写 |
| `uiadmin/admin_dashboard_overview_2/code.html` | - | Dashboard 变体（可能为筛选视图） | ⚠️ 需评估 |
| `uiadmin/admin_dashboard_overview_3/code.html` | - | Dashboard 变体（可能为筛选视图） | ⚠️ 需评估 |
| `uiadmin/admin_dashboard_overview_4/code.html` | - | Dashboard 变体（可能为筛选视图） | ⚠️ 需评估 |
| `uiadmin/approval_center_list/code.html` | `/admin/approvals` | `/api/admin/approvals?status=` | ⚠️ 需重写 |
| `uiadmin/approval_detail_comparison/code.html` | `/admin/approvals/[id]` | `/api/admin/approvals/[id]` | ⚠️ 需重写 |
| `uiadmin/merchant_management_list/code.html` | `/admin/merchants` | `/api/admin/merchants` | ⚠️ 需重写 |
| `uiadmin/events_and_pricing_control/code.html` | `/admin/events` | `/api/admin/events` | ⚠️ 需重写 |
| `uiadmin/order_and_payment_records/code.html` | `/admin/orders` | `/api/admin/orders` | ⚠️ 需重写 |
| `uiadmin/customer_directory/code.html` | `/admin/customers` | `/api/admin/customers` | ⚠️ 需重写 |
| `uiadmin/invite_code_management/code.html` | `/admin/invites` | `/api/admin/invites` | ⚠️ 需重写 |
| `uiadmin/data_export_center/code.html` | `/admin/exports` | `/api/admin/exports` | ⚠️ 需重写 |
| `uiadmin/system_settings/code.html` | `/admin/settings` | `/api/admin/settings` | ⚠️ 需重写 |

### 底部导航标准（从 `approval_center_list/code.html`）

```html
<nav class="fixed bottom-0 left-0 w-full bg-surface-light dark:bg-surface-dark border-t border-gray-200 dark:border-gray-800 flex justify-around items-center h-16 pb-safe z-50">
  <a>Dashboard</a>
  <a>Approvals</a> <!-- 带 pending badge -->
  <a>Events</a>
  <a>Settings</a>
</nav>
```

**统一组件要求**：所有页面必须使用同一个 `AdminBottomNav.tsx` 组件。

## B) Step 2: 当前实现差距

### 已存在的页面（`apps/admin-web/app/`）

| 当前文件 | UI 文档 | 状态 | 操作 |
|---------|--------|------|------|
| `dashboard/page.tsx` | `admin_dashboard_overview_1/code.html` | ❌ 不完全匹配 | 需完全重写 |
| `approvals/page.tsx` | `approval_center_list/code.html` | ❌ 不完全匹配 | 需完全重写 |
| `approvals/[requestId]/page.tsx` | `approval_detail_comparison/code.html` | ❌ 不完全匹配 | 需完全重写 |
| `merchants/page.tsx` | `merchant_management_list/code.html` | ❌ 不完全匹配 | 需完全重写 |
| `events/page.tsx` | `events_and_pricing_control/code.html` | ❌ 不完全匹配 | 需完全重写 |
| `orders/page.tsx` | `order_and_payment_records/code.html` | ❌ 不完全匹配 | 需完全重写 |
| `customers/page.tsx` | `customer_directory/code.html` | ❌ 不完全匹配 | 需完全重写 |
| `invites/page.tsx` | `invite_code_management/code.html` | ❌ 不完全匹配 | 需完全重写 |
| `exports/page.tsx` | `data_export_center/code.html` | ❌ 不完全匹配 | 需完全重写 |
| `settings/page.tsx` | `system_settings/code.html` | ❌ 不完全匹配 | 需完全重写 |

### 需要抽取的公共组件

1. **AdminBottomNav.tsx** - 统一底部导航（必须从 `approval_center_list/code.html` 提取）
2. **AdminTopBar.tsx** - 统一顶部导航栏（已存在，需对照 UI 调整）
3. **SegmentedTabs.tsx** - 分段标签（已存在，需对照 UI 调整）
4. **KPIStatCard.tsx** - KPI 卡片（需从 `admin_dashboard_overview_1/code.html` 提取）
5. **ApprovalCard.tsx** - 审批卡片（需从 `approval_center_list/code.html` 提取）
6. **ApprovalDiffPanel.tsx** - Before/After 对比面板（已存在，需对照 UI 调整）
7. **StatusBadge.tsx** - 状态徽章（已存在，需对照 UI 调整）
8. **EmptyState/Skeleton/ErrorState** - 空状态/加载/错误（已存在，需对照 UI 调整）

## C) Step 3: Approvals API 500 根因与修复

### 根因分析

**错误信息**：`Could not find a relationship between 'requests' and 'profiles' in the schema cache`

**具体原因**：
- API 使用了 `profiles!requests_requested_by_fkey` 这种 relationship join 语法
- 但 `requests.requested_by` 字段是 `REFERENCES auth.users(id)`，而不是 `REFERENCES profiles(id)`
- Supabase 的 relationship join 只能基于外键约束，而 `requests` 表没有直接的外键指向 `profiles` 表
- 虽然 `profiles.id = auth.users.id`，但 Supabase 的 schema cache 不会自动推断这种间接关系

**问题代码位置**：
- `apps/admin-web/app/api/admin/approvals/route.ts` 第 56 行
- `apps/admin-web/app/api/admin/approvals/[id]/route.ts` 第 60-70 行

### 修复方案

**方案**：分两步查询，避免 relationship join

1. **第一步**：查询 `requests` 表和相关表（`merchants`, `venues`, `events`），获取 `requested_by` 和 `decided_by` 的 user_id
2. **第二步**：批量查询 `profiles` 表，通过 `IN` 查询获取所有相关用户的 profile 信息
3. **第三步**：在代码中手动关联 profiles 到 requests

### 修复状态

✅ **已完成**：
- `apps/admin-web/app/api/admin/approvals/route.ts` - 已修复（分两步查询）
- `apps/admin-web/app/api/admin/approvals/[id]/route.ts` - 已修复（分两步查询）

## D) 修复与重做计划

### 优先级 1：修复 API 500 错误（已完成）
- [x] 修复 `/api/admin/approvals` join 查询
- [x] 修复 `/api/admin/approvals/[id]` join 查询

### 优先级 2：统一底部导航
- [ ] 从 `uiadmin/approval_center_list/code.html` 提取标准底部导航结构
- [ ] 创建 `AdminBottomNav.tsx` 组件
- [ ] 所有页面替换为统一组件

### 优先级 3：重写核心页面（按 UI 文档）
- [ ] Dashboard (`/admin`) - 对照 `admin_dashboard_overview_1/code.html`
- [ ] Approvals List (`/admin/approvals`) - 对照 `approval_center_list/code.html`
- [ ] Approval Detail (`/admin/approvals/[id]`) - 对照 `approval_detail_comparison/code.html`

### 优先级 4：修复 Dashboard NaN% 问题
- [ ] 所有 KPI delta 计算：当 `previous = 0` 或 `null` 时显示 `0%` 或 `"—"`
- [ ] 确保所有除法操作都有 `isNaN` 检查

### 优先级 5：重写剩余页面
- [ ] Merchants (`/admin/merchants`)
- [ ] Events (`/admin/events`)
- [ ] Orders (`/admin/orders`)
- [ ] Customers (`/admin/customers`)
- [ ] Invites (`/admin/invites`)
- [ ] Exports (`/admin/exports`)
- [ ] Settings (`/admin/settings`)

## E) 验收 Checklist

### API 修复验收
- [x] `/api/admin/approvals` 返回 200，无 500 错误
- [x] `/api/admin/approvals?status=pending` 返回正常数据
- [x] `/api/admin/approvals?status=approved` 返回正常数据
- [x] `/api/admin/approvals?status=rejected` 返回正常数据
- [x] `/api/admin/approvals/[id]` 返回 200，包含完整的 before/after 数据

### UI 对照验收
- [ ] Dashboard 页面结构与 `admin_dashboard_overview_1/code.html` 完全一致
- [ ] Approvals List 页面结构与 `approval_center_list/code.html` 完全一致
- [ ] Approval Detail 页面结构与 `approval_detail_comparison/code.html` 完全一致
- [ ] 所有页面使用统一的 `AdminBottomNav` 组件
- [ ] 所有页面的布局、间距、颜色、字体与 UI 文档一致

### 功能验收
- [ ] Dashboard KPI 无 NaN% 显示
- [ ] Approvals 三个 tab（Pending/Approved/Rejected）都能正常加载
- [ ] Approve/Reject 操作能正常执行并写入数据库
- [ ] 所有列表都有 loading/empty/error 状态

### Console 验收
- [ ] 无 500 错误
- [ ] 无重复 fetch 请求
- [ ] 无 relationship 相关错误

## 下一步行动

1. **立即执行**：统一底部导航组件（从 `approval_center_list/code.html` 提取）
2. **按顺序重写**：Dashboard → Approvals List → Approvals Detail
3. **修复 NaN**：在重写 Dashboard 时同时修复 NaN% 问题
4. **批量重写**：剩余页面按优先级逐个重写
