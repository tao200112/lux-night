# Admin 端口验收 Checklist

## ✅ 已完成项

### 数据库与 Schema
- ✅ 创建 `supabase/migrations/007_admin_schema.sql`
- ✅ 扩展 `regions` 表（添加 `status` 字段）
- ✅ 扩展 `invites` 表（添加 `region_id`, `redeemed_by`, `redeemed_at`）
- ✅ 扩展 `requests` 表（添加 `payload_before`, `payload_after`）
- ✅ 创建 `audit_logs` 表
- ✅ 创建 `export_tasks` 表
- ✅ 创建 `log_audit()` 辅助函数

### 基础架构
- ✅ Admin Layout (`apps/internal-web/app/admin/layout.tsx`)
- ✅ Admin No Access 页面 (`apps/internal-web/app/admin/no-access/page.tsx`)
- ✅ Tailwind 配置更新（Admin 颜色系统）

### 共享组件库
- ✅ `AdminTopBar` - 统一顶部导航栏
- ✅ `AdminBottomNav` - 统一底部导航（5个 Tab）
- ✅ `SegmentedTabs` - 分段标签组件
- ✅ `KPIStatCard` - KPI 统计卡片
- ✅ `StatusBadge` - 状态标签组件
- ✅ `ListItemCard` - 列表项卡片组件
- ✅ `SearchBar` - 搜索栏组件
- ✅ `FilterChips` - 筛选标签组件
- ✅ `EmptyState` - 空状态组件
- ✅ `ErrorState` - 错误状态组件
- ✅ `Skeleton` - 骨架屏组件
- ✅ `ApprovalDiffPanel` - Before/After 对比面板
- ✅ `AdminButton` - 按钮组件

### Admin API 路由
- ✅ `GET /api/admin/overview` - Dashboard KPI
- ✅ `GET /api/admin/approvals` - 审批列表
- ✅ `GET /api/admin/approvals/[id]` - 审批详情
- ✅ `POST /api/admin/approvals/[id]/approve` - 审批通过
- ✅ `POST /api/admin/approvals/[id]/reject` - 审批拒绝

### 页面实现
- ✅ `/admin` - Dashboard 页面（基础结构）

## 🚧 进行中

### Admin API 路由（剩余）
- ⏳ `GET /api/admin/merchants` - 商家列表
- ⏳ `GET /api/admin/merchants/[id]` - 商家详情
- ⏳ `POST /api/admin/merchants/[id]/status` - 更新商家状态
- ⏳ `GET /api/admin/events` - 事件列表
- ⏳ `GET /api/admin/events/[id]` - 事件详情
- ⏳ `POST /api/admin/events/[id]/pricing` - Admin 价格覆盖
- ⏳ `GET /api/admin/orders` - 订单列表
- ⏳ `GET /api/admin/orders/[id]` - 订单详情
- ⏳ `GET /api/admin/customers` - 客户列表
- ⏳ `GET /api/admin/customers/[id]` - 客户详情
- ⏳ `POST /api/admin/invites/create` - 创建邀请码
- ⏳ `GET /api/admin/invites` - 邀请码列表
- ⏳ `POST /api/admin/invites/[code]/revoke` - 撤销邀请码
- ⏳ `POST /api/admin/exports/create` - 创建导出任务
- ⏳ `GET /api/admin/exports` - 导出任务列表
- ⏳ `GET /api/admin/settings` - 设置数据
- ⏳ `POST /api/admin/settings/regions` - 更新地区设置

### 页面实现（剩余）
- ⏳ `/admin/approvals` - Approval Center 列表（需要 SegmentedTabs 和 ListItemCard）
- ⏳ `/admin/approvals/[requestId]` - Approval Detail（需要 ApprovalDiffPanel）
- ⏳ `/admin/merchants` - Merchants 列表（需要 SearchBar 和 FilterChips）
- ⏳ `/admin/merchants/[merchantId]` - Merchant Detail
- ⏳ `/admin/events` - Events 列表
- ⏳ `/admin/events/[eventId]` - Event Detail
- ⏳ `/admin/orders` - Orders 列表
- ⏳ `/admin/orders/[orderId]` - Order Detail
- ⏳ `/admin/customers` - Customers 列表
- ⏳ `/admin/customers/[customerId]` - Customer Detail
- ⏳ `/admin/invites` - Invite Manager
- ⏳ `/admin/exports` - Export Center
- ⏳ `/admin/settings` - System Settings

