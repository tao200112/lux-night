# PKCE Code Verifier 错误修复

## 问题描述

**错误**: `PKCE code verifier not found in storage`

这个错误发生在 OAuth 回调时，服务端无法找到 PKCE code verifier。

## 问题根因

在 Next.js SSR 环境中，PKCE 流程涉及两个阶段：

1. **客户端启动 OAuth**（`signInWithGoogle`）:
   - 使用 `createBrowserClient`（客户端）
   - `createBrowserClient` 使用 **localStorage** 存储 PKCE code verifier
   - 存储在 `sb-<project-ref>-code-verifier` key

2. **服务端处理回调**（`/auth/callback/route.ts`）:
   - 使用 `createServerClient`（服务端）
   - `createServerClient` 使用 **cookie** 存储/读取 PKCE code verifier
   - 在 cookie 中查找 `sb-<project-ref>-code-verifier`

**问题**：
- 客户端在 localStorage 中存储 PKCE verifier
- 服务端在 cookie 中查找 PKCE verifier
- 找不到 → PKCE 错误

## 解决方案

### 使用客户端回调页面（已实现）

**关键变更**：
- **删除** `app/auth/callback/route.ts`（服务端路由）
- **创建** `app/auth/callback/page.tsx`（客户端页面）

**工作原理**：
1. 客户端启动 OAuth → PKCE verifier 存储在 localStorage
2. OAuth 回调 → 重定向到 `/auth/callback?code=xxx`
3. **客户端页面**加载 → 可以访问 localStorage
4. 调用 `supabase.auth.exchangeCodeForSession(code)` → 自动从 localStorage 读取 PKCE verifier
5. 交换成功 → 重定向到目标页面

**优点**：
- ✅ 客户端可以访问 localStorage
- ✅ PKCE verifier 始终可用
- ✅ 不需要额外的存储同步

**代码示例**：
```typescript
// app/auth/callback/page.tsx (客户端页面)
const supabase = createClient(); // 客户端 client
const { data, error } = await supabase.auth.exchangeCodeForSession(code);
// PKCE verifier 自动从 localStorage 读取
```

## 验证步骤

1. **清除浏览器数据**
   - DevTools → Application → Clear storage → Clear site data

2. **重新登录**
   - 访问 `http://localhost:3000/login`
   - 点击 Google 登录

3. **检查流程**
   - OAuth 跳转到 Google
   - Google 回调 → `/auth/callback?code=xxx`
   - **客户端页面**处理回调
   - 应该不再出现 PKCE 错误

4. **检查 Session**
   - 登录成功后应该跳转到首页
   - Console 中应该有 `[CUSTOMER AUTH CALLBACK (Client)] Session exchanged successfully`

## 预期结果

修复后：
- ✅ PKCE code verifier 从 localStorage 正确读取
- ✅ 不再出现 "PKCE code verifier not found" 错误
- ✅ OAuth 登录流程正常工作
- ✅ Session 正确创建和存储

## 注意事项

1. **路由优先级**：
   - Next.js 中 `page.tsx` 和 `route.ts` 不能同时存在
   - 我们选择使用 `page.tsx`（客户端页面）

2. **性能考虑**：
   - 客户端处理回调稍微增加了客户端负载
   - 但这是必要的，因为需要访问 localStorage

3. **安全考虑**：
   - PKCE verifier 存储在客户端 localStorage
   - 这是标准的 PKCE 流程，安全且推荐
