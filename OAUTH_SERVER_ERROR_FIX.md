# OAuth server_error 问题修复报告

## 📋 问题描述

**症状**: Internal-web 的 `/auth/callback` 收到来自 OAuth 的 `server_error`

**日志**:
```
[INTERNAL AUTH CALLBACK] Error from OAuth: server_error
```

---

## 🔍 根本原因分析

### 问题 1: 额外的 OAuth 查询参数 ❌

**文件**: `apps/internal-web/lib/auth/client.ts` (第32-35行)

```typescript
// ❌ 有问题的代码
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo,
    queryParams: {
      access_type: 'offline',    // 额外参数
      prompt: 'consent',         // 额外参数
    },
  },
});
```

**问题**:
- `access_type: 'offline'` - 要求 Google 返回 refresh token
- `prompt: 'consent'` - 强制用户重新授权

这些额外参数可能导致：
1. Supabase Auth 与 Google OAuth 之间的流程不匹配
2. PKCE 验证失败（state/verifier 不一致）
3. Redirect URI 不匹配（额外参数改变了回调 URL）

**解决方案**: 使用最简参数，只传递 `provider` 和 `redirectTo`

### 问题 2: 错误日志不完整 ❌

**文件**: `apps/internal-web/app/auth/callback/route.ts`

```typescript
// ❌ 旧代码只打印 error
console.error('[INTERNAL AUTH CALLBACK] Error from OAuth:', error);
```

**问题**:
- 没有打印 `error_description`（最重要的诊断信息）
- 没有打印完整的 query 参数
- 用户无法看到错误详情

**解决方案**: 打印完整的 OAuth 回调参数，并创建友好的错误页面

---

## ✅ 修复内容

### 修复 1: 移除额外的 OAuth 参数

**文件**: `apps/internal-web/lib/auth/client.ts`

```typescript
// ✅ 修复后
export async function signInWithGoogle(): Promise<void> {
  const supabase = createClient();
  const redirectTo = getOAuthRedirectTo(window.location.origin);
  
  console.log('[Google OAuth] Initiating with redirectTo:', redirectTo);
  
  // 使用最简参数，不添加额外的 queryParams
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,  // 仅传递 redirectTo
    },
  });

  if (error) {
    console.error('[Google OAuth] Error:', error);
    throw error;
  }
}
```

**改进**:
- ✅ 移除 `queryParams`
- ✅ 添加日志记录 redirectTo
- ✅ 简化 OAuth 流程

### 修复 2: 增强错误日志

**文件**: `apps/internal-web/app/auth/callback/route.ts`

```typescript
// ✅ 修复后
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  const state = requestUrl.searchParams.get('state');

  // 完整的调试日志
  console.log('[INTERNAL AUTH CALLBACK] ========================================');
  console.log('[INTERNAL AUTH CALLBACK] Full callback URL:', request.url);
  console.log('[INTERNAL AUTH CALLBACK] Query parameters:', {
    code: code ? '✅ Present' : '❌ Missing',
    error: error || null,
    error_description: errorDescription || null,
    state: state ? '✅ Present' : '❌ Missing',
  });
  console.log('[INTERNAL AUTH CALLBACK] ========================================');
  
  // ... 错误处理
}
```

**改进**:
- ✅ 打印完整的回调 URL
- ✅ 打印所有 OAuth 参数（error, error_description, code, state）
- ✅ 使用清晰的格式化输出

### 修复 3: 创建友好的错误页面

**文件**: `apps/internal-web/app/auth/error/page.tsx` (**新增**)

**功能**:
- ✅ 显示用户友好的错误信息
- ✅ 显示技术详情（开发/预览环境）
- ✅ 提供"重试登录"按钮
- ✅ 提供"返回登录页"链接
- ✅ 在客户端 console 打印错误详情

**错误类型映射**:
| Error Code | Title | Message |
|------------|-------|---------|
| `server_error` | Server Error | The authentication server encountered an error |
| `missing_code` | Missing Code | OAuth callback did not receive authorization code |
| `exchange_failed` | Exchange Failed | Failed to exchange code for session |
| `access_denied` | Access Denied | You denied the authentication request |

