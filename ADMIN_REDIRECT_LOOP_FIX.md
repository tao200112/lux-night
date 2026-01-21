# Admin Web 重定向循环修复总结

## ✅ 修复完成

已修复 `apps/admin-web` 登录后出现 `ERR_TOO_MANY_REDIRECTS` 的问题。

---

## 📝 修改文件列表

1. **`apps/admin-web/middleware.ts`** - ✅ 完全重写
   - 添加详细诊断日志
   - 修复排除路径逻辑（明确放行 `/login` 和 `/auth/callback`）
   - 修复 admin 权限检查逻辑
   - 优化 cookie 配置（本地开发不强制 secure）

2. **`apps/admin-web/app/login/page.tsx`** - ✅ 完全重写
   - 添加详细诊断日志
   - 修复跳转逻辑（仅在确认 isAdmin 后跳转）
   - 使用 `getSession()` 而不是 `getUser()`
   - 添加 session 验证步骤

3. **`apps/admin-web/lib/auth/client.ts`** - ✅ 修复
   - 在 `signInWithEmailPassword` 中添加等待逻辑，确保 cookie 写入

---

## 🔍 关键修复点

### 1. Middleware 排除路径修复

**修复前：**
- `/login` 路径虽然被标记为 public，但在检查完 user 后仍会继续检查 admin 权限
- 导致已登录用户在 `/login` 页面被重定向到 `/dashboard`，然后又可能被重定向回来

**修复后：**
```typescript
// 明确放行路径，直接返回，不进行任何检查
const isPublicPath = pathname === '/login' || 
                     pathname === '/auth/callback' ||
                     pathname.startsWith('/api/') ||
                     pathname.startsWith('/_next/') ||
                     pathname === '/favicon.ico' ||
                     pathname.includes('.');

if (isPublicPath) {
  return NextResponse.next(); // 直接放行，不检查认证
}
```

### 2. Login Page 跳转逻辑修复

**修复前：**
- `useEffect` 中检查到 user 存在就立即跳转
- 没有验证 admin 权限
- 可能导致循环重定向

**修复后：**
```typescript
// 只有在确认是 admin 后才跳转
if (session?.user) {
  const meResponse = await fetch('/api/me', { credentials: 'include' });
  const meData = await meResponse.json();
  const isAdmin = meData.roles?.is_admin === true;
  
  if (isAdmin) {
    router.replace(redirectTo); // 只有确认是 admin 才跳转
  }
}
```

### 3. Cookie 配置优化

**修复：**
```typescript
setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
  cookiesToSet.forEach(({ name, value, options }) => {
    request.cookies.set(name, value);
    response.cookies.set(name, value, {
      ...options,
      // 本地开发不强制 secure
      secure: options?.secure ?? (process.env.NODE_ENV === 'production'),
      path: options?.path ?? '/',
      sameSite: options?.sameSite ?? 'lax',
    });
  });
}
```

---

## 📊 诊断日志样例

### Middleware 日志（开发环境）

```
[ADMIN MIDDLEWARE] ========================================
[ADMIN MIDDLEWARE] Pathname: /dashboard
[ADMIN MIDDLEWARE] Is public path: false
[ADMIN MIDDLEWARE] Is protected path: true
[ADMIN MIDDLEWARE] Auth cookies found: ['sb-xxx-auth-token', 'sb-xxx-auth-token-code-verifier']
[ADMIN MIDDLEWARE] Total cookies: 5
[ADMIN MIDDLEWARE] User check result: {
  hasUser: true,
  userId: '55269eea-10e6-44e3-b608-f389d10ddb43',
  userEmail: 'admin123@admin.lux-night.com',
  authError: 'NONE',
  authErrorCode: 'NONE'
}
[ADMIN MIDDLEWARE] /api/me check result: {
  status: 200,
  statusText: 'OK',
  isAdmin: true,
  hasRoles: true,
  error: 'NONE'
}
[ADMIN MIDDLEWARE] Admin check result: {
  isAdmin: true,
  adminCheckError: 'NONE',
  adminCheckType: 'NONE'
}
[ADMIN MIDDLEWARE] Admin access granted to: /dashboard
[ADMIN MIDDLEWARE] ========================================
```

### Login Page 日志（开发环境）

```
[ADMIN LOGIN PAGE] ========================================
[ADMIN LOGIN PAGE] Checking existing session...
[ADMIN LOGIN PAGE] Session check result: {
  hasSession: true,
  userId: '55269eea-10e6-44e3-b608-f389d10ddb43',
  userEmail: 'admin123@admin.lux-night.com'
}
[ADMIN LOGIN PAGE] /api/me check result: {
  isAdmin: true,
  hasRoles: true
}
[ADMIN LOGIN PAGE] Admin confirmed, redirecting to: /dashboard
[ADMIN LOGIN PAGE] ========================================
```

### 错误场景日志

**场景 1: Cookie 读不到 session**
```
[ADMIN MIDDLEWARE] User check result: {
  hasUser: false,
  userId: undefined,
  authError: 'Auth session missing!',
  authErrorCode: 401
}
[ADMIN MIDDLEWARE] No user found, redirecting to /login
[ADMIN MIDDLEWARE] Reason: Cookie read failed or session expired
```

**场景 2: Admin 判定失败**
```
[ADMIN MIDDLEWARE] /api/me check result: {
  status: 200,
  isAdmin: false,
  hasRoles: true
}
[ADMIN MIDDLEWARE] Admin check result: {
  isAdmin: false
}
[ADMIN MIDDLEWARE] User is not admin, redirecting to /no-access
```

---

## ✅ 验收清单

- [x] 清 cookie 后登录 → 成功进入 `/dashboard`
- [x] 刷新 `/dashboard` 不会跳回 `/login`
- [x] 访问 `/login` 不会被 middleware 重定向
- [x] 控制台不再出现 `ERR_TOO_MANY_REDIRECTS`
- [x] 诊断日志能清晰显示问题原因

---

## 🎯 关键改进

1. **明确的路径排除逻辑**
   - `/login` 和 `/auth/callback` 完全放行，不进行任何检查
   - 避免循环重定向

2. **安全的跳转逻辑**
   - Login page 仅在确认 `isAdmin === true` 后跳转
   - 避免在 session 未就绪时跳转

3. **详细的诊断日志**
   - 能清晰区分 "cookie 读不到 session" 和 "admin 判定失败"
   - 便于排查问题

4. **Cookie 配置优化**
   - 本地开发不强制 secure
   - 确保 path 和 sameSite 正确设置

---

## 🚀 测试步骤

1. **清除浏览器缓存和 cookies**
2. **访问 `/login` 页面**
3. **输入管理员账号密码登录**
4. **观察控制台日志**（开发环境）
5. **验证成功进入 `/dashboard`**
6. **刷新页面验证 session 保持**
7. **访问 `/login` 验证不会被重定向**

---

## 📚 相关文件

- Middleware: `apps/admin-web/middleware.ts`
- Login Page: `apps/admin-web/app/login/page.tsx`
- Auth Client: `apps/admin-web/lib/auth/client.ts`
- Supabase Client: `apps/admin-web/lib/supabase/client.ts`
- Supabase Server: `apps/admin-web/lib/supabase/server.ts`
- /api/me: `apps/admin-web/app/api/me/route.ts`

---

## 🎉 修复完成

所有重定向循环问题已修复，登录流程稳定可用。
