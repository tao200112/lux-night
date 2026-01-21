# 环境变量和 Admin 用户配置指南

## 📋 快速开始

### 步骤 1: 复制环境变量模板文件

```cmd
# Customer Web
copy apps\customer-web\.env.example apps\customer-web\.env.local

# Internal Web
copy apps\internal-web\.env.example apps\internal-web\.env.local

# Admin Web
copy apps\admin-web\.env.example apps\admin-web\.env.local
```

### 步骤 2: 编辑环境变量文件

打开每个 `.env.local` 文件，填入你的 Supabase 配置：

#### 获取 Supabase 配置

1. 访问 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **Settings** → **API**
4. 复制以下值：
   - **Project URL** → 用于 `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → 用于 `NEXT_PUBLIC_SUPABASE_ANON_KEY`

#### 配置示例

**apps/customer-web/.env.local**:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**apps/internal-web/.env.local**:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3001
NEXT_PUBLIC_SITE_URL=http://localhost:3001
```

**apps/admin-web/.env.local**:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3002
NEXT_PUBLIC_SITE_URL=http://localhost:3002
```

### 步骤 3: 配置 Supabase Redirect URLs

在 **Supabase Dashboard** → **Authentication** → **URL Configuration** 添加：

**Additional Redirect URLs:**
```
http://localhost:3000/auth/callback
http://localhost:3001/auth/callback
http://localhost:3002/auth/callback
```

### 步骤 4: 创建 Admin 用户

#### 方法 1: 通过 Supabase Dashboard（推荐）

1. 打开 Supabase Dashboard → **Authentication** → **Users**
2. 点击 **"Add User"** → **"Create New User"**
3. 填写信息：
   - **Email**: `admin123@admin.lux-night.com`
   - **Password**: `a146129887`
   - **Confirm Password**: `a146129887`
4. 点击 **"Create User"**

### 步骤 5: 设置 Admin 权限

在 **Supabase Dashboard** → **SQL Editor** 中运行以下 SQL：

```sql
-- 设置 Admin 用户权限
DO $$
DECLARE
  v_admin_email TEXT := 'admin123@admin.lux-night.com';
  v_user_id UUID;
BEGIN
  -- 查找用户
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_admin_email
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE '⚠️  Admin 用户不存在！';
    RAISE NOTICE '请先创建用户：admin123@admin.lux-night.com';
    RETURN;
  END IF;
  
  -- 设置 profiles.is_admin = true
  INSERT INTO public.profiles (id, display_name, email, is_admin)
  VALUES (v_user_id, 'Admin', v_admin_email, true)
  ON CONFLICT (id) DO UPDATE
  SET
    is_admin = true,
    display_name = COALESCE(profiles.display_name, 'Admin'),
    email = COALESCE(profiles.email, v_admin_email),
    updated_at = NOW();
  
  -- 添加到 admin_users 表（如果存在）
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN
    INSERT INTO public.admin_users (user_id, is_active)
    VALUES (v_user_id, true)
    ON CONFLICT (user_id) DO UPDATE
    SET is_active = true,
        updated_at = NOW();
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Admin 用户设置完成！';
  RAISE NOTICE '   Email: %', v_admin_email;
  RAISE NOTICE '   User ID: %', v_user_id;
  RAISE NOTICE '   is_admin: true';
END $$;

-- 验证设置
SELECT 
  u.id as user_id,
  u.email,
  p.display_name,
  p.is_admin,
  CASE 
    WHEN EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = u.id) 
    THEN 'Yes' 
    ELSE 'No' 
  END as in_admin_users_table
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'admin123@admin.lux-night.com';
```

或者运行提供的 SQL 脚本文件：

1. 在 Supabase Dashboard → SQL Editor 中
2. 打开文件 `setup-admin-user-simple.sql` 或 `supabase/scripts/setup-admin-user.sql`
3. 复制内容并运行

### 步骤 6: 验证设置

运行以下 SQL 验证设置：

```sql
SELECT 
  u.id as user_id,
  u.email,
  p.display_name,
  p.is_admin
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'admin123@admin.lux-night.com';
```

应该返回：
- `user_id`: 用户的 UUID
- `email`: `admin123@admin.lux-night.com`
- `display_name`: `Admin`
- `is_admin`: `true`

### 步骤 7: 启动应用

```cmd
# 终端 1 - Customer Web
npx -y pnpm@latest dev:customer

