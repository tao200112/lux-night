# Admin Portal 部署指南

## ✅ 已完成的工作

Admin Portal 的所有页面和 API 路由已经完成：

### 数据库迁移
- ✅ `007_admin_schema.sql` - Admin Portal 数据库扩展
- ✅ `008_admin_helper_functions.sql` - 辅助函数（generate_invite_token）

### Admin 页面（14个页面）
1. ✅ Dashboard (`/admin`)
2. ✅ Approvals (`/admin/approvals`)
3. ✅ Approval Detail (`/admin/approvals/[requestId]`)
4. ✅ Merchants (`/admin/merchants`)
5. ✅ Merchant Detail (`/admin/merchants/[merchantId]`)
6. ✅ Events (`/admin/events`)
7. ✅ Event Detail (`/admin/events/[eventId]`)
8. ✅ Orders (`/admin/orders`)
9. ✅ Order Detail (`/admin/orders/[orderId]`)
10. ✅ Customers (`/admin/customers`)
11. ✅ Customer Detail (`/admin/customers/[customerId]`)
12. ✅ Invite Manager (`/admin/invites`)
13. ✅ Export Center (`/admin/exports`)
14. ✅ Settings (`/admin/settings`)

### Admin API 路由（20+ 路由）
所有 API 路由都已实现并返回统一格式 `{success, data, code, message}`

### 共享组件
- ✅ `AdminBottomNav` - 统一底部导航（5个Tab）
- ✅ `AdminTopBar` - 统一顶部导航栏
- ✅ `ApprovalDiffPanel` - Before/After 对比面板
- ✅ 其他 UI 组件（KPIStatCard, ListItemCard, StatusBadge, etc.）

## 🚀 部署步骤

### 1. 推送数据库迁移

```cmd
cd supabase
npx supabase db push
```

确保以下迁移已推送：
- `007_admin_schema.sql`
- `008_admin_helper_functions.sql`

### 2. 确保用户有 Admin 权限

在 Supabase Dashboard SQL Editor 中运行：

```sql
-- 将用户设置为 Admin（替换 <USER_ID> 为实际用户 ID）
UPDATE public.profiles
SET is_admin = true
WHERE id = '<USER_ID>';
```

### 3. 构建 Internal Web 应用

```cmd
pnpm build:internal
```

或使用 npx：

```cmd
npx -y pnpm@latest build:internal
```

### 4. 启动开发服务器

```cmd
pnpm dev:internal
```

或使用 npx：

```cmd
npx -y pnpm@latest dev:internal
```

### 5. 访问 Admin Portal

打开浏览器访问：http://localhost:3001/admin

**注意**：
- 只有 `profiles.is_admin = true` 的用户可以访问 `/admin`
- 非 admin 用户会被重定向到 `/admin/no-access`

## 📋 功能清单

### Dashboard
- ✅ KPI 统计（总活动、总订单、总收入、活跃商家）
- ✅ 趋势图表
- ✅ Top 商家列表

### Approvals
- ✅ 审批请求列表（Pending/Approved/Rejected）
- ✅ 审批详情（Before/After 对比）
- ✅ 批准/拒绝操作（带备注和 audit log）

### Merchants
- ✅ 商家列表（搜索、筛选）
- ✅ 商家详情
- ✅ 商家状态管理（Active/Suspended/Closed）

### Events
- ✅ 活动列表（搜索、筛选）
- ✅ 活动详情（票务统计、订单统计）
- ✅ 管理员定价覆盖（带 audit log）

### Orders
- ✅ 订单列表（搜索、筛选）
- ✅ 订单详情（客户信息、活动信息、票务详情）

### Customers
- ✅ 客户列表（搜索、筛选）
- ✅ 客户详情（订单历史、票务历史、统计）

### Invite Manager
- ✅ 创建 Admin-to-Merchant 邀请码（带区域）
- ✅ 邀请码列表（状态、使用情况）
- ✅ 撤销邀请码

### Export Center
- ✅ 创建导出任务（Orders/Merchants/Events/Customers/Revenue）
- ✅ 导出任务列表（Processing/Ready/Failed）
- ✅ 下载导出文件

### Settings
- ✅ 区域配置（状态管理）
- ✅ Admin 用户列表
- ✅ 安全设置（2FA、API 写访问 - UI only，标记为 "Coming Soon"）

## 🔐 权限说明

### Admin Portal 访问权限
- **路径**：`/admin/*`
- **要求**：`profiles.is_admin = true`
- **检查位置**：`apps/internal-web/app/admin/layout.tsx`
- **未授权重定向**：`/admin/no-access`

### API 路由权限
所有 `/api/admin/*` 路由都包含：
1. 认证检查（`supabase.auth.getUser()`）
2. Admin 权限检查（`supabase.rpc('is_admin')`）
3. 错误返回：`{success: false, code: 'UNAUTHENTICATED'/'FORBIDDEN'}`

### 审计日志
所有管理员写操作都会记录到 `audit_logs` 表：
- Approve/Reject 审批请求
- 更新商家状态
- 覆盖活动定价
- 创建/撤销邀请码
- 创建导出任务
- 更新区域状态

## 🐛 故障排除

### 构建失败：编码错误
如果遇到文件编码错误（如 `Unexpected character '⨯'`）：
1. 删除损坏的文件
2. 重新创建文件
3. 确保文件编码为 UTF-8

### 访问被拒绝
如果无法访问 `/admin`：
1. 检查用户是否已登录
2. 检查 `profiles.is_admin` 是否为 `true`
3. 检查 `is_admin()` RPC 函数是否正常工作

### API 返回 403
如果 API 返回 403 Forbidden：
1. 检查用户是否已登录
2. 检查用户是否有 admin 权限
3. 检查 RPC 函数 `is_admin()` 是否返回 `true`

## 📝 注意事项

1. **数据库迁移**：确保所有迁移都已推送
2. **用户权限**：确保至少有一个用户设置为 admin
3. **环境变量**：确保 `.env.local` 配置正确（Supabase URL 和 Keys）
4. **开发模式**：建议先使用开发模式测试，确认无误后再构建生产版本

## 🔗 相关文件

- 数据库迁移：`supabase/migrations/007_admin_schema.sql`, `008_admin_helper_functions.sql`
- Admin Layout：`apps/internal-web/app/admin/layout.tsx`
- Admin 页面：`apps/internal-web/app/admin/*/page.tsx`
- Admin API：`apps/internal-web/app/api/admin/*/route.ts`
- 共享组件：`apps/internal-web/components/admin/*.tsx`
