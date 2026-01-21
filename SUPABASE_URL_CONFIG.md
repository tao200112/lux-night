# Supabase URL 配置指南

## 问题说明

**问题**: Supabase 的 **Site URL** 只能配置一个，但我们有两个独立的 Next.js 应用：
- Customer App: `http://localhost:3000`
- Internal App: `http://localhost:3001`

这会导致其中一个应用的 OAuth 登录无法正确跳转。

## 解决方案

### 方案 1: 使用环境变量区分 Site URL（推荐）

**步骤**:

1. **配置 Site URL**:
   - 将 Site URL 设置为 Customer App 的 URL: `http://localhost:3000`
   - 或者设置为 Internal App 的 URL: `http://localhost:3001`
   - **注意**: 这个 URL 主要用于默认跳转和邮件模板，实际跳转依赖 `redirectTo` 参数

2. **配置 Redirect URLs**:
   删除错误的 URL（包含 `(生产)` 后缀的），只保留正确的 URL：
   ```
   http://localhost:3000/auth/callback
   http://localhost:3001/auth/callback
   https://app.example.com/auth/callback
   https://internal.example.com/auth/callback
   ```

3. **确保代码中显式指定 `redirectTo`**:
   - 我们的代码已经在 `signInWithOAuth` 中显式指定了 `redirectTo`
   - 这确保了 OAuth 回调会跳转到正确的应用，而不是 Site URL

### 方案 2: 本地开发时使用同一端口（临时方案）

如果本地开发时希望两个应用在同一端口，可以使用路由前缀：
- Customer: `http://localhost:3000/`
- Internal: `http://localhost:3000/internal/`

但这需要修改路由结构和中间件，不推荐。

## 当前代码检查

### Internal App (`apps/internal-web/lib/auth/client.ts`)
```typescript
export async function signInWithGoogle(redirectTo?: string): Promise<void> {
  const supabase = createClient();
  
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTo || `${window.location.origin}/auth/callback`,
    },
  });
  // ...
}
```

**✅ 正确**: 代码已经使用了 `window.location.origin`，会自动使用当前应用的 origin。

### Customer App (`apps/customer-web/lib/auth/client.ts`)
```typescript
const getCallbackUrl = () => {
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || 
                 (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  return `${origin}/auth/callback`;
};
```

**✅ 正确**: 代码也正确配置了回调 URL。

## 配置步骤

### 1. 修复 Supabase Dashboard 配置

1. 登录 Supabase Dashboard
2. 进入 **Authentication** → **URL Configuration**
3. **Site URL**: 设置为 `http://localhost:3000`（Customer App 的 URL）
4. **Redirect URLs**: 删除包含 `(生产)` 的 URL，确保只有以下 URL：
   ```
   http://localhost:3000/auth/callback
   http://localhost:3001/auth/callback
   https://app.example.com/auth/callback
   https://internal.example.com/auth/callback
   ```
5. 点击 **Save changes**

### 2. 验证 OAuth 配置

1. 确保 **Authentication** → **Providers** → **Google** 已启用
2. 检查 Google OAuth Client ID 和 Secret 是否正确配置

### 3. 测试登录流程

**Customer App** (`http://localhost:3000`):
1. 访问登录页面
2. 点击 "Continue with Google"
3. 应该跳转到 Google 登录页面
4. 登录成功后应该跳转回 `http://localhost:3000/auth/callback`

**Internal App** (`http://localhost:3001`):
1. 访问登录页面
2. 点击 "Continue with Google"
3. 应该跳转到 Google 登录页面
4. 登录成功后应该跳转回 `http://localhost:3001/auth/callback`

## 常见问题

### Q: 为什么 Internal App 的 Google 登录无法跳转？
A: 检查以下内容：
1. Redirect URLs 中是否包含 `http://localhost:3001/auth/callback`
2. `signInWithOAuth` 的 `redirectTo` 参数是否正确传递
3. 浏览器控制台是否有错误信息

### Q: Site URL 设置为 Customer App，Internal App 会有问题吗？
A: 不会。Site URL 主要用于：
- 默认跳转（当没有指定 `redirectTo` 时）
- 邮件模板中的变量

我们的代码已经显式指定了 `redirectTo`，所以不会受到影响。

### Q: 生产环境如何配置？
A: 
1. **Site URL**: 设置为 Customer App 的生产 URL，例如 `https://app.example.com`
2. **Redirect URLs**: 添加两个生产 URL：
   - `https://app.example.com/auth/callback`
   - `https://internal.example.com/auth/callback`

## 调试技巧

1. **检查浏览器控制台**: 查看是否有 OAuth 相关错误
2. **检查 Network 标签**: 查看 OAuth 请求的 `redirectTo` 参数是否正确
3. **检查 Supabase 日志**: 在 Supabase Dashboard 中查看 Authentication 日志
4. **验证 Redirect URL**: 确保 Supabase Dashboard 中的 Redirect URLs 列表包含实际使用的 URL

## 参考文档

- [Supabase OAuth Configuration](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
