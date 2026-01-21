# 修复 Admin Portal 登录凭据错误

## 问题
登录时出现 `Invalid login credentials` (400 Bad Request) 错误。

## 原因
SQL 脚本只能设置 `profiles.is_admin = true` 和 `admin_users` 表，但**不能创建 Supabase Auth 用户**。

Supabase Auth 用户必须通过以下方式创建：
1. Supabase Dashboard → Authentication → Users
2. Supabase Admin API
3. 客户端 `signUp()` 方法（需要启用邮箱验证）

## 解决方案

### 方法 1：通过 Supabase Dashboard 创建用户（推荐）

1. 打开 **Supabase Dashboard**
   - 访问：https://supabase.com/dashboard
   - 选择你的项目

2. 进入 **Authentication → Users**

3. 点击 **"Add User"** → **"Create New User"**

4. 填写信息：
   - **Email**: `admin123@admin.lux-night.com`
   - **Password**: `a146129887`
   - **Confirm Password**: `a146129887`
   - **Auto Confirm User**: ✅ 勾选（自动确认，不需要邮箱验证）

5. 点击 **"Create User"**

6. 运行 SQL 脚本设置权限（如果还没有运行）：
   ```sql
   -- 运行 QUICK_INSERT_ADMIN_USERS.sql
   INSERT INTO public.admin_users (user_id, is_active)
   SELECT id, true
   FROM auth.users
   WHERE email = 'admin123@admin.lux-night.com'
   ON CONFLICT (user_id) DO UPDATE
   SET is_active = true;

   UPDATE public.profiles
   SET is_admin = true
   WHERE id IN (
     SELECT id FROM auth.users WHERE email = 'admin123@admin.lux-night.com'
   );
   ```

### 方法 2：通过 Supabase CLI 创建用户

```bash
# 使用 Supabase CLI（如果已安装）
supabase auth admin create-user \
  --email admin123@admin.lux-night.com \
  --password a146129887 \
  --email-confirm
```

### 方法 3：检查现有用户

如果用户已存在，但密码不正确：

1. 在 **Authentication → Users** 中找到 `admin123@admin.lux-night.com`

2. 点击用户，然后点击 **"Reset Password"** 或 **"Update Password"**

3. 设置新密码为：`a146129887`

## 验证步骤

1. 确认用户已创建：
   ```sql
   SELECT id, email, email_confirmed_at, created_at
   FROM auth.users
   WHERE email = 'admin123@admin.lux-night.com';
   ```

2. 确认权限已设置：
   ```sql
   SELECT 
     u.email,
     p.is_admin as profiles_is_admin,
     au.is_active as admin_users_is_active
   FROM auth.users u
   LEFT JOIN public.profiles p ON p.id = u.id
   LEFT JOIN public.admin_users au ON au.user_id = u.id
   WHERE u.email = 'admin123@admin.lux-night.com';
   ```

3. 尝试登录：
   - 打开 `http://localhost:3002/login`
   - 输入邮箱：`admin123@admin.lux-night.com`
   - 输入密码：`a146129887`
   - 点击登录

## 常见问题

### Q: 为什么 SQL 脚本不能创建 Auth 用户？
A: Supabase Auth 是一个独立的服务，用户密码经过加密存储在 `auth.users` 表中。创建用户需要：
- 密码哈希
- 正确的 JWT token 生成
- 安全的加密流程

这些只能通过 Supabase Auth API 或 Dashboard 完成。

### Q: 用户已存在，但仍然无法登录？
A: 检查：
1. 密码是否正确（尝试重置密码）
2. 用户是否已确认邮箱（检查 `email_confirmed_at` 不为 NULL）
3. 用户状态是否活跃（检查 `banned_until` 为 NULL）

### Q: 创建用户后，`profiles` 表会自动创建吗？
A: 如果配置了 `ensure_profile()` trigger，`profiles` 记录会自动创建。否则需要手动运行 SQL 脚本设置 `is_admin = true`。
