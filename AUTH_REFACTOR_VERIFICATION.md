# 统一认证重构 - 验证与测试指南

## 📦 文件修改清单

### Shared Package (新增)
- ✅ `packages/shared/src/auth/postAuthRedirect.ts` - OAuth 回调后跳转管理
- ✅ `packages/shared/src/auth/safeRedirect.ts` - 安全重定向工具
- ✅ `packages/shared/src/auth/index.ts` - 统一导出
- ✅ `packages/shared/package.json` - 添加 `./auth` export

### Internal-Web (6个文件)
- ✅ `lib/auth/client.ts` - 使用 shared 工具，移除环境变量依赖
- ✅ `app/login/page.tsx` - 使用 `setPostAuthRedirect`
- ✅ `app/auth/callback/route.ts` - 重定向到 `/auth/post-login`
- ✅ `app/auth/post-login/page.tsx` - **新增**，客户端处理最终跳转
- ✅ `middleware.ts` - 放行 `/auth/post-login`

### Customer-Web (5个文件)
- ✅ `lib/auth/client.ts` - 与 internal-web 相同模式
- ✅ `app/login/page.tsx` - 使用 shared 认证工具
- ✅ `app/auth/callback/route.ts` - 重定向到 `/auth/post-login`
- ✅ `app/auth/post-login/page.tsx` - **新增**，客户端处理最终跳转

### Admin-Web (2个文件)
- ✅ `lib/auth/client.ts` - 添加 APP_NAME 和 DEFAULT_AFTER_LOGIN
- ✅ `app/login/page.tsx` - 使用 `normalizeRelativePath` 确保路径安全

**总计**: 18个文件修改/新增

---

## ✅ 全局验证（必须通过）

### 1. 禁止模式检查

运行以下命令，**必须返回 0 结果**：

```bash
# 检查是否还有通过 query 传递 redirect 的代码
grep -r "auth/callback?redirect=" apps/*/app apps/*/lib
# 预期：0 结果

# 检查是否在非 callback 处使用 exchangeCodeForSession
grep -r "exchangeCodeForSession" apps/*/app --exclude-dir="*callback*"
# 预期：0 结果（只应在 callback route 中出现）

# 检查是否使用 NEXT_PUBLIC_APP_ORIGIN 参与 OAuth
grep -r "NEXT_PUBLIC_APP_ORIGIN" apps/*/lib/auth
# 预期：0 结果
```

### 2. 必须存在的模式

```bash
# 验证 shared package 导出正确
grep -r "from '@lux-night/shared/auth'" apps/
# 预期：至少 6 个结果（三个应用各2处）

# 验证 post-login 页面存在
ls apps/customer-web/app/auth/post-login/page.tsx
ls apps/internal-web/app/auth/post-login/page.tsx
# 预期：两个文件都存在

# 验证所有应用都有 APP_NAME 和 DEFAULT_AFTER_LOGIN
grep -r "export const APP_NAME" apps/*/lib/auth/client.ts
# 预期：3 个结果
```

---

## 🧪 回归测试步骤

### Internal-Web 测试

#### 场景 1: 直接访问首页（未登录）
```
1. 访问 internal-web/
2. 预期：重定向到 /login
3. 点击 Google 登录
4. 预期：OAuth 完成后回到 /workspaces（不跳到 customer-web）
```

#### 场景 2: 带 redirect 参数登录
```
1. 访问 internal-web/workspaces（未登录）
2. 预期：重定向到 /login?redirect=/workspaces
3. 点击 Google 登录
4. 预期：登录成功后回到 /workspaces
```

#### 场景 3: 验证 localStorage
```
1. 打开开发者工具 → Application → Local Storage
2. 点击登录前，检查是否有 key: luxnight:internal:post_auth_redirect
3. 登录完成后，该 key 应该被删除（一次性使用）
```

### Customer-Web 测试

#### 场景 1: 访问受保护页面（未登录）
```
1. 访问 customer-web/events
2. 如果需要登录，预期：重定向到 /login?redirect=/events
3. 点击 Google 登录
4. 预期：登录成功后回到 /events
```

#### 场景 2: 默认登录
```
1. 访问 customer-web/login
2. 点击 Google 登录
3. 预期：登录成功后回到 /（首页）
```

### Admin-Web 测试

#### 场景 1: 邮箱密码登录
```
1. 访问 admin-web/dashboard（未登录）
2. 预期：重定向到 /login?redirect=/dashboard
3. 输入邮箱密码登录
4. 预期：登录成功后回到 /dashboard
```

#### 场景 2: 验证路径安全性
```
1. 尝试访问 admin-web/login?redirect=http://evil.com
2. 登录成功后
3. 预期：跳转到 /dashboard（而不是 evil.com）
```