**截图示例**:
```
🔧

Server Error

The authentication server encountered an error. 
This might be a temporary issue.

┌─────────────────────────────────────┐
│ Technical Details                   │
│ Error Code: server_error            │
│ Description: Invalid PKCE verifier  │
└─────────────────────────────────────┘

[   Try Again   ]

← Back to Login Page
```

### 修复 4: 更新 Middleware

**文件**: `apps/internal-web/middleware.ts`

```typescript
// ✅ 添加 /auth/error 到白名单
if (
  pathname === '/login' ||
  pathname.startsWith('/auth/callback') ||
  pathname === '/auth/callback' ||
  pathname === '/auth/post-login' ||
  pathname === '/auth/error' ||        // 新增
  pathname.startsWith('/onboarding/') ||
  pathname === '/join' ||
  pathname === '/error'
) {
  return response;
}
```

### 修复 5: 增强所有错误处理

**在 callback route 中，所有错误都重定向到 `/auth/error`**:

1. **OAuth 返回错误**:
   ```typescript
   if (error) {
     const errorPageUrl = new URL('/auth/error', request.url);
     errorPageUrl.searchParams.set('error', error);
     if (errorDescription) {
       errorPageUrl.searchParams.set('error_description', errorDescription);
     }
     return NextResponse.redirect(errorPageUrl);
   }
   ```

2. **缺少 code 参数**:
   ```typescript
   if (!code) {
     const errorPageUrl = new URL('/auth/error', request.url);
     errorPageUrl.searchParams.set('error', 'missing_code');
     errorPageUrl.searchParams.set('error_description', 'OAuth callback did not receive a code parameter');
     return NextResponse.redirect(errorPageUrl);
   }
   ```

3. **Session 交换失败**:
   ```typescript
   if (exchangeError) {
     console.error('[INTERNAL AUTH CALLBACK] ❌ Exchange error:', exchangeError);
     console.error('[INTERNAL AUTH CALLBACK] ❌ Error details:', JSON.stringify(exchangeError, null, 2));
     
     const errorPageUrl = new URL('/auth/error', request.url);
     errorPageUrl.searchParams.set('error', 'exchange_failed');
     errorPageUrl.searchParams.set('error_description', exchangeError.message);
     return NextResponse.redirect(errorPageUrl);
   }
   ```

---

## 📊 修改文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `apps/internal-web/lib/auth/client.ts` | 修改 | 移除 queryParams，添加日志 |
| `apps/internal-web/app/auth/callback/route.ts` | 修改 | 增强错误日志，重定向到错误页 |
| `apps/internal-web/app/auth/error/page.tsx` | **新增** | 友好的错误页面 |
| `apps/internal-web/middleware.ts` | 修改 | 放行 `/auth/error` |

---

## 🧪 诊断步骤（用户需执行）

### Step 1: 清除浏览器缓存和 Cookie

```bash
# 清除 Supabase session
localStorage.clear()
sessionStorage.clear()
# 清除所有 Cookie
```

### Step 2: 尝试登录

1. 访问 internal-web/login
2. 点击 "Google 登录"
3. 观察浏览器 Console 输出：
   ```
   [Google OAuth] Initiating with redirectTo: https://your-domain.com/auth/callback
   ```

### Step 3: 如果仍然出现错误

查看错误页面显示的信息：

**如果看到**:
```
Error Code: server_error
Description: Invalid PKCE verifier
```

**可能的原因**:
1. Cookie 被阻止（第三方 Cookie 设置）
2. PKCE verifier 在 cookie 中丢失
3. Supabase Auth 配置问题

**如果看到**:
```
Error Code: server_error
Description: Redirect URI mismatch
```

**需要检查**:
1. Supabase Dashboard → Authentication → URL Configuration
2. 确保 Redirect URLs 包含: `https://your-internal-domain.com/auth/callback`

### Step 4: 查看服务器日志

在 Vercel 部署日志中查找：

```
[INTERNAL AUTH CALLBACK] ========================================
[INTERNAL AUTH CALLBACK] Full callback URL: ...
[INTERNAL AUTH CALLBACK] Query parameters: {
  code: '❌ Missing',
  error: 'server_error',
  error_description: 'Actual error message here',  ← 这是关键！
  state: '✅ Present'
}
[INTERNAL AUTH CALLBACK] ========================================
```

