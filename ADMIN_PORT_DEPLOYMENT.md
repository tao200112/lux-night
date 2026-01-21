# Admin Portal 独立端口部署指南

## 📋 概述

Admin Portal 现在是一个独立的应用，运行在端口 **3002**，使用邮箱密码登录，区别于顾客端口（3000）和商家端口（3001）。

## 🚀 快速开始

### 1. 创建 Admin 用户

在 Supabase Dashboard 中创建 Admin 用户：

1. 打开 Supabase Dashboard → Authentication → Users
2. 点击 "Add User" → "Create New User"
3. 填写信息：
   - **Email**: `admin123@admin.lux-night.com`
   - **Password**: `a146129887`
   - **Confirm Password**: `a146129887`
4. 点击 "Create User"

### 2. 设置 Admin 权限

在 Supabase Dashboard → SQL Editor 中运行：

```sql
-- 查找用户 ID
SELECT id, email FROM auth.users WHERE email = 'admin123@admin.lux-night.com';

-- 设置 is_admin = true（替换 <USER_ID> 为实际的用户 ID）
UPDATE public.profiles
SET is_admin = true
WHERE id = '<USER_ID>';

-- 或使用提供的脚本（推荐）
-- 在 Supabase Dashboard → SQL Editor 中运行：
-- supabase/scripts/create-admin-user.sql
```

或运行提供的迁移脚本：

```bash
# 在 Supabase Dashboard → SQL Editor 中运行
# supabase/scripts/create-admin-user.sql
```

### 3. 配置环境变量

创建 `apps/admin-web/.env.local`：

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3002
```

### 4. 安装依赖

```cmd
npx -y pnpm@latest install
```

### 5. 启动 Admin Portal

```cmd
npx -y pnpm@latest dev:admin
```

### 6. 访问 Admin Portal

打开浏览器访问：**http://localhost:3002**

使用以下凭据登录：
- **Email**: `admin123@admin.lux-night.com`
- **Password**: `a146129887`

## 📍 端口分配

- **Customer Web**: `http://localhost:3000` (顾客端口)
- **Internal Web**: `http://localhost:3001` (商家端口)
- **Admin Web**: `http://localhost:3002` (管理员端口) ✨ **新增**

## 🔐 认证方式

### Admin Portal（端口 3002）
- **认证方式**: 邮箱密码登录（Email/Password）
- **默认账号**: `admin123@admin.lux-night.com`
- **默认密码**: `a146129887`

### Customer Web（端口 3000）
- **认证方式**: Google/Apple OAuth

### Internal Web（端口 3001）
- **认证方式**: Google OAuth

## 🎯 Admin Portal 功能

### 已实现的页面（14个页面）

1. ✅ **Dashboard** (`/dashboard`) - 仪表盘概览
2. ✅ **Approvals** (`/approvals`) - 审批中心列表
3. ✅ **Approval Detail** (`/approvals/[requestId]`) - 审批详情（Before/After 对比）
4. ✅ **Merchants** (`/merchants`) - 商家管理列表
5. ✅ **Merchant Detail** (`/merchants/[merchantId]`) - 商家详情
6. ✅ **Events** (`/events`) - 活动管理列表
7. ✅ **Event Detail** (`/events/[eventId]`) - 活动详情（可覆盖定价）
8. ✅ **Orders** (`/orders`) - 订单与支付记录
9. ✅ **Order Detail** (`/orders/[orderId]`) - 订单详情
10. ✅ **Customers** (`/customers`) - 客户目录
11. ✅ **Customer Detail** (`/customers/[customerId]`) - 客户详情
12. ✅ **Invite Manager** (`/invites`) - 邀请码管理
13. ✅ **Export Center** (`/exports`) - 数据导出中心
14. ✅ **Settings** (`/settings`) - 系统设置

### 已实现的 API 路由（20+ 路由）

所有 API 路由都已实现并返回统一格式 `{success, data, code, message}`

## 📝 数据库迁移

确保以下迁移已推送：

```bash
cd supabase
npx supabase db push
```

迁移文件：
- `007_admin_schema.sql` - Admin Portal 数据库扩展
- `008_admin_helper_functions.sql` - 辅助函数（generate_invite_token）
- `009_create_admin_user.sql` - 创建 Admin 用户（可选，推荐手动创建）

## 🔧 开发命令

### 启动 Admin Portal
```cmd
npx -y pnpm@latest dev:admin
```

### 构建 Admin Portal
```cmd
npx -y pnpm@latest build:admin
```

### 启动生产服务器
```cmd
cd apps\admin-web
npx -y pnpm@latest start
```

### 同时启动所有应用（需要 3 个终端）

**终端 1 - Customer Web:**
```cmd
npx -y pnpm@latest dev:customer
```

**终端 2 - Internal Web:**
```cmd
npx -y pnpm@latest dev:internal
```

**终端 3 - Admin Web:**
```cmd
npx -y pnpm@latest dev:admin
```

## 🔐 Cookie 隔离

Admin Portal 使用独立的 cookie 前缀 `sb-admin-`，确保与其他应用的 session 隔离：

- **Customer Web**: `sb-customer-*`
- **Internal Web**: `sb-internal-*`
- **Admin Web**: `sb-admin-*` ✨ **新增**

## ⚠️ 注意事项

1. **用户创建**: Admin 用户必须在 Supabase Dashboard 中手动创建（邮箱密码登录）
2. **权限设置**: 创建用户后，运行 `supabase/scripts/create-admin-user.sql` 设置 `is_admin = true`
3. **端口冲突**: 确保端口 3002 未被占用
4. **环境变量**: 每次修改 `.env.local` 后需要重启开发服务器
5. **数据库迁移**: 确保所有迁移已推送（特别是 `007_admin_schema.sql`）

## 🐛 故障排除

### 登录失败
1. 检查用户是否在 Supabase Dashboard 中创建
2. 检查 `profiles.is_admin` 是否为 `true`
3. 检查邮箱和密码是否正确
4. 检查环境变量是否正确配置

### 无法访问 `/dashboard`
1. 检查用户是否已登录
2. 检查用户是否有 admin 权限（`is_admin = true`）
3. 检查 `is_admin()` RPC 函数是否正常工作

### 端口冲突
如果端口 3002 被占用：
1. 查找占用端口的进程：`netstat -ano | findstr :3002`
2. 停止进程：`taskkill /PID <PID> /F`
3. 或修改 `apps/admin-web/package.json` 中的端口号

## 📚 相关文件

- **配置文件**: `apps/admin-web/package.json`, `apps/admin-web/next.config.js`
- **登录页面**: `apps/admin-web/app/login/page.tsx`
- **Admin 布局**: `apps/admin-web/app/(admin)/layout.tsx`
- **数据库迁移**: `supabase/migrations/007_admin_schema.sql`, `008_admin_helper_functions.sql`, `009_create_admin_user.sql`
- **用户创建脚本**: `supabase/scripts/create-admin-user.sql`

## ✅ 验证清单

- [ ] Admin 用户已在 Supabase Dashboard 中创建
- [ ] `profiles.is_admin = true` 已设置
- [ ] 环境变量已配置（`.env.local`）
- [ ] 依赖已安装（`pnpm install`）
- [ ] Admin Portal 可以启动（`pnpm dev:admin`）
- [ ] 可以访问登录页面（http://localhost:3002/login）
- [ ] 可以使用 `admin123@admin.lux-night.com` / `a146129887` 登录
- [ ] 登录后可以访问 Dashboard（http://localhost:3002/dashboard）
