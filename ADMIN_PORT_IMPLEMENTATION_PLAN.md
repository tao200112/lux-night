# Admin 端口实现计划与进度

## ✅ 已完成

### 1. 页面清单与路由映射
- ✅ 扫描 `uiadmin` 目录，列出所有页面
- ✅ 创建 `ADMIN_PAGES_MANIFEST.md` 文档
- ✅ 定义路由映射（5个主路由 + 详情路由 + 次要路由）

### 2. 数据库 Schema
- ✅ 创建 `supabase/migrations/007_admin_schema.sql`
- ✅ 扩展 `regions` 表（添加 `status` 字段）
- ✅ 扩展 `invites` 表（添加 `region_id`, `redeemed_by`, `redeemed_at`）
- ✅ 扩展 `requests` 表（添加 `payload_before`, `payload_after`）
- ✅ 创建 `audit_logs` 表
- ✅ 创建 `export_tasks` 表
- ✅ 创建 `log_audit()` 辅助函数

### 3. 基础架构
- ✅ 创建 `apps/internal-web/app/admin/layout.tsx`（包含权限检查）
- ✅ 创建 `apps/internal-web/app/admin/no-access/page.tsx`
- ✅ 更新 `apps/internal-web/tailwind.config.ts`（添加 Admin 颜色系统）

### 4. 共享组件库
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
- ✅ `AdminButton` - 按钮组件（Primary/Secondary/Danger）

### 5. Admin API 路由
- ✅ `GET /api/admin/overview` - Dashboard KPI 和趋势数据

## 🚧 进行中

### Admin API 路由（剩余）
- ⏳ `GET /api/admin/approvals` - 审批列表（支持 status 筛选）
- ⏳ `GET /api/admin/approvals/[id]` - 审批详情
- ⏳ `POST /api/admin/approvals/[id]/approve` - 审批通过
- ⏳ `POST /api/admin/approvals/[id]/reject` - 审批拒绝
- ⏳ `GET /api/admin/merchants` - 商家列表（搜索、筛选）
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
- ⏳ `GET /api/admin/settings` - 设置数据（regions, admin users）
- ⏳ `POST /api/admin/settings/regions` - 更新地区设置

### 页面实现（剩余）
- ⏳ `/admin` - Dashboard 页面
- ⏳ `/admin/approvals` - Approval Center 列表
- ⏳ `/admin/approvals/[requestId]` - Approval Detail 对比页面
- ⏳ `/admin/merchants` - Merchants 列表
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

## 📋 下一步行动

### 优先级 1：核心功能（必须完成）
1. **完成 Admin API 路由**：
   - Approvals API（列表、详情、审批操作）
   - Merchants API（列表、详情、状态更新）
   - Orders API（列表、详情）
   - Invites API（创建、列表、撤销）

2. **实现核心页面**：
   - Dashboard 页面
   - Approvals 页面（列表 + 详情）
   - Merchants 页面（列表 + 详情）

### 优先级 2：次要功能
3. **完成剩余 API**：
   - Events API
   - Customers API
   - Exports API
   - Settings API

4. **实现剩余页面**：
   - Events 页面
   - Orders 页面
   - Customers 页面
   - Invites 页面
   - Exports 页面
   - Settings 页面

### 优先级 3：优化和收尾
5. **统一底部导航**：确保所有页面使用统一的 `AdminBottomNav`
6. **测试和修复**：确保所有功能正常工作
7. **验收 Checklist**：完成最终验收

## 📝 实现说明

### 数据库迁移
运行以下命令应用数据库迁移：
```bash
npx supabase db push
```

或者直接在 Supabase Dashboard SQL Editor 中执行：
- `supabase/migrations/007_admin_schema.sql`

### API 路由统一响应格式
所有 Admin API 路由返回统一格式：
```typescript
{
  success: boolean;
  data?: any;
  code?: string;
  message?: string;
}
```

### 错误代码
- `UNAUTHENTICATED` - 未登录
- `FORBIDDEN` - 无权限（非 admin）
- `NOT_FOUND` - 资源不存在
- `VALIDATION_ERROR` - 验证错误
- `INTERNAL_ERROR` - 内部错误

### Audit Logs
所有 admin 写操作必须：
1. 调用 `log_audit()` RPC 函数
2. 记录 `before_state` 和 `after_state`
3. 记录操作类型、实体类型、实体 ID
4. 记录 metadata（如 note, reason 等）

## 🔗 相关文档

- `ADMIN_PAGES_MANIFEST.md` - 页面清单和路由映射
- `supabase/migrations/007_admin_schema.sql` - 数据库迁移
- `uiadmin/` - UI 设计文档（code.html + screen.png）
