# 诊断 Admin Portal 登录问题

## 问题
用户已创建，但仍然收到 `Invalid login credentials` 错误。

## 诊断步骤

### 1. 检查用户状态（在 Supabase Dashboard → SQL Editor 运行）

```sql
-- 检查用户是否存在，以及状态
SELECT 
  id,
  email,
  encrypted_password IS NOT NULL as has_password,
  email_confirmed_at IS NOT NULL as email_confirmed,
  banned_until,
  confirmed_at IS NOT NULL as is_confirmed,
  created_at,
  last_sign_in_at
FROM auth.users
WHERE email = 'admin123@admin.lux-night.com';
```

**预期结果**：
- `has_password` 应该是 `true`
- `email_confirmed` 应该是 `true` 或 `NULL`（如果禁用了邮箱确认）
- `banned_until` 应该是 `NULL`
- `is_confirmed` 应该是 `true`

### 2. 尝试重置密码

如果用户存在但密码不正确：

1. 在 **Supabase Dashboard → Authentication → Users** 中找到用户
2. 点击用户，然后点击 **"Reset Password"** 或 **"Send Password Reset Email"**
3. 或者直接点击 **"Update Password"**，设置新密码为：`a146129887`

### 3. 检查邮箱地址是否完全匹配

确保邮箱地址完全相同（包括大小写）：
- ✅ `admin123@admin.lux-night.com`
- ❌ `Admin123@admin.lux-night.com`
- ❌ `admin123@Admin.lux-night.com`

### 4. 清除浏览器缓存和 Cookies

1. 打开浏览器开发者工具（F12）
2. 进入 **Application** 标签
3. 清除 **Cookies** 和 **Local Storage**
4. 或者使用无痕模式重新测试

### 5. 检查环境变量

确认 `apps/admin-web/.env.local` 中的 Supabase 配置正确：

```env
NEXT_PUBLIC_SUPABASE_URL=https://hbbhtmvcqpdybclbdtot.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 6. 尝试使用 Supabase Dashboard 的 "Sign in as user" 功能

1. 在 **Authentication → Users** 中找到用户
2. 点击 **"..." (三个点)** → **"Sign in as user"**
3. 这会打开一个新窗口，直接以该用户身份登录

如果这样可以登录，说明：
- ✅ 用户和密码是正确的
- ❌ 问题在于 Admin Portal 的登录逻辑

### 7. 检查网络请求

在浏览器开发者工具的 **Network** 标签中：

1. 尝试登录
2. 查看 `POST /auth/v1/token?grant_type=password` 请求
3. 检查：
   - **Request Payload**: 邮箱和密码是否正确发送
   - **Response**: 具体的错误信息

### 8. 检查 Supabase Auth 设置

在 **Supabase Dashboard → Authentication → Settings**：

- ✅ **Enable Email Signup**: 应该启用
- ✅ **Enable Email Confirmations**: 如果启用，需要确认邮箱；如果禁用，不需要
- ✅ **Site URL**: 应该包含 `http://localhost:3002`

## 常见问题

### Q: 用户创建时自动生成了不同的密码？
A: 检查用户在 Dashboard 中的实际密码。如果需要，使用 "Update Password" 重置。

### Q: 邮箱确认状态？
A: 如果启用了邮箱确认，用户需要先确认邮箱才能登录。检查 `email_confirmed_at` 是否为 `NULL`。

### Q: 用户被禁用？
A: 检查 `banned_until` 字段。如果是未来的日期，说明用户被暂时禁用。

### Q: 密码哈希问题？
A: 如果用户是通过其他方式创建的（如导入），密码哈希可能不正确。建议重置密码。

## 快速修复

如果以上都不行，建议：

1. **删除并重新创建用户**：
   - 在 Dashboard → Authentication → Users 中删除用户
   - 重新创建用户，确保密码是 `a146129887`

2. **使用 Supabase CLI 创建用户**（如果已安装）：
   ```bash
   supabase auth admin create-user \
     --email admin123@admin.lux-night.com \
     --password a146129887 \
     --email-confirm
   ```

3. **检查 Supabase 项目配置**：
   - 确认你正在使用正确的 Supabase 项目
   - 确认 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 是正确的
