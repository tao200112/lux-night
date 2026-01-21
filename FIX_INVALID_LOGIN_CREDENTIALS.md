# 修复 "Invalid login credentials" 错误

## 问题状态
✅ 用户状态检查正常：
- 用户存在
- 有密码 (`has_password = true`)
- 邮箱已确认 (`email_confirmed = true`)
- Admin 权限已设置

但仍收到 `Invalid login credentials` 错误。

## 可能的原因

### 1. 密码不匹配（最可能）

虽然用户已创建，但创建时使用的密码可能与 `a146129887` 不同。

**解决方法**：
1. 打开 Supabase Dashboard → Authentication → Users
2. 找到 `admin123@admin.lux-night.com`
3. 点击用户 → **"Update Password"** 或 **"Send Password Reset Email"**
4. 设置新密码为：`a146129887`
5. 保存后重新尝试登录

### 2. 检查浏览器 Network 请求

在浏览器开发者工具（F12）→ Network 标签：

1. 尝试登录
2. 查看 `POST /auth/v1/token?grant_type=password` 请求
3. 检查 **Request Payload**：
   ```json
   {
     "email": "admin123@admin.lux-night.com",
     "password": "a146129887"
   }
   ```
4. 检查 **Response** 中的详细错误信息

### 3. 清除浏览器存储

可能存在旧的 session 或 cookie 干扰：

1. **清除 Cookies**：
   - 开发者工具 → Application → Cookies → `http://localhost:3002`
   - 删除所有 cookies

2. **清除 Local Storage**：
   - Application → Local Storage → `http://localhost:3002`
   - 清除所有项目（特别是 `sb-` 开头的项）

3. **使用无痕模式测试**：
   - 打开无痕窗口（Ctrl+Shift+N）
   - 访问 `http://localhost:3002/login`
   - 尝试登录

### 4. 检查环境变量

确认 `apps/admin-web/.env.local` 配置正确：

```env
NEXT_PUBLIC_SUPABASE_URL=https://hbbhtmvcqpdybclbdtot.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**验证**：
- URL 应该以 `.supabase.co` 结尾
- Anon Key 应该以 `eyJ` 开头（JWT token 格式）

### 5. 尝试通过 Dashboard 登录

在 Supabase Dashboard → Authentication → Users：

1. 找到用户 `admin123@admin.lux-night.com`
2. 点击 **"..." (三个点)** → **"Sign in as user"**
3. 这会直接以该用户身份登录，打开一个新窗口

如果这样可以登录，说明：
- ✅ 用户和密码是正确的
- ❌ 问题在于 Admin Portal 的登录代码或配置

### 6. 检查 Supabase Auth 设置

在 Supabase Dashboard → Authentication → Settings：

- **Site URL**: 应该包含 `http://localhost:3002`
- **Redirect URLs**: 应该包含 `http://localhost:3002/**`

## 快速测试步骤

1. **重置密码**（最重要）：
   - Dashboard → Users → 用户 → Update Password → `a146129887`

2. **清除浏览器缓存**：
   - 使用无痕模式或清除 cookies/localStorage

3. **检查 Network 请求**：
   - 查看登录请求的 payload 和 response

4. **测试登录**：
   - 确保邮箱和密码完全匹配（注意大小写）

## 如果仍然不行

### 方案 A：删除并重新创建用户

1. Dashboard → Authentication → Users
2. 删除 `admin123@admin.lux-night.com`
3. 重新创建：
   - Email: `admin123@admin.lux-night.com`
   - Password: `a146129887`
   - **勾选 "Auto Confirm User"**
4. 运行权限设置脚本：
   ```sql
   -- 运行 QUICK_INSERT_ADMIN_USERS.sql
   ```

### 方案 B：使用 Supabase CLI

如果已安装 Supabase CLI：

```bash
supabase auth admin create-user \
  --email admin123@admin.lux-night.com \
  --password a146129887 \
  --email-confirm
```

然后运行权限设置脚本。

## 调试日志

在登录页面，检查浏览器控制台：

```
[ADMIN LOGIN] Sign in result: ...
[ADMIN LOGIN] User authenticated: ...
```

如果没有这些日志，说明登录请求失败在 Supabase 客户端层面。

检查 Network 请求的 Response，应该包含详细的错误信息，例如：
- `Invalid login credentials` - 密码错误
- `Email not confirmed` - 邮箱未确认
- `User not found` - 用户不存在
