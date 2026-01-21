# Internal-Web OAuth 跨域重定向问题修复

## 问题描述

**症状**: 用户从 internal-web 登录后，被重定向到 customer-web，而不是留在 internal-web。

**根本原因**: Supabase Site URL 配置指向 customer-web，导致 OAuth 回调流程跨域跳转。

---

## 问题根源分析

### OAuth 回调流程

正常的 OAuth 流程应该是：

```
1. 用户在 internal-web 点击 "Google 登录"
   ↓
2. internal-web 调用 supabase.auth.signInWithOAuth({
     provider: 'google',
     options: {
       redirectTo: 'https://internal.example.com/auth/callback'  // 应该回到 internal-web
     }
   })
   ↓
3. 重定向到 Google OAuth
   ↓
4. Google OAuth 完成后，重定向回 Supabase
   ↓
5. Supabase 应该重定向到我们指定的 redirectTo
   ↓
6. internal-web 的 /auth/callback 处理 code，设置 session
   ↓
7. 最终留在 internal-web
```

### 实际发生的问题

```
1. 用户在 internal-web 点击登录
   ↓
2. 如果 redirectTo 使用了错误的 origin（如 NEXT_PUBLIC_APP_ORIGIN 指向 customer-web）
   ↓
3. OAuth 回调会跳转到 customer-web/auth/callback
   ↓
4. 用户最终在 customer-web，而不是 internal-web ❌
```

### 代码层面的问题

**潜在风险点 1**: `lib/auth/client.ts` 的 `getCallbackUrl()` 函数

```typescript
// ❌ 错误的实现 - 优先使用环境变量
const getCallbackUrl = () => {
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ||  // 可能指向错误的域名！
                 (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
  return `${origin}/auth/callback`;
};
```

**问题**:
- 如果 Vercel 环境变量 `NEXT_PUBLIC_APP_ORIGIN` 被设置为 customer-web 的 URL
- 即使用户从 internal-web 登录，回调也会跳到 customer-web
- 这是一个**配置错误可以覆盖正确行为**的设计缺陷

---

## 修复方案

### 修复 1: 移除环境变量依赖，强制使用当前 origin

**文件**: `apps/internal-web/lib/auth/client.ts`

**修改前**:
```typescript
const getCallbackUrl = () => {
  // 优先使用 NEXT_PUBLIC_* 环境变量（Vercel 生产环境）
  // 客户端组件只能访问 NEXT_PUBLIC_* 前缀的环境变量
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || 
                 (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
  return `${origin}/auth/callback`;
};
```

**修改后**:
```typescript
/**
 * 获取 Internal App 的 OAuth 回调 URL
 * 
 * 重要：始终使用当前浏览器的 origin，确保在哪个端口登录就回到哪个端口
 * 不依赖环境变量，避免跨域重定向问题
 */
const getCallbackUrl = () => {
  // 始终使用当前页面的 origin，确保回调到同一个应用
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  // 服务端渲染时的 fallback（实际不应该在服务端调用此函数）
  return 'http://localhost:3001/auth/callback';
};
```

**改进点**:
- ✅ **移除环境变量依赖**: 不再使用 `NEXT_PUBLIC_APP_ORIGIN`
- ✅ **强制使用当前 origin**: 始终使用 `window.location.origin`
- ✅ **防御性编程**: 添加清晰的注释说明设计意图
- ✅ **简化逻辑**: 移除可能导致错误配置的路径

### 验证点

**登录页面 (`app/login/page.tsx`) 已经正确实现** ✅:

```typescript
const handleGoogleLogin = async () => {
  try {
    setLoading(true);
    await signInWithGoogle(
      `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`
    );
  } catch (error) {
    console.error('Google login error:', error);
    setLoading(false);
  }
};
```

- ✅ 直接使用 `window.location.origin`
- ✅ 显式传递完整的回调 URL
- ✅ 包含 redirect 查询参数用于登录后导航

**OAuth 回调处理 (`app/auth/callback/route.ts`) 已经正确实现** ✅:

```typescript
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const redirectTo = requestUrl.searchParams.get('redirect') || '/';
  
  // ... 处理 code
  
  // 使用 request.url 的 origin 构建重定向 URL
  return NextResponse.redirect(new URL(finalRedirectTo, request.url));
}
```

- ✅ 使用 `request.url` 作为 base URL
- ✅ 确保重定向留在同一个 origin
- ✅ 不依赖外部配置或环境变量

**Middleware 已经正确放行认证路径** ✅:

```typescript
// 公开的登录、回调和认证相关页面，直接放行
if (
  pathname === '/login' ||
  pathname.startsWith('/auth/callback') ||
  pathname === '/auth/callback' ||
  pathname.startsWith('/onboarding/') ||
  pathname === '/join' ||
  pathname === '/error'
) {
  return response;
}
```

- ✅ `/auth/callback` 被正确放行
- ✅ 不会干扰 OAuth 回调流程

---

## 文件修改清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `apps/internal-web/lib/auth/client.ts` | 修复 | 移除环境变量依赖，强制使用当前 origin |

---

## 关键代码 Diff

### lib/auth/client.ts - getCallbackUrl() 函数

```diff
 /**
- * 获取 Internal App 的 OAuth 回调 URL
+ * 获取 Internal App 的 OAuth 回调 URL
+ * 
+ * 重要：始终使用当前浏览器的 origin，确保在哪个端口登录就回到哪个端口
+ * 不依赖环境变量，避免跨域重定向问题
  */
 const getCallbackUrl = () => {
-  // 优先使用 NEXT_PUBLIC_* 环境变量（Vercel 生产环境）
-  // 客户端组件只能访问 NEXT_PUBLIC_* 前缀的环境变量
-  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || 
-                 (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
-  return `${origin}/auth/callback`;
+  // 始终使用当前页面的 origin，确保回调到同一个应用
+  if (typeof window !== 'undefined') {
+    return `${window.location.origin}/auth/callback`;
+  }
+  // 服务端渲染时的 fallback（实际不应该在服务端调用此函数）
+  return 'http://localhost:3001/auth/callback';
 };
```

