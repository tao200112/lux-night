# 统一认证流程重构报告

## 目标

将 OAuth 回调与 post-auth 跳转逻辑抽到 `packages/shared` 统一实现，消除三个应用各自实现导致的不一致和潜在bug。

---

## 一、Shared Package 新增模块

### 1.1 文件清单

| 文件 | 职责 |
|------|------|
| `packages/shared/src/auth/postAuthRedirect.ts` | OAuth 回调后的跳转路径管理（localStorage）|
| `packages/shared/src/auth/safeRedirect.ts` | 防开放重定向的安全工具函数 |
| `packages/shared/src/auth/index.ts` | 统一导出所有认证工具 |
| `packages/shared/package.json` | 添加 `./auth` export 配置 |

### 1.2 核心 API

#### postAuthRedirect.ts

```typescript
// 存储登录后要跳转的路径（localStorage）
export function setPostAuthRedirect(appName: string, path: string): void

// 读取并消费登录后的跳转路径（一次性使用）
export function consumePostAuthRedirect(appName: string, defaultPath: string): string

// 生成 OAuth 回调 URL（始终使用当前 origin）
export function getOAuthRedirectTo(origin: string): string

// 检查是否在浏览器环境
export function isBrowser(): boolean

// 清除存储的跳转路径
export function clearPostAuthRedirect(appName: string): void
```

**安全规则**:
- 只允许相对路径（以 "/" 开头）
- 禁止协议头（http://、https://）
- 禁止协议相对 URL（//example.com）
- 不符合规则时使用 fallback

#### safeRedirect.ts

```typescript
// 规范化相对路径，确保安全
export function normalizeRelativePath(path: string | null | undefined, fallback: string): string

// 从 URL 查询参数中提取安全的重定向路径
export function extractSafeRedirect(searchParams: URLSearchParams | string, paramName?: string, fallback?: string): string

// 验证路径是否为安全的相对路径
export function isSafeRelativePath(path: string | null | undefined): boolean
```

### 1.3 localStorage Key 规则

```typescript
key = `luxnight:${appName}:post_auth_redirect`

// 实例
luxnight:customer:post_auth_redirect   // customer-web
luxnight:internal:post_auth_redirect   // internal-web
luxnight:admin:post_auth_redirect      // admin-web
```

---

## 二、三端应用修改

### 2.1 Internal-Web

#### 修改文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `apps/internal-web/lib/auth/client.ts` | 重构 | 使用 shared 的 `getOAuthRedirectTo`，移除自定义 redirectTo 参数 |
| `apps/internal-web/app/login/page.tsx` | 修改 | 使用 `setPostAuthRedirect` 存储目标路径 |
| `apps/internal-web/app/auth/callback/route.ts` | 修改 | 重定向到 `/auth/post-login` 而不是直接跳转 |
| `apps/internal-web/app/auth/post-login/page.tsx` | 新增 | 客户端页面，读取 localStorage 并跳转 |
| `apps/internal-web/middleware.ts` | 修改 | 放行 `/auth/post-login` 路径 |

#### 关键代码变更

**lib/auth/client.ts**:
```typescript
// ❌ 旧实现
const getCallbackUrl = () => {
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || window.location.origin;
  return `${origin}/auth/callback`;
};

await signInWithGoogle(
  `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`
);

// ✅ 新实现
import { getOAuthRedirectTo } from '@lux-night/shared/auth';

export const APP_NAME = 'internal';
export const DEFAULT_AFTER_LOGIN = '/workspaces';

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = getOAuthRedirectTo(window.location.origin);
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
}
```

**app/login/page.tsx**:
```typescript
// ❌ 旧实现
const redirectTo = searchParams.get('redirect') || '/workspaces';
await signInWithGoogle(
  `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`
);

// ✅ 新实现
import { setPostAuthRedirect, normalizeRelativePath } from '@lux-night/shared/auth';
import { APP_NAME, DEFAULT_AFTER_LOGIN } from '@/lib/auth/client';

const redirectParam = searchParams.get('redirect');
const targetPath = normalizeRelativePath(redirectParam, DEFAULT_AFTER_LOGIN);

const handleGoogleLogin = async () => {
  setPostAuthRedirect(APP_NAME, targetPath);  // 存储到 localStorage
  await signInWithGoogle();                    // 回调到 /auth/callback（不带 query）
};
```

**app/auth/callback/route.ts**:
```typescript
// ❌ 旧实现
const redirectTo = requestUrl.searchParams.get('redirect') || '/';
return NextResponse.redirect(new URL(redirectTo, request.url));

// ✅ 新实现
// 不再读取 query 参数，重定向到 post-login 页面
return NextResponse.redirect(new URL('/auth/post-login', request.url));
```