**关键信息**: `error_description` 会告诉我们真实的错误原因

---

## 🎯 预期结果

### 成功流程

```
1. 用户点击 "Google 登录"
   ↓
2. Console: [Google OAuth] Initiating with redirectTo: https://domain.com/auth/callback
   ↓
3. Google OAuth 页面
   ↓
4. 回到 /auth/callback?code=xxx&state=yyy
   ↓
5. Server Log:
   [INTERNAL AUTH CALLBACK] Query parameters: {
     code: '✅ Present',
     error: null,
     state: '✅ Present'
   }
   ↓
6. 重定向到 /auth/post-login
   ↓
7. 最终跳转到 /workspaces ✅
```

### 失败流程（现在有详细信息）

```
1. 用户点击 "Google 登录"
   ↓
2. Google OAuth 页面
   ↓
3. 回到 /auth/callback?error=server_error&error_description=...
   ↓
4. Server Log:
   [INTERNAL AUTH CALLBACK] ❌ Error from OAuth: server_error
   [INTERNAL AUTH CALLBACK] ❌ Error description: [具体原因]
   ↓
5. 重定向到 /auth/error?error=server_error&error_description=...
   ↓
6. 用户看到友好的错误页面，包含：
   - 错误标题和描述
   - 技术详情（error_description）
   - "Try Again" 按钮
   - "Back to Login Page" 链接
```

---

## 🔑 常见 server_error 原因和解决方案

### 1. PKCE Verifier Missing/Invalid

**原因**: Cookie 被阻止或丢失

**解决方案**:
- 检查浏览器是否阻止第三方 Cookie
- 确保 Supabase client 正确配置 cookie 处理
- 检查 domain 设置（localhost vs production）

### 2. Redirect URI Mismatch

**原因**: Supabase Dashboard 配置的 Redirect URL 不匹配

**解决方案**:
- 在 Supabase Dashboard → Authentication → URL Configuration
- 添加: `https://your-domain.vercel.app/auth/callback`
- 添加: `http://localhost:3001/auth/callback` (开发环境)

### 3. Invalid OAuth State

**原因**: State 参数不一致（可能是 CSRF 保护）

**解决方案**:
- 清除浏览器缓存和 Cookie
- 确保没有中间代理修改 URL 参数

### 4. OAuth 配置错误

**原因**: Google OAuth Client 配置问题

**解决方案**:
- 检查 Google Cloud Console 中的 OAuth Redirect URIs
- 确保包含 Supabase 的回调 URL：`https://<your-project>.supabase.co/auth/v1/callback`

---

## 📝 下一步行动

1. **部署并测试**:
   - Push 到 Vercel
   - 尝试登录
   - 观察错误页面显示的 `error_description`

2. **截图并提供给我**:
   - 错误页面的完整截图
   - 浏览器 Console 的日志
   - Vercel 部署日志中的 `[INTERNAL AUTH CALLBACK]` 输出

3. **根据 error_description 进行针对性修复**:
   - 如果是 PKCE 问题 → 检查 cookie 配置
   - 如果是 Redirect URI 问题 → 更新 Supabase Dashboard
   - 如果是其他问题 → 提供日志，我会给出具体解决方案

---

## 🎉 优势总结

| 方面 | 修复前 | 修复后 |
|------|--------|--------|
| **错误信息** | ❌ 只有 error code | ✅ 完整的 error_description |
| **用户体验** | ❌ 跳转到登录页，不知道什么错了 | ✅ 友好的错误页面，清楚说明问题 |
| **调试能力** | ❌ 无法诊断问题 | ✅ 完整的日志和参数输出 |
| **操作选项** | ❌ 只能手动返回 | ✅ 提供"重试"和"返回"按钮 |
| **OAuth 复杂度** | ❌ 额外的 queryParams | ✅ 最简参数，减少出错 |

---

**修复完成日期**: 2026-01-21  
**修复作者**: AI Assistant  
**版本**: v1.0  
**状态**: ✅ 待部署验证  
**关键**: 需要用户提供 `error_description` 的真实内容来进行最终诊断
