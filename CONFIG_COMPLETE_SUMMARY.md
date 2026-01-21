# 环境变量和 Admin 用户配置完成总结

## ✅ 已创建的文件

### 1. 环境变量模板文件（`.env.example`）

由于 `.env.local` 文件受 `.gitignore` 保护，已创建了模板文件：

1. ✅ `apps/customer-web/.env.example` - 顾客端环境变量模板
2. ✅ `apps/internal-web/.env.example` - 商家端环境变量模板
3. ✅ `apps/admin-web/.env.example` - 管理员端环境变量模板

### 2. 环境变量创建脚本

✅ `create-env-files.ps1` - PowerShell 脚本，自动创建所有 `.env.local` 文件

### 3. SQL 脚本文件

1. ✅ `setup-admin-user-simple.sql` - 简单的 Admin 用户设置脚本（推荐）⭐
2. ✅ `supabase/scripts/setup-admin-user.sql` - 详细的 Admin 用户设置脚本
3. ✅ `setup-admin-complete.sql` - 完整的 Admin 用户设置脚本
4. ✅ `supabase/scripts/create-admin-user.sql` - 原有的 Admin 用户创建脚本

### 4. 配置指南文档

✅ `SETUP_ENV_AND_ADMIN.md` - 完整的环境变量和 Admin 用户配置指南
✅ `ENV_CONFIG_COMPLETE.md` - 详细的环境变量配置说明

## 🚀 快速配置步骤

### 步骤 1: 创建环境变量文件

**方法 1: 使用 PowerShell 脚本（推荐）**
```powershell
powershell -ExecutionPolicy Bypass -File create-env-files.ps1
```

**方法 2: 手动复制模板文件**
```cmd
copy apps\customer-web\.env.example apps\customer-web\.env.local
copy apps\internal-web\.env.example apps\internal-web\.env.local
copy apps\admin-web\.env.example apps\admin-web\.env.local
```

### 步骤 2: 编辑环境变量文件

打开每个 `.env.local` 文件，填入你的 Supabase 配置：

1. 访问 [Supabase Dashboard](https://app.supabase.com)
2. 进入 **Settings** → **API**
3. 复制：
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

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

#### 推荐脚本: `setup-admin-user-simple.sql`

复制并运行以下 SQL：

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

或者直接打开并运行 `setup-admin-user-simple.sql` 文件。

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
# 终端 1 - Customer Web (端口 3000)
npx -y pnpm@latest dev:customer

# 终端 2 - Internal Web (端口 3001)
npx -y pnpm@latest dev:internal

# 终端 3 - Admin Web (端口 3002)
npx -y pnpm@latest dev:admin
```

### 步骤 8: 访问应用

- **Customer Web**: http://localhost:3000
- **Internal Web**: http://localhost:3001
- **Admin Web**: http://localhost:3002/login

### Admin Portal 登录

- **Email**: `admin123@admin.lux-night.com`
- **Password**: `a146129887`

## 📋 验证清单

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

## 📚 相关文件

### 环境变量文件

- `apps/customer-web/.env.local` (需要手动创建)
- `apps/internal-web/.env.local` (需要手动创建)
- `apps/admin-web/.env.local` (需要手动创建)
- `create-env-files.ps1` - 自动创建脚本

### SQL 脚本文件

- `setup-admin-user-simple.sql` ⭐ **推荐使用**
- `supabase/scripts/setup-admin-user.sql`
- `setup-admin-complete.sql`
- `supabase/scripts/create-admin-user.sql`

### 配置指南文档

- `SETUP_ENV_AND_ADMIN.md` - 完整配置指南
- `ENV_CONFIG_COMPLETE.md` - 详细环境变量说明
- `ADMIN_PORT_DEPLOYMENT_GUIDE.md` - Admin Portal 部署指南
- `ADMIN_PORT_QUICK_START.md` - Admin Portal 快速启动

## 🎯 总结

所有必要的配置文件和脚本已创建：

1. ✅ 环境变量模板文件（`.env.example`）
2. ✅ 环境变量创建脚本（`create-env-files.ps1`）
3. ✅ Admin 用户设置 SQL 脚本（`setup-admin-user-simple.sql`）
4. ✅ 完整的配置指南（`SETUP_ENV_AND_ADMIN.md`）

**下一步**：
1. 运行 `create-env-files.ps1` 创建环境变量文件
2. 编辑 `.env.local` 文件，填入 Supabase 配置
3. 在 Supabase Dashboard 中创建 Admin 用户
4. 运行 SQL 脚本设置 Admin 权限
5. 启动应用并验证
