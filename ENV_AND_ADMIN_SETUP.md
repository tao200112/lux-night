# 环境变量和 Admin 用户配置完成 ✅

## ✅ 已完成

### 环境变量文件

已创建以下环境变量文件：

1. ✅ `apps/customer-web/.env.local`
2. ✅ `apps/internal-web/.env.local`
3. ✅ `apps/admin-web/.env.local`

**⚠️ 重要**: 请编辑这些文件，将 `your-project.supabase.co` 和 `your-anon-key` 替换为实际的 Supabase 配置。

### SQL 脚本

已创建以下 SQL 脚本：

1. ✅ `setup-admin-user-simple.sql` ⭐ **推荐使用**
2. ✅ `supabase/scripts/setup-admin-user.sql`
3. ✅ `setup-admin-complete.sql`

## 📋 配置步骤

### 1. 编辑环境变量文件

打开每个 `.env.local` 文件，填入你的 Supabase 配置：

**获取 Supabase 配置**：
1. 访问 [Supabase Dashboard](https://app.supabase.com)
2. 进入 **Settings** → **API**
3. 复制：
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**示例**：
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. 配置 Supabase Redirect URLs

在 **Supabase Dashboard** → **Authentication** → **URL Configuration** 添加：

```
http://localhost:3000/auth/callback
http://localhost:3001/auth/callback
http://localhost:3002/auth/callback
```

### 3. 创建 Admin 用户

在 **Supabase Dashboard** → **Authentication** → **Users**：

1. 点击 **"Add User"** → **"Create New User"**
2. 填写：
   - **Email**: `admin123@admin.lux-night.com`
   - **Password**: `a146129887`
   - **Confirm Password**: `a146129887`
3. 点击 **"Create User"**

### 4. 设置 Admin 权限

在 **Supabase Dashboard** → **SQL Editor** 中运行 `setup-admin-user-simple.sql` 的内容：

```sql
-- 设置 Admin 用户权限
DO $$
DECLARE
  v_admin_email TEXT := 'admin123@admin.lux-night.com';
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_admin_email
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE '⚠️  请先创建用户：admin123@admin.lux-night.com';
    RETURN;
  END IF;
  
  INSERT INTO public.profiles (id, display_name, email, is_admin)
  VALUES (v_user_id, 'Admin', v_admin_email, true)
  ON CONFLICT (id) DO UPDATE
  SET
    is_admin = true,
    display_name = COALESCE(profiles.display_name, 'Admin'),
    email = COALESCE(profiles.email, v_admin_email),
    updated_at = NOW();
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN
    INSERT INTO public.admin_users (user_id, is_active)
    VALUES (v_user_id, true)
    ON CONFLICT (user_id) DO UPDATE
    SET is_active = true, updated_at = NOW();
  END IF;
  
  RAISE NOTICE '✅ Admin 用户设置完成！';
END $$;
```

## 🚀 启动应用

```cmd
# Customer Web (端口 3000)
npx -y pnpm@latest dev:customer

# Internal Web (端口 3001)
npx -y pnpm@latest dev:internal

# Admin Web (端口 3002)
npx -y pnpm@latest dev:admin
```

## 🔐 Admin Portal 登录

- **URL**: http://localhost:3002/login
- **Email**: `admin123@admin.lux-night.com`
- **Password**: `a146129887`

## 📚 相关文件

- `setup-admin-user-simple.sql` - SQL 脚本（推荐使用）
- `SETUP_ENV_AND_ADMIN.md` - 详细配置指南
- `ENV_CONFIG_COMPLETE.md` - 环境变量详细说明
