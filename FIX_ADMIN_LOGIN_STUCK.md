# 修复 Admin Portal 登录卡住问题

## ❌ 问题

登录时一直显示"登录中..."状态，无法完成登录流程。

## 🔍 原因

可能的原因：

1. **重定向目标错误**：登录成功后重定向到 `/`，但 `/` 需要通过 `(admin)/layout.tsx` 的认证检查，可能导致重定向循环
2. **Session 未及时设置**：登录成功后，cookie 可能还未完全设置，导致重定向后的页面无法识别登录状态
3. **`getUser()` 抛出错误**：如果 `getUser()` 在未登录时抛出错误，可能导致组件崩溃

## ✅ 已应用的修复

### 修复 1: 更改默认重定向目标

**修改前**：
```typescript
const redirectTo = searchParams.get('redirect') || '/';
```

**修改后**：
```typescript
const redirectTo = searchParams.get('redirect') || '/dashboard';
```

### 修复 2: 改进 `getUser()` 错误处理

**修改前**：
```typescript
export async function getUser() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    throw error;  // 抛出错误
  }
  return user;
}
```

**修改后**：
```typescript
export async function getUser() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  // 不抛出错误，只返回 null（允许未登录状态）
  if (error) {
    return null;
  }
  return user;
}
```

### 修复 3: 改进登录成功后的重定向逻辑

**修改前**：
```typescript
await signInWithEmailPassword(email, password);
router.replace(redirectTo);  // 直接使用 router
```

**修改后**：
```typescript
const result = await signInWithEmailPassword(email, password);
if (result && result.user) {
  // 等待一下让 session 设置完成
  await new Promise(resolve => setTimeout(resolve, 100));
  // 使用 window.location.href 强制刷新页面
  window.location.href = redirectTo;
}
```

## 🔍 验证

修复后，登录流程应该：

1. ✅ 点击登录按钮后显示"登录中..."
2. ✅ 成功验证用户凭据
3. ✅ 设置 session cookie
4. ✅ 重定向到 `/dashboard`
5. ✅ 显示 Dashboard 页面

## 📋 调试步骤

如果问题仍然存在，请检查：

### 1. 浏览器控制台

打开开发者工具 (F12) → Console 标签，查看是否有错误信息。

### 2. 网络请求

打开开发者工具 → Network 标签，检查：
- `token?grant_type=password` 请求是否成功（Status 200）
- `user` 请求是否成功（Status 200）
- 是否有重定向请求（Status 307 或 302）

### 3. Cookie 设置

打开开发者工具 → Application 标签 → Cookies，检查是否有：
- `sb-admin-*-auth-token` cookie
- `sb-admin-*-refresh-token` cookie

### 4. 服务器日志

检查服务器控制台是否有错误信息。

## 🐛 常见问题

### Q: 登录后仍然重定向回登录页？

**A**: 可能的原因：
1. Session cookie 未正确设置
2. `is_admin()` RPC 函数返回 `false`
3. Middleware 中的认证检查失败

**解决方案**：
1. 检查 `is_admin()` 函数是否正确
2. 检查 `profiles.is_admin` 是否为 `true`
3. 检查 middleware 的 cookie 前缀是否正确

### Q: 登录后显示 "no-access" 页面？

**A**: 用户可能没有 admin 权限。

**解决方案**：
1. 在 Supabase Dashboard 中检查 `profiles.is_admin` 是否为 `true`
2. 运行 `setup-admin-user-simple.sql` 确保权限设置正确

### Q: 登录按钮一直显示"登录中..."？

**A**: 可能的原因：
1. 网络请求卡住
2. 错误未被正确处理
3. 重定向失败

**解决方案**：
1. 检查网络请求是否完成
2. 检查控制台是否有错误
3. 尝试刷新页面后重新登录

## ✅ 预期行为

修复后，登录流程应该：

1. **点击登录** → 按钮显示"登录中..."
2. **认证成功** → 等待 100ms 让 session 设置完成
3. **重定向** → 跳转到 `/dashboard`
4. **显示 Dashboard** → 加载 Admin Dashboard 页面

## 📝 相关文件

- `apps/admin-web/app/login/page.tsx` - 登录页面（已修复）
- `apps/admin-web/lib/auth/client.ts` - 认证客户端工具（已修复）
- `apps/admin-web/middleware.ts` - 中间件（认证检查）
- `apps/admin-web/app/(admin)/layout.tsx` - Admin 布局（权限检查）

## 🎯 总结

已修复登录卡住问题：

1. ✅ 更改默认重定向目标为 `/dashboard`
2. ✅ 改进 `getUser()` 错误处理（不抛出错误）
3. ✅ 改进登录成功后的重定向逻辑（使用 `window.location.href` 并等待 session 设置）

请刷新页面并重新尝试登录。