## 📋 待验收项

### 功能验收
- ⏳ Admin 用户登录进入 `/admin` 正常显示 dashboard 数据
- ⏳ 非 Admin 用户访问 `/admin` -> `/admin/no-access`
- ⏳ Approvals 列表三 tab 可切换（Pending/Approved/Rejected）
- ⏳ 进入 Approval Detail 页面
- ⏳ Approve/Reject 可落库并更新状态
- ⏳ 写 audit_logs（审批操作）
- ⏳ Merchants 列表可搜索
- ⏳ Merchant 状态可切换（Active/Suspended）
- ⏳ 写 audit_logs（商家状态变更）
- ⏳ Events 可查看
- ⏳ Pricing admin override 可提交
- ⏳ 写 audit_logs（价格变更）
- ⏳ Orders/Customers 可查询与详情
- ⏳ Invite Manager 可生成一次性邀请码（region 必选）
- ⏳ Invite 可 revoke
- ⏳ Export Center 可创建导出
- ⏳ Export 列表显示状态（PROCESSING/READY/FAILED）
- ⏳ 所有页面底部导航完全统一
- ⏳ Console 无红错
- ⏳ API 错误有兜底 UI

### UI 验收
- ⏳ 所有页面布局与 `uiadmin` 设计 1:1
- ⏳ 所有页面使用统一的 AdminTopBar
- ⏳ 所有页面使用统一的 AdminBottomNav（5个 Tab）
- ⏳ 列表页有 loading skeleton
- ⏳ 列表页有 empty state
- ⏳ 列表页有 error state + retry
- ⏳ Approval Detail 有 Before/After 对比
- ⏳ Approve/Reject 有确认弹窗 + note 输入
- ⏳ Invite Manager 有 Region 选择（必填）
- ⏳ Export Center 有状态轮询/刷新

## 📝 验收步骤

### 1. 数据库迁移
```bash
npx supabase db push
```
或直接在 Supabase Dashboard SQL Editor 中执行：
- `supabase/migrations/007_admin_schema.sql`

### 2. 创建测试 Admin 用户
在 Supabase Dashboard SQL Editor 中执行：
```sql
-- 假设 user_id 是你的测试用户 UUID
INSERT INTO public.admin_users (user_id, is_active)
VALUES ('<your-user-id>', true)
ON CONFLICT (user_id) DO UPDATE SET is_active = true;
```

### 3. 启动应用
```bash
cd apps/internal-web
npm run dev
```

### 4. 访问 Admin 端口
- 访问 `http://localhost:3001/admin`
- 使用 Admin 用户登录
- 验证 Dashboard 数据加载正常

### 5. 测试核心功能
1. **Approvals**：
   - 访问 `/admin/approvals`
   - 切换 Pending/Approved/Rejected tabs
   - 进入一个 Pending approval
   - 点击 Approve/Reject
   - 填写 note 并提交
   - 验证状态更新
   - 验证 audit_logs 写入

2. **Merchants**：
   - 访问 `/admin/merchants`
   - 搜索商家
   - 切换商家状态
   - 验证 audit_logs 写入

3. **其他页面**：
   - 测试每个页面导航
   - 验证底部导航统一
   - 验证 loading/empty/error 状态

## 🔗 相关文档

- `ADMIN_PAGES_MANIFEST.md` - 页面清单和路由映射
- `ADMIN_PORT_IMPLEMENTATION_PLAN.md` - 实现计划和进度
- `supabase/migrations/007_admin_schema.sql` - 数据库迁移
- `uiadmin/` - UI 设计文档