**app/auth/post-login/page.tsx** (新增):
```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { consumePostAuthRedirect } from '@lux-night/shared/auth';
import { APP_NAME, DEFAULT_AFTER_LOGIN } from '@/lib/auth/client';

export default function PostLoginPage() {
  const router = useRouter();

  useEffect(() => {
    const targetPath = consumePostAuthRedirect(APP_NAME, DEFAULT_AFTER_LOGIN);
    router.replace(targetPath);  // 读取 localStorage 并跳转
  }, [router]);

  return <LoadingSpinner />;
}
```

### 2.2 Customer-Web

#### 修改文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `apps/customer-web/lib/auth/client.ts` | 重构 | 与 internal-web 相同的模式 |
| `apps/customer-web/app/login/page.tsx` | 修改 | 使用 shared 的认证工具 |
| `apps/customer-web/app/auth/callback/route.ts` | 修改 | 重定向到 `/auth/post-login` |
| `apps/customer-web/app/auth/post-login/page.tsx` | 新增 | 客户端页面处理最终跳转 |

#### 应用配置

```typescript
export const APP_NAME = 'customer';
export const DEFAULT_AFTER_LOGIN = '/';  // 首页
```

### 2.3 Admin-Web

#### 修改文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `apps/admin-web/lib/auth/client.ts` | 轻微修改 | 添加 APP_NAME 和 DEFAULT_AFTER_LOGIN 常量 |
| `apps/admin-web/app/login/page.tsx` | 轻微修改 | 使用 `normalizeRelativePath` 确保路径安全 |

#### 应用配置

```typescript
export const APP_NAME = 'admin';
export const DEFAULT_AFTER_LOGIN = '/dashboard';
```

#### 特殊说明

Admin-web 使用**邮箱密码登录**而非 OAuth，所以：
- ✅ 不需要 `/auth/callback` 流程
- ✅ 不需要 `/auth/post-login` 页面
- ✅ 登录成功后直接跳转到 `redirectTo`
- ✅ 但仍使用 `normalizeRelativePath` 确保路径安全

---

## 三、OAuth 流程对比

### 3.1 旧流程（有问题）

```
1. 用户在 internal-web 点击登录
   ↓
2. 调用 signInWithGoogle(`${origin}/auth/callback?redirect=/workspaces`)
   ↓
3. Google OAuth 完成
   ↓
4. Supabase 重定向到 internal-web/auth/callback?code=xxx&redirect=/workspaces
   ↓
5. callback route 读取 redirect 参数并跳转
   ↓
6. 问题：
   - redirect 参数可能包含外域 URL（开放重定向漏洞）
   - 如果 origin 使用了错误的环境变量，可能跳到 customer-web
   - URL query 参数过长可能被截断
```

### 3.2 新流程（已修复）

```
1. 用户在 internal-web 点击登录
   ↓
2. setPostAuthRedirect('internal', '/workspaces')  // 存储到 localStorage
   ↓
3. 调用 signInWithGoogle()
   redirectTo = getOAuthRedirectTo(window.location.origin)
   // 始终返回: https://internal.example.com/auth/callback（不带 query）
   ↓
4. Google OAuth 完成
   ↓
5. Supabase 重定向到 internal-web/auth/callback?code=xxx
   ↓
6. callback route: exchangeCodeForSession(code)
   redirect to: /auth/post-login
   ↓
7. post-login page (client):
   targetPath = consumePostAuthRedirect('internal', '/workspaces')
   // 从 localStorage 读取: /workspaces
   router.replace('/workspaces')
   ↓
8. 优势：
   ✅ 无外域跳转风险
   ✅ origin 始终使用 window.location.origin
   ✅ 路径不受 URL 长度限制
   ✅ 一次性消费（防止重复使用）
```

---

## 四、全局搜索验证

### 4.1 禁止的模式（已消除）

```bash
# ❌ 不应再存在这些模式

# 1. 通过 query 参数传递 redirect
grep -r "auth/callback?redirect=" apps/*/app apps/*/lib

# 2. 在非 callback 处理中使用 exchangeCodeForSession
grep -r "exchangeCodeForSession" apps/*/app --exclude="*/auth/callback/*"

# 3. 使用 NEXT_PUBLIC_APP_ORIGIN 生成 redirectTo
grep -r "NEXT_PUBLIC_APP_ORIGIN" apps/*/lib/auth
```

### 4.2 验证命令

<function_calls>
<invoke name="grep">
<parameter name="pattern">auth/callback\?redirect=