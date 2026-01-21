# 环境变量和 Admin 用户配置完成指南

## ✅ 已创建的文件

### 环境变量文件

1. ✅ `apps/customer-web/.env.local` - 顾客端应用环境变量
2. ✅ `apps/internal-web/.env.local` - 商家端应用环境变量
3. ✅ `apps/admin-web/.env.local` - 管理员端应用环境变量

### SQL 脚本

1. ✅ `supabase/scripts/setup-admin-user.sql` - 设置 Admin 用户权限（推荐）
2. ✅ `setup-admin-complete.sql` - 完整的 Admin 用户设置脚本

## 🔧 配置步骤

### 步骤 1: 配置环境变量

#### 1.1 获取 Supabase 配置

1. 访问 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **Settings** → **API**
4. 复制以下值：
   - **Project URL** → 用于 `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → 用于 `NEXT_PUBLIC_SUPABASE_ANON_KEY`

#### 1.2 编辑环境变量文件

**Customer Web** (`apps/customer-web/.env.local`):
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# App Configuration
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Stripe Configuration (可选)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Internal Web** (`apps/internal-web/.env.local`):
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# App Configuration
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3001
NEXT_PUBLIC_SITE_URL=http://localhost:3001
```

**Admin Web** (`apps/admin-web/.env.local`):
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# App Configuration
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3002
NEXT_PUBLIC_SITE_URL=http://localhost:3002
```

### 步骤 2: 配置 Supabase Redirect URLs

在 Supabase Dashboard → Authentication → URL Configuration 添加：

**Additional Redirect URLs:**
```
http://localhost:3000/auth/callback
http://localhost:3001/auth/callback
http://localhost:3002/auth/callback
```

**生产环境（可选）:**
```
https://app.example.com/auth/callback
https://internal.example.com/auth/callback
https://admin.example.com/auth/callback
```

### 步骤 3: 创建 Admin 用户

#### 方式 1: 通过 Supabase Dashboard（推荐）

1. 打开 Supabase Dashboard → **Authentication** → **Users**
2. 点击 **"Add User"** → **"Create New User"**
3. 填写信息：
   - **Email**: `admin123@admin.lux-night.com`
   - **Password**: `a146129887`
   - **Confirm Password**: `a146129887`
4. 点击 **"Create User"**

#### 方式 2: 使用 Supabase Management API（需要 service_role key）

```bash
curl -X POST 'https://your-project.supabase.co/auth/v1/admin/users' \
  -H 'apikey: YOUR_SERVICE_ROLE_KEY' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "admin123@admin.lux-night.com",
    "password": "a146129887",
    "email_confirm": true
  }'
```

### 步骤 4: 设置 Admin 权限

#### 方式 1: 运行 SQL 脚本（推荐）

在 **Supabase Dashboard** → **SQL Editor** 中运行：

```sql
-- 复制并运行 supabase/scripts/setup-admin-user.sql 的内容
```

或直接运行以下 SQL：

```sql
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
  
  RAISE NOTICE '✅ Admin 用户设置完成！';
  RAISE NOTICE '   Email: %', v_admin_email;
  RAISE NOTICE '   User ID: %', v_user_id;
  RAISE NOTICE '   is_admin: true';
END $$;
```

#### 方式 2: 手动设置

在 **Supabase Dashboard** → **SQL Editor** 中运行：

```sql
-- 1. 查找用户 ID
SELECT id, email FROM auth.users WHERE email = 'admin123@admin.lux-night.com';

-- 2. 设置 is_admin = true（替换 <USER_ID> 为实际的用户 ID）
UPDATE public.profiles
SET is_admin = true
WHERE id = '<USER_ID>';

-- 3. 添加到 admin_users 表（可选）
INSERT INTO public.admin_users (user_id, is_active)
VALUES ('<USER_ID>', true)
ON CONFLICT (user_id) DO UPDATE
SET is_active = true;
```

### 步骤 5: 验证设置

运行以下 SQL 验证设置：

```sql
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

应该返回：
- `user_id`: 用户的 UUID
- `email`: `admin123@admin.lux-night.com`
- `display_name`: `Admin`
- `is_admin`: `true`
- `in_admin_users_table`: `Yes` 或 `No`

## 🚀 启动应用

### 启动所有应用

```cmd
# 终端 1 - Customer Web (端口 3000)
npx -y pnpm@latest dev:customer

# 终端 2 - Internal Web (端口 3001)
npx -y pnpm@latest dev:internal

# 终端 3 - Admin Web (端口 3002)
npx -y pnpm@latest dev:admin
```

### 访问地址

- **Customer Web**: http://localhost:3000
- **Internal Web**: http://localhost:3001
- **Admin Web**: http://localhost:3002/login

### Admin Portal 登录

- **Email**: `admin123@admin.lux-night.com`
- **Password**: `a146129887`

## 📋 验证清单

### 环境变量配置

- [ ] `apps/customer-web/.env.local` 已配置
- [ ] `apps/internal-web/.env.local` 已配置
- [ ] `apps/admin-web/.env.local` 已配置
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

## ⚠️ 注意事项

1. **环境变量**: 每次修改 `.env.local` 后需要重启开发服务器
2. **用户创建**: Admin 用户必须在 Supabase Dashboard 中手动创建（邮箱密码登录）
3. **权限设置**: 创建用户后，运行 SQL 脚本设置 `is_admin = true`
4. **服务端口**: 确保端口 3000, 3001, 3002 未被占用
5. **Cookie 隔离**: 三个应用使用不同的 cookie 前缀（`sb-customer-`, `sb-internal-`, `sb-admin-`）

## 🐛 故障排除

### Admin 用户登录失败

1. 检查用户是否在 Supabase Dashboard 中创建
2. 检查 `profiles.is_admin` 是否为 `true`
3. 检查邮箱和密码是否正确（`admin123@admin.lux-night.com` / `a146129887`）
4. 检查环境变量是否正确配置

### 无法访问 Admin Portal

1. 检查端口 3002 是否被占用
2. 检查环境变量是否正确配置
3. 检查 Supabase URL 和 Key 是否正确
4. 检查浏览器控制台是否有错误

### 权限检查失败

1. 检查 `is_admin()` RPC 函数是否存在
2. 检查 `profiles.is_admin` 是否为 `true`
3. 检查用户 ID 是否匹配
4. 检查数据库迁移是否已推送

## 📚 相关文件

- 环境变量文件：
  - `apps/customer-web/.env.local`
  - `apps/internal-web/.env.local`
  - `apps/admin-web/.env.local`

- SQL 脚本：
  - `supabase/scripts/setup-admin-user.sql`（推荐）
  - `setup-admin-complete.sql`（完整脚本）

- 配置指南：
  - `ENV_SETUP_GUIDE.md`
  - `ADMIN_PORT_DEPLOYMENT_GUIDE.md`
  - `ADMIN_PORT_QUICK_START.md`
