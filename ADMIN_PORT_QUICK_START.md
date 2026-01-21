# Admin Portal 快速启动指南

## 🚀 快速启动（3步）

### 1. 创建 Admin 用户（Supabase Dashboard）

在 **Supabase Dashboard** → **Authentication** → **Users** 中：

1. 点击 **"Add User"** → **"Create New User"**
2. 填写：
   - **Email**: `admin123@admin.lux-night.com`
   - **Password**: `a146129887`
   - **Confirm Password**: `a146129887`
3. 点击 **"Create User"**

### 2. 设置 Admin 权限（Supabase Dashboard SQL Editor）

运行以下 SQL：

```sql
UPDATE public.profiles
SET is_admin = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin123@admin.lux-night.com');
```

或直接运行脚本 `supabase/scripts/create-admin-user.sql`

### 3. 启动 Admin Portal

```cmd
npx -y pnpm@latest dev:admin
```

访问：**http://localhost:3002/login**

登录凭据：
- **Email**: `admin123@admin.lux-night.com`
- **Password**: `a146129887`

## 📍 端口分配

- **Customer Web**: `http://localhost:3000` (顾客端口)
- **Internal Web**: `http://localhost:3001` (商家端口)
- **Admin Web**: `http://localhost:3002` (管理员端口) ✨ **新增**

## 🔐 认证方式

- **Admin Portal**: 邮箱密码登录（Email/Password）
- **Customer Web**: Google/Apple OAuth
- **Internal Web**: Google OAuth

## ✅ 验证清单

- [ ] Admin 用户已创建（`admin123@admin.lux-night.com`）
- [ ] `profiles.is_admin = true` 已设置
- [ ] `.env.local` 已配置（Supabase URL 和 Key）
- [ ] 依赖已安装（`pnpm install`）
- [ ] Admin Portal 已启动（`pnpm dev:admin`）
- [ ] 可以登录（http://localhost:3002/login）
- [ ] 登录后可以访问 Dashboard（http://localhost:3002/dashboard）
