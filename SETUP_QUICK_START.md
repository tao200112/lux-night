# 环境变量和 Admin 用户配置 - 快速开始

## 🚀 3 步完成配置

### 步骤 1: 配置环境变量

已创建了以下环境变量文件（需要你填入实际的 Supabase 配置）：

1. ✅ `apps/customer-web/.env.local`
2. ✅ `apps/internal-web/.env.local`
3. ✅ `apps/admin-web/.env.local`

**编辑这些文件，填入你的 Supabase 配置**：

1. 访问 [Supabase Dashboard](https://app.supabase.com) → **Settings** → **API**
2. 复制 **Project URL** 和 **anon public** key
3. 替换文件中的 `https://your-project.supabase.co` 和 `your-anon-key`

### 步骤 2: 创建 Admin 用户

在 **Supabase Dashboard** → **Authentication** → **Users** 中：

1. 点击 **"Add User"** → **"Create New User"**
2. 填写信息：
   - **Email**: `admin123@admin.lux-night.com`
   - **Password**: `a146129887`
   - **Confirm Password**: `a146129887`
3. 点击 **"Create User"**

### 步骤 3: 设置 Admin 权限

在 **Supabase Dashboard** → **SQL Editor** 中运行以下 SQL：

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

**或者**直接打开文件 `setup-admin-user-simple.sql`，复制内容并运行。

## ✅ 完成！

启动应用：

```cmd
# Customer Web (端口 3000)
npx -y pnpm@latest dev:customer

# Internal Web (端口 3001)
npx -y pnpm@latest dev:internal

# Admin Web (端口 3002)
npx -y pnpm@latest dev:admin
```

访问 Admin Portal: **http://localhost:3002/login**

登录凭据：
- **Email**: `admin123@admin.lux-night.com`
- **Password**: `a146129887`

## 📚 详细文档

- `SETUP_ENV_AND_ADMIN.md` - 完整配置指南
- `setup-admin-user-simple.sql` - SQL 脚本文件
