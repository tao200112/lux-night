# Customer 登录问题诊断与修复

## 问题分析

从 Network 标签看到 OAuth 流程正常（Google 登录 → callback），但登录后可能没有正确建立 session。

### 可能原因

1. **Cookie 过滤逻辑问题**：
   - `packages/shared/src/supabase/server.ts` 中，customer app 的 `getAll()` 明确排除无前缀 cookie
   - 但客户端 `createBrowserClient` 可能写入无前缀 cookie
   - 服务端读不到 cookie → session 无法建立

2. **回调处理问题**：
   - `exchangeCodeForSession` 可能失败但没有处理错误
   - 缺少验证逻辑确认 session 是否正确写入

3. **客户端读取问题**：
   - `AuthContext` 使用 `getSession()` 读取 session
   - 如果服务端 cookie 未写入，客户端也读不到

## 修复方案

### 1. 增强回调错误处理和调试

已在 `apps/customer-web/app/auth/callback/route.ts` 添加：
- 错误处理和重定向
- 开发环境调试日志
- Cookie 验证

### 2. 检查 Cookie 过滤逻辑

**问题代码**（`packages/shared/src/supabase/server.ts` 第 48-54 行）：
```typescript
if (cookie.name.startsWith('sb-') && 
    !cookie.name.includes('-customer-') && 
    !cookie.name.includes('-internal-')) {
  // customer app 不应该匹配无前缀 cookie
  return appType === 'internal';
}
```

**影响**：如果 Supabase 写入的 cookie 没有前缀，customer app 读不到。

**解决方案**：修改过滤逻辑，允许 customer app 在开发环境中匹配无前缀 cookie（作为后备），或确保 `setAll` 正确写入带前缀的 cookie。

### 3. 验证流程

1. **检查回调是否执行**：
   - 查看服务器日志中的 `[CUSTOMER AUTH CALLBACK]` 输出
   - 确认 `exchangeCodeForSession` 是否成功

2. **检查 Cookie 是否写入**：
   - 查看服务器日志中的 cookie 信息
   - 在浏览器 DevTools → Application → Cookies 检查是否有 `sb-customer-*` cookie

3. **检查客户端读取**：
   - 在 `AuthContext` 的 `getSession()` 中添加日志
   - 确认 session 是否被正确读取

## 立即验证步骤

1. **清除浏览器数据**：
   - 清除 `localhost:3000` 的所有 cookies 和 localStorage

2. **重新登录**：
   - 访问 `http://localhost:3000/login`
   - 点击 Google 登录

3. **查看日志**：
   - **服务器控制台**：应该看到 `[CUSTOMER AUTH CALLBACK]` 日志
   - **浏览器 Console**：检查是否有错误
   - **Network 标签**：确认 `/auth/callback` 返回 302 重定向

4. **检查 Cookie**：
   - DevTools → Application → Cookies → `http://localhost:3000`
   - 应该看到 `sb-customer-xxx-auth-token` 或类似名称的 cookie

5. **检查 AuthContext**：
   - 在 `AuthContext` 的 `useEffect` 中添加 `console.log` 查看 session 状态

## 如果仍然失败

### 临时解决方案：允许 customer app 读取无前缀 cookie

在 `packages/shared/src/supabase/server.ts` 中，临时允许 customer app 读取无前缀 cookie：

```typescript
if (cookie.name.startsWith('sb-') && 
    !cookie.name.includes('-customer-') && 
    !cookie.name.includes('-internal-')) {
  // 临时允许 customer app 也读取无前缀 cookie（用于调试）
  return true; // 改为 true，允许两个 app 都读取
}
```

**注意**：这只是临时方案，长期应该确保 cookie 前缀正确写入。