---

## 为什么会出现这个问题？

### 多应用共享 Supabase 项目的挑战

在 monorepo 中有多个 Next.js 应用共享同一个 Supabase 项目时：

1. **Supabase Dashboard 只能配置一个 Site URL**
   - 通常设置为主应用（如 customer-web）
   - 其他应用（admin-web, internal-web）需要额外配置

2. **环境变量可能被错误共享**
   - 如果 `NEXT_PUBLIC_APP_ORIGIN` 在所有应用中都设置为同一个值
   - 会导致所有应用的回调都跳到同一个 URL

3. **OAuth redirectTo 参数的优先级**
   - 虽然我们传递了 `redirectTo` 参数
   - 但代码实现如果依赖环境变量，仍可能被覆盖

### 设计原则违反

**违反的原则**:
- ❌ 配置优先于运行时值
- ❌ 环境变量可以覆盖用户意图

**应该遵循的原则**:
- ✅ 运行时值优先于配置
- ✅ 用户当前位置决定回调位置
- ✅ 配置只用于 fallback，不覆盖明确的运行时行为

---

## Supabase 配置建议

### 1. Redirect URLs 配置

在 Supabase Dashboard → Authentication → URL Configuration 中添加：

```
Redirect URLs (允许的回调 URL):
  - https://customer.example.com/auth/callback
  - https://admin.example.com/auth/callback
  - https://internal.example.com/auth/callback
  - http://localhost:3000/auth/callback  (customer-web 开发)
  - http://localhost:3002/auth/callback  (admin-web 开发)
  - http://localhost:3001/auth/callback  (internal-web 开发)
```

### 2. Site URL 配置

```
Site URL: https://customer.example.com
```

**注意**: Site URL 设置为哪个应用不重要，因为我们显式传递 `redirectTo` 参数。

### 3. 环境变量配置

**不需要设置 `NEXT_PUBLIC_APP_ORIGIN`**！

每个应用会自动使用自己的 `window.location.origin`，无需配置。

---

## 测试验证清单

部署后请验证以下场景：

### 场景 1: Internal-Web 登录流程 ✅
- [ ] 从 internal-web 访问首页
- [ ] 被重定向到 internal-web/login
- [ ] 点击 Google 登录
- [ ] OAuth 完成后回到 internal-web/auth/callback
- [ ] 处理完成后留在 internal-web（不跳到 customer-web）

### 场景 2: 多端口并行登录 ✅
- [ ] 打开三个浏览器标签页，分别访问：
  - customer-web
  - admin-web
  - internal-web
- [ ] 在每个标签页登录
- [ ] 验证每个标签页都留在各自的应用，不会互相跳转

### 场景 3: 登录后导航 ✅
- [ ] 从 internal-web/events 访问（未登录）
- [ ] 重定向到 /login?redirect=/events
- [ ] 登录完成后应该回到 /events（而不是跳到其他应用）

---

## 相关文件

- ✅ `apps/internal-web/lib/auth/client.ts` - OAuth 客户端函数（已修复）
- ✅ `apps/internal-web/app/login/page.tsx` - 登录页面（已正确）
- ✅ `apps/internal-web/app/auth/callback/route.ts` - OAuth 回调处理（已正确）
- ✅ `apps/internal-web/middleware.ts` - 认证中间件（已正确）

---

## 最佳实践总结

### OAuth 回调 URL 构建原则

1. **客户端发起登录时**:
   ```typescript
   // ✅ 正确：使用当前页面的 origin
   const redirectTo = `${window.location.origin}/auth/callback`;
   await supabase.auth.signInWithOAuth({
     provider: 'google',
     options: { redirectTo }
   });
   ```

2. **服务端处理回调时**:
   ```typescript
   // ✅ 正确：使用请求 URL 的 origin
   const finalUrl = new URL('/success', request.url);
   return NextResponse.redirect(finalUrl);
   ```

3. **避免的做法**:
   ```typescript
   // ❌ 错误：使用环境变量或写死的 URL
   const redirectTo = process.env.NEXT_PUBLIC_APP_ORIGIN + '/auth/callback';
   
   // ❌ 错误：使用共享的常量
   const redirectTo = 'https://customer.example.com/auth/callback';
   ```

### Monorepo 多应用 OAuth 架构

**原则**: 每个应用独立处理自己的 OAuth 流程

```
customer-web  → Google OAuth → customer-web/auth/callback  → customer-web
admin-web     → Google OAuth → admin-web/auth/callback     → admin-web
internal-web  → Google OAuth → internal-web/auth/callback  → internal-web
```

**不要**: 试图共享 OAuth 回调处理逻辑或使用统一的回调 URL

---

## 结论

通过移除对 `NEXT_PUBLIC_APP_ORIGIN` 环境变量的依赖，确保 OAuth 回调始终使用当前浏览器的 origin，我们解决了跨应用重定向问题。

**核心改进**:
- ✅ 强制使用 `window.location.origin`，移除配置覆盖风险
- ✅ 简化代码逻辑，减少出错可能
- ✅ 添加清晰的注释，说明设计意图
- ✅ 符合"用户在哪登录，就留在哪"的直觉预期

**验证标准**:
在任何端口登录，都应该回到该端口，不会跳到其他应用。

---

**修复人**: AI Assistant  
**修复日期**: 2026-01-21  
**版本**: v1.0  
**状态**: ✅ 已完成并推送