# 终端 2 - Internal Web
npx -y pnpm@latest dev:internal

# 终端 3 - Admin Web
npx -y pnpm@latest dev:admin
```

### 步骤 8: 访问应用

- **Customer Web**: http://localhost:3000
- **Internal Web**: http://localhost:3001
- **Admin Web**: http://localhost:3002/login

### Admin Portal 登录

- **Email**: `admin123@admin.lux-night.com`
- **Password**: `a146129887`

## 📁 文件清单

### 环境变量模板文件

1. ✅ `apps/customer-web/.env.example` - 顾客端环境变量模板
2. ✅ `apps/internal-web/.env.example` - 商家端环境变量模板
3. ✅ `apps/admin-web/.env.example` - 管理员端环境变量模板

### SQL 脚本文件

1. ✅ `setup-admin-user-simple.sql` - 简单的 Admin 用户设置脚本（推荐）
2. ✅ `supabase/scripts/setup-admin-user.sql` - 详细的 Admin 用户设置脚本
3. ✅ `setup-admin-complete.sql` - 完整的 Admin 用户设置脚本
4. ✅ `supabase/scripts/create-admin-user.sql` - 原有的 Admin 用户创建脚本

## ✅ 验证清单

### 环境变量配置

- [ ] `apps/customer-web/.env.local` 已创建并配置
- [ ] `apps/internal-web/.env.local` 已创建并配置
- [ ] `apps/admin-web/.env.local` 已创建并配置
- [ ] 所有 `NEXT_PUBLIC_SUPABASE_URL` 已填写
- [ ] 所有 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 已填写
- [ ] 所有 `NEXT_PUBLIC_APP_ORIGIN` 已填写

### Supabase 配置

- [ ] Redirect URLs 已添加（3000, 3001, 3002）
- [ ] Admin 用户已创建
- [ ] `profiles.is_admin = true` 已设置
- [ ] `admin_users` 表已更新（如果存在）

### 功能验证

- [ ] Customer Web 可以访问 (http://localhost:3000)
- [ ] Internal Web 可以访问 (http://localhost:3001)
- [ ] Admin Web 可以访问 (http://localhost:3002/login)
- [ ] Admin Portal 可以登录
- [ ] Admin Portal 登录后可以访问 Dashboard

## 📝 详细说明

### Admin 用户配置 SQL 脚本

**推荐脚本**: `setup-admin-user-simple.sql`

这个脚本会：
1. 检查用户是否存在
2. 设置 `profiles.is_admin = true`
3. 添加到 `admin_users` 表（如果存在）
4. 显示验证结果

**使用方法**：
1. 在 Supabase Dashboard → SQL Editor 中
2. 复制 `setup-admin-user-simple.sql` 的内容
3. 粘贴并运行

### 环境变量文件位置

所有环境变量文件都应该在各自的应用目录下：

- `apps/customer-web/.env.local`
- `apps/internal-web/.env.local`
- `apps/admin-web/.env.local`

**注意**: `.env.local` 文件不会被提交到 Git（已在 `.gitignore` 中），这是正常的安全措施。

## 🐛 故障排除

### 环境变量未生效

1. 确保文件名为 `.env.local`（不是 `.env.example`）
2. 确保文件在正确的位置（应用根目录下）
3. 重启开发服务器

### Admin 用户登录失败

1. 检查用户是否在 Supabase Dashboard 中创建
2. 检查 `profiles.is_admin` 是否为 `true`
3. 检查邮箱和密码是否正确
4. 检查环境变量是否正确配置

### SQL 脚本运行失败

1. 确保先创建了用户（在 Dashboard 中）
2. 检查用户邮箱是否正确：`admin123@admin.lux-night.com`
3. 检查 `profiles` 表是否存在
4. 检查 `is_admin` 列是否存在

## 📚 相关文档

- `ENV_CONFIG_COMPLETE.md` - 完整的环境变量配置指南
- `ADMIN_PORT_DEPLOYMENT_GUIDE.md` - Admin Portal 部署指南
- `ADMIN_PORT_QUICK_START.md` - Admin Portal 快速启动指南
