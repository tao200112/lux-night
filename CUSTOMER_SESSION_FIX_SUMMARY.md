# Customer 登录 Session 修复总结

## 问题根因

**Session 不同步**：
- 服务端 `exchangeCodeForSession` 写入的是 **cookie**（带 `sb-customer-` 前缀）
- 客户端 `createBrowserClient` 从 **localStorage** 读取 session
- OAuth 回调后，客户端无法自动从 cookie 同步到 localStorage

## 修复方案

### 1. 配置 createBrowserClient（`packages/shared/src/supabase/client.ts`）

**关键配置**：
```typescript
{
  auth: {
    detectSessionInUrl: true,  // 从 URL 参数中检测 session（OAuth 回调后）
    persistSession: true,       // 持久化 session 到 localStorage
    autoRefreshToken: true,     // 自动刷新 token
  }
}
```

**作用**：
- `detectSessionInUrl`: 当 OAuth 回调包含 `#access_token=...` 或 `?code=...` 时，自动提取并恢复 session
- `persistSession`: 将恢复的 session 保存到 localStorage

### 2. 创建 Session API（`apps/customer-web/app/api/auth/session/route.ts`）

**作用**：
- 从服务端 cookie 获取 session
- 客户端可以主动调用此 API 同步 session

### 3. 更新 AuthContext（`apps/customer-web/contexts/AuthContext.tsx`）

**双重策略**：
1. **优先从服务端 API 获取 session**（从 cookie）
2. **如果服务端有 session，同步到客户端 localStorage**
3. **然后从 localStorage 读取**（标准流程）

**关键代码**：
```typescript
// 从服务端获取 session
const { session: serverSession } = await fetch('/api/auth/session');

if (serverSession) {
  // 同步到客户端 localStorage
  await supabase.auth.setSession({
    access_token: serverSession.access_token,
    refresh_token: serverSession.refresh_token,
  });
  
  setUser(serverSession.user);
  loadProfile(serverSession.user.id);
}
```

## 工作流程

### OAuth 登录流程

1. **用户点击 Google 登录**
   - `signInWithGoogle()` → 重定向到 Google

2. **Google 回调**
   - 重定向到 `/auth/callback?code=xxx`
   - 服务端 `exchangeCodeForSession(code)` → 写入 cookie

3. **Callback 重定向**
   - 重定向到 `/`（首页）

4. **客户端加载**
   - `AuthContext` 初始化
   - **方法 1**: 从服务端 API 获取 session（从 cookie）→ 同步到 localStorage
   - **方法 2**: `detectSessionInUrl` 从 URL 参数中恢复 session（如果有）
   - **方法 3**: 从 localStorage 读取 session

5. **Session 建立**
   - 客户端有 session → 显示首页
   - 客户端无 session → 重定向到 `/login`

## 验证步骤

1. **清除浏览器数据**
   - DevTools → Application → Clear storage → Clear site data

2. **重新登录**
   - 访问 `http://localhost:3000/login`
   - 点击 Google 登录

3. **查看日志**
   - **服务器控制台**：
     ```
     [CUSTOMER AUTH CALLBACK] Received code: YES
     [CUSTOMER AUTH CALLBACK] After exchange - user: xxx
     [CUSTOMER AUTH CALLBACK] Auth cookies found: [...]
     ```
   - **浏览器 Console**：
     ```
     [CUSTOMER AUTH CONTEXT] Server session found: xxx
     [CUSTOMER AUTH CONTEXT] Auth state change: SIGNED_IN User: xxx
     ```

4. **检查 Session**
   - DevTools → Application → Local Storage → 应该有 `sb-xxx-auth-token`
   - DevTools → Application → Cookies → 应该有 `sb-customer-xxx-auth-token`

5. **验证登录状态**
   - 应该显示首页（而不是跳转到登录页）
   - `AuthContext.user` 应该不为 null

## 如果仍然失败

### 检查项

1. **Callback 是否正确执行**
   - 查看服务器日志中是否有 `[CUSTOMER AUTH CALLBACK]` 输出
   - 确认 `exchangeCodeForSession` 是否成功

2. **Cookie 是否写入**
   - DevTools → Network → 查看 `/auth/callback` 响应
   - 检查 `Set-Cookie` header 是否存在

3. **Session API 是否返回数据**
   - DevTools → Network → 查看 `/api/auth/session` 请求
   - 确认返回的 JSON 中是否有 `session` 对象

4. **客户端是否正确同步**
   - 查看浏览器 Console 中是否有 `[CUSTOMER AUTH CONTEXT] Server session found` 日志
   - 检查 localStorage 中是否有 `sb-xxx-auth-token`

### 临时解决方案

如果上述方法都不工作，可以尝试：

1. **在 callback 页面中添加客户端处理**：
   ```typescript
   // app/auth/callback/page.tsx
   'use client';
   
   useEffect(() => {
     const supabase = createClient();
     supabase.auth.getSession().then(({ data: { session } }) => {
       if (session) {
         router.push('/');
       }
     });
   }, []);
   ```

2. **强制刷新页面**：
   ```typescript
   // 在 callback 重定向后
   window.location.reload();
   ```

## 预期结果

修复后，登录流程应该：

1. ✅ OAuth 回调成功执行
2. ✅ Cookie 正确写入
3. ✅ 客户端自动同步 session 到 localStorage
4. ✅ `AuthContext` 检测到 session
5. ✅ 用户成功登录，显示首页
