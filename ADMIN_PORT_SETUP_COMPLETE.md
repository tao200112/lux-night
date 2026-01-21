# Admin Portal 独立端口设置完成

## ✅ 已完成的工作

### 1. 创建独立 Admin Portal 应用

- ✅ 创建了 `apps/admin-web` 应用（独立端口 **3002**）
- ✅ 配置了 `package.json`, `tsconfig.json`, `next.config.js`
- ✅ 配置了 Tailwind CSS 和 PostCSS
- ✅ 配置了 Supabase 客户端（使用 `admin` appType，cookie 前缀 `sb-admin-`）

### 2. 实现邮箱密码登录

- ✅ 创建了登录页面（`apps/admin-web/app/login/page.tsx`）
- ✅ 实现了 `signInWithEmailPassword` 函数（`apps/admin-web/lib/auth/client.ts`）
- ✅ 创建了登出页面和 API（`apps/admin-web/app/logout/page.tsx`, `apps/admin-web/app/api/auth/logout/route.ts`）

### 3. 迁移 Admin 页面和组件

- ✅ 从 `internal-web` 迁移了所有 admin 页面（14个页面）
- ✅ 从 `internal-web` 迁移了所有 admin 组件（13个组件）
- ✅ 从 `internal-web` 迁移了所有 admin API 路由（20+ 路由）

### 4. 创建 Admin 用户脚本

- ✅ 创建了 `supabase/migrations/009_create_admin_user.sql` 迁移文件
- ✅ 创建了 `supabase/scripts/create-admin-user.sql` 快速设置脚本

### 5. 更新构建脚本

- ✅ 在 `package.json` 中添加了 `dev:admin` 和 `build:admin` 脚本

## 📋 下一步操作

### 1. 创建 Admin 用户（必需）

在 **Supabase Dashboard** 中手动创建用户：

1. 打开 Supabase Dashboard → **Authentication** → **Users**
2. 点击 **"Add User"** → **"Create New User"**
3. 填写信息：
   - **Email**: `admin123@admin.lux-night.com`
   - **Password**: `a146129887`
   - **Confirm Password**: `a146129887`
4. 点击 **"Create User"**

### 2. 设置 Admin 权限（必需）

在 **Supabase Dashboard** → **SQL Editor** 中运行：

```sql
-- 查找用户 ID
SELECT id, email FROM auth.users WHERE email = 'admin123@admin.lux-night.com';

-- 设置 is_admin = true（替换 <USER_ID> 为实际的用户 ID）
UPDATE public.profiles
SET is_admin = true
WHERE id = '<USER_ID>';
```

或直接运行提供的脚本：

```sql
-- 在 Supabase Dashboard → SQL Editor 中运行
-- 复制并运行 supabase/scripts/create-admin-user.sql 的内容
```

### 3. 配置环境变量（必需）

创建 `apps/admin-web/.env.local`：

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3002
```

### 4. 安装依赖

```cmd
cd apps\admin-web
npx -y pnpm@latest install
```

### 5. 启动 Admin Portal

```cmd
npx -y pnpm@latest dev:admin
```

或使用 npx：

```cmd
npx -y pnpm@latest dev:admin
```

### 6. 访问 Admin Portal

打开浏览器访问：**http://localhost:3002/login**

使用以下凭据登录：
- **Email**: `admin123@admin.lux-night.com`
- **Password**: `a146129887`

## 📍 端口分配

- **Customer Web**: `http://localhost:3000` (顾客端口 - Google/Apple OAuth)
- **Internal Web**: `http://localhost:3001` (商家端口 - Google OAuth)
- **Admin Web**: `http://localhost:3002` (管理员端口 - 邮箱密码登录) ✨ **新增**

## 🔐 认证方式

### Admin Portal（端口 3002）
- **认证方式**: 邮箱密码登录（Email/Password）
- **默认账号**: `admin123@admin.lux-night.com`
- **默认密码**: `a146129887`
- **Cookie 前缀**: `sb-admin-`（与其他应用隔离）

### Customer Web（端口 3000）
- **认证方式**: Google/Apple OAuth
- **Cookie 前缀**: `sb-customer-`

### Internal Web（端口 3001）
- **认证方式**: Google OAuth
- **Cookie 前缀**: `sb-internal-`

## 🎯 Admin Portal 路由

所有 Admin Portal 页面现在在根路径下（不在 `/admin` 下）：

- `/login` - 登录页面
- `/logout` - 登出页面
- `/dashboard` - 仪表盘（原 `/admin`）
- `/approvals` - 审批中心（原 `/admin/approvals`）
- `/approvals/[requestId]` - 审批详情（原 `/admin/approvals/[requestId]`）
- `/merchants` - 商家管理（原 `/admin/merchants`）
- `/merchants/[merchantId]` - 商家详情（原 `/admin/merchants/[merchantId]`）
- `/events` - 活动管理（原 `/admin/events`）
- `/events/[eventId]` - 活动详情（原 `/admin/events/[eventId]`）
- `/orders` - 订单管理（原 `/admin/orders`）
- `/orders/[orderId]` - 订单详情（原 `/admin/orders/[orderId]`）
- `/customers` - 客户管理（原 `/admin/customers`）
- `/customers/[customerId]` - 客户详情（原 `/admin/customers/[customerId]`）
- `/invites` - 邀请码管理（原 `/admin/invites`）
- `/exports` - 数据导出（原 `/admin/exports`）
- `/settings` - 系统设置（原 `/admin/settings`）
- `/no-access` - 无权限页面

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

## ⚠️ 注意事项

1. **用户创建**: Admin 用户必须在 Supabase Dashboard 中手动创建（邮箱密码登录）
2. **权限设置**: 创建用户后，运行 `supabase/scripts/create-admin-user.sql` 设置 `is_admin = true`
3. **端口冲突**: 确保端口 3002 未被占用
4. **环境变量**: 每次修改 `.env.local` 后需要重启开发服务器
5. **数据库迁移**: 确保所有迁移已推送（特别是 `007_admin_schema.sql`, `008_admin_helper_functions.sql`）

## 🐛 故障排除

### 登录失败
1. 检查用户是否在 Supabase Dashboard 中创建
2. 检查 `profiles.is_admin` 是否为 `true`
3. 检查邮箱和密码是否正确（`admin123@admin.lux-night.com` / `a146129887`）
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

## ✅ 验证清单

- [ ] Admin 用户已在 Supabase Dashboard 中创建
- [ ] `profiles.is_admin = true` 已设置
- [ ] 环境变量已配置（`.env.local`）
- [ ] 依赖已安装（`pnpm install`）
- [ ] Admin Portal 可以启动（`pnpm dev:admin`）
- [ ] 可以访问登录页面（http://localhost:3002/login）
- [ ] 可以使用 `admin123@admin.lux-night.com` / `a146129887` 登录
- [ ] 登录后可以访问 Dashboard（http://localhost:3002/dashboard）