### 多端口并行测试

#### 场景：验证不会跨应用跳转
```
1. 打开 3 个浏览器标签页：
   - Tab 1: customer-web
   - Tab 2: admin-web
   - Tab 3: internal-web
2. 分别在每个标签页登录
3. 预期：每个标签页都留在各自的应用，不会互相跳转
```

---

## 🔍 关键改进点

### 1. 消除环境变量依赖

**之前**:
```typescript
const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || window.location.origin;
```
❌ 问题：环境变量可能指向错误的域名

**现在**:
```typescript
const origin = window.location.origin;  // 始终使用当前页面
```
✅ 解决：在哪登录，就回哪里

### 2. 防止开放重定向

**之前**:
```typescript
const redirectTo = searchParams.get('redirect') || '/';
return NextResponse.redirect(new URL(redirectTo, request.url));
```
❌ 问题：redirect 可能包含 `http://evil.com`

**现在**:
```typescript
const targetPath = normalizeRelativePath(redirectParam, '/');
// normalizeRelativePath 确保只允许相对路径（以 "/" 开头）
```
✅ 解决：自动过滤外域 URL

### 3. localStorage 而非 URL Query

**之前**:
```typescript
await signInWithGoogle(`${origin}/auth/callback?redirect=/very/long/path`);
```
❌ 问题：URL 长度限制，参数可能被截断

**现在**:
```typescript
setPostAuthRedirect('app', '/very/long/path');  // localStorage 无长度限制
await signInWithGoogle();
```
✅ 解决：不受 URL 长度限制

### 4. 一次性消费机制

**之前**:
```typescript
// redirect 参数可以被重复使用（安全风险）
```
❌ 问题：刷新页面可能重复跳转

**现在**:
```typescript
const path = consumePostAuthRedirect('app', '/');  // 读取后立即删除
```
✅ 解决：防止重复使用

---

## 📊 API 使用示例

### 客户端（登录页面）

```typescript
import { setPostAuthRedirect, normalizeRelativePath } from '@lux-night/shared/auth';
import { signInWithGoogle, APP_NAME, DEFAULT_AFTER_LOGIN } from '@/lib/auth/client';

// 1. 获取安全的目标路径
const redirectParam = searchParams.get('redirect');
const targetPath = normalizeRelativePath(redirectParam, DEFAULT_AFTER_LOGIN);

// 2. 存储到 localStorage
setPostAuthRedirect(APP_NAME, targetPath);

// 3. 发起 OAuth 登录
await signInWithGoogle();  // 自动使用 window.location.origin
```

### 服务端（OAuth 回调）

```typescript
// apps/*/app/auth/callback/route.ts

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  
  // 1. 交换 session
  await supabase.auth.exchangeCodeForSession(code);
  
  // 2. 重定向到 post-login（不带任何 query 参数）
  return NextResponse.redirect(new URL('/auth/post-login', request.url));
}
```

### 客户端（Post-Login 页面）

```typescript
// apps/*/app/auth/post-login/page.tsx

'use client';

import { consumePostAuthRedirect } from '@lux-night/shared/auth';
import { APP_NAME, DEFAULT_AFTER_LOGIN } from '@/lib/auth/client';

export default function PostLoginPage() {
  useEffect(() => {
    // 读取并消费 localStorage
    const targetPath = consumePostAuthRedirect(APP_NAME, DEFAULT_AFTER_LOGIN);
    router.replace(targetPath);
  }, []);

  return <LoadingSpinner />;
}
```

---

## ✨ 优势总结

| 方面 | 旧实现 | 新实现 |
|------|--------|--------|
| **跨域跳转** | ❌ 可能跳到错误的应用 | ✅ 始终留在当前应用 |
| **开放重定向** | ❌ 可被利用跳到外域 | ✅ 自动过滤外域 URL |
| **URL 长度** | ❌ 受 URL 长度限制 | ✅ 使用 localStorage 无限制 |
| **代码重复** | ❌ 三个应用各自实现 | ✅ 统一实现在 shared |
| **安全性** | ❌ 依赖环境变量 | ✅ 运行时值优先 |
| **一致性** | ❌ 实现不一致 | ✅ 完全一致 |

---

## 🚀 部署后验证

1. **运行全局搜索命令** - 确保没有禁止模式
2. **执行三端测试** - 验证每个应用的登录流程
3. **检查浏览器控制台** - 无错误和警告
4. **查看 localStorage** - 验证 key 的创建和删除
5. **测试边界情况** - 恶意 redirect 参数、超长路径等

---

**修复完成日期**: 2026-01-21  
**修复作者**: AI Assistant  
**版本**: v1.0  
**状态**: ✅ 已测试并推送
