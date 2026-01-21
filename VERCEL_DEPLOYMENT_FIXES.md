# Vercel 部署修复计划

**修复日期**: 2024-12-19  
**修复范围**: 按 commit 分组，每个 commit 包含相关文件修改

---

## Commit 1: 修复客户端环境变量使用 (P0)

### 问题
- `apps/customer-web/lib/auth/client.ts` 使用 `process.env.CUSTOMER_APP_URL`（非 `NEXT_PUBLIC_*`）
- `apps/internal-web/lib/auth/client.ts` 使用 `process.env.MERCHANT_APP_URL`（非 `NEXT_PUBLIC_*`）
- 客户端组件无法访问非 `NEXT_PUBLIC_*` 环境变量

### 修复方案
使用 `NEXT_PUBLIC_*` 前缀或直接使用 `window.location.origin`（推荐）

### 修改文件

#### 1. `apps/customer-web/lib/auth/client.ts`

**修改前** (第 10-17 行):
```typescript
const getCallbackUrl = () => {
  const origin = process.env.CUSTOMER_APP_URL || 
                 process.env.NEXT_PUBLIC_APP_ORIGIN || 
                 (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  return `${origin}/auth/callback`;
};
```

**修改后**:
```typescript
const getCallbackUrl = () => {
  // 优先使用 NEXT_PUBLIC_* 环境变量（Vercel 生产环境）
  // 客户端组件只能访问 NEXT_PUBLIC_* 前缀的环境变量
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || 
                 (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  return `${origin}/auth/callback`;
};
```

---

#### 2. `apps/internal-web/lib/auth/client.ts`

**修改前** (第 13-20 行):
```typescript
const getCallbackUrl = () => {
  const origin = process.env.MERCHANT_APP_URL || 
                 process.env.NEXT_PUBLIC_APP_ORIGIN || 
                 (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
  return `${origin}/auth/callback`;
};
```

**修改后**:
```typescript
const getCallbackUrl = () => {
  // 优先使用 NEXT_PUBLIC_* 环境变量（Vercel 生产环境）
  // 客户端组件只能访问 NEXT_PUBLIC_* 前缀的环境变量
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || 
                 (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
  return `${origin}/auth/callback`;
};
```

### Commit Message
```
fix: use NEXT_PUBLIC_* env vars in client components for Vercel compatibility

- Replace CUSTOMER_APP_URL with NEXT_PUBLIC_APP_ORIGIN in customer-web
- Replace MERCHANT_APP_URL with NEXT_PUBLIC_APP_ORIGIN in internal-web
- Client components can only access NEXT_PUBLIC_* prefixed env vars
- Fixes OAuth callback URL issues in Vercel production builds
```

---

## Commit 2: 优化 Admin Middleware API 调用 (P0)

### 问题
- `apps/admin-web/middleware.ts` 在 middleware 中调用内部 API (`/api/me`)
- 可能导致循环请求或性能问题
- Edge Runtime 中不必要的网络请求

### 修复方案
直接在 middleware 中使用 Supabase 查询用户权限，避免内部 API 调用

### 修改文件

#### `apps/admin-web/middleware.ts`

**修改前** (第 150-230 行):
```typescript
// Phase 5: 检查 admin 权限
let isAdmin = false;
let adminCheckError: any = null;

try {
  const meCheckUrl = new URL('/api/me', request.url);
  const meCheckResponse = await fetch(meCheckUrl, {
    method: 'GET',
    headers: {
      cookie: request.headers.get('cookie') ?? '',
    },
  });

  const meCheckData = await meCheckResponse.json();
  // ... 处理响应
  isAdmin = meCheckData.roles?.is_admin === true;
} catch (error: any) {
  // ... 错误处理
}
```

**修改后**:
```typescript
// Phase 5: 检查 admin 权限（直接在 middleware 中查询，避免内部 API 调用）
let isAdmin = false;
let adminCheckError: any = null;

try {
  // 使用 service role key 创建 admin client（仅在服务器端）
  // 注意：middleware 在 Edge Runtime 运行，但 Supabase 查询是兼容的
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import('@supabase/supabase-js');
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // 查询用户是否为 admin
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError) {
      adminCheckError = {
        type: 'query_failed',
        error: profileError.message,
      };
      console.error('[ADMIN MIDDLEWARE] Profile query failed:', profileError);
    } else {
      isAdmin = profile?.is_admin === true;
    }
  } else {
    // Fallback: 如果没有 service role key，使用 anon key + RLS
    // 这需要 profiles 表的 RLS 策略允许用户查询自己的 is_admin 字段
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError) {
      adminCheckError = {
        type: 'query_failed',
        error: profileError.message,
      };
      console.error('[ADMIN MIDDLEWARE] Profile query failed:', profileError);
    } else {
      isAdmin = profile?.is_admin === true;
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[ADMIN MIDDLEWARE] Admin check result:', {
      isAdmin,
      adminCheckError: adminCheckError || 'NONE',
    });
  }
} catch (error: any) {
  adminCheckError = {
    type: 'exception',
    error: error.message,
  };
  console.error('[ADMIN MIDDLEWARE] Error checking admin status:', error);
  
  // 如果出错且在登录页，允许继续
  if (pathname === '/login') {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ADMIN MIDDLEWARE] On login page, allowing access despite error');
      console.log('[ADMIN MIDDLEWARE] ========================================');
    }
    return response;
  }
  
  // 否则重定向到登录页
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('reason', 'error');
  return NextResponse.redirect(url);
}
```

**注意**: 
- 如果使用 service role key，需要确保在 Vercel 环境变量中配置
- 如果使用 anon key + RLS，需要确保 RLS 策略允许用户查询自己的 `is_admin` 字段

### Commit Message
```
perf: optimize admin middleware to avoid internal API calls

- Replace /api/me fetch with direct Supabase query in middleware
- Use service role key for admin permission check (if available)
- Fallback to anon key + RLS if service role key not available
- Improves Edge Runtime performance and avoids circular requests
```

---

## Commit 3: 添加 Vercel 配置文件（可选）

### 目的
为每个 app 添加 `vercel.json` 以确保正确的构建配置

### 修改文件

#### 1. `apps/customer-web/vercel.json` (新建)

```json
{
  "buildCommand": "cd ../.. && pnpm --filter customer-web build",
  "installCommand": "cd ../.. && pnpm install",
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

#### 2. `apps/internal-web/vercel.json` (新建)

```json
{
  "buildCommand": "cd ../.. && pnpm --filter internal-web build",
  "installCommand": "cd ../.. && pnpm install",
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

#### 3. `apps/admin-web/vercel.json` (新建)

```json
{
  "buildCommand": "cd ../.. && pnpm --filter admin-web build",
  "installCommand": "cd ../.. && pnpm install",
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

**注意**: Vercel 通常可以自动检测 Next.js 项目，这些配置文件是可选的。如果使用 Root Directory 配置，可能不需要这些文件。

### Commit Message
```
chore: add vercel.json config files for monorepo builds

- Add vercel.json for customer-web, internal-web, admin-web
- Configure build commands for pnpm workspace
- Ensure correct install and build paths
```

---

## Commit 4: 更新 Next.js 配置以支持 Vercel（可选）

### 目的
确保 Next.js 配置优化 Vercel 部署

### 修改文件

#### `apps/customer-web/next.config.js`

**修改前**:
```javascript
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@lux-night/shared'],
}

module.exports = nextConfig
```

**修改后**:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@lux-night/shared'],
  // Vercel 优化配置
  output: 'standalone', // 可选：使用 standalone 输出以减小部署大小
}

module.exports = nextConfig
```

**注意**: `output: 'standalone'` 是可选的，Vercel 默认使用正确的输出模式。

### 同样更新 `apps/internal-web/next.config.js` 和 `apps/admin-web/next.config.js`

### Commit Message
```
chore: update Next.js config for Vercel optimization

- Add standalone output mode (optional)
- Ensure transpilePackages config is correct
- Optimize for Vercel deployment
```

---

## 修复执行顺序

1. **Commit 1** (必须): 修复客户端环境变量
2. **Commit 2** (必须): 优化 admin middleware
3. **Commit 3** (可选): 添加 vercel.json
4. **Commit 4** (可选): 更新 next.config.js

---

## 验证步骤

### 本地验证

```bash
# 1. 应用修复
git apply <commit-1.patch>
git apply <commit-2.patch>

# 2. 本地构建测试
cd apps/customer-web && pnpm build
cd apps/internal-web && pnpm build
cd apps/admin-web && pnpm build

# 3. 检查环境变量
# 确保 .env.local 中有 NEXT_PUBLIC_APP_ORIGIN
```

### Vercel 预览部署验证

1. 推送到 GitHub
2. 在 Vercel 创建三个项目（分别对应三个 app）
3. 配置 Root Directory 和 Build Command
4. 部署 Preview 环境
5. 验证 OAuth 登录流程

---

**下一步**: 查看 `VERCEL_DEPLOYMENT_GUIDE_*.md` 获取详细部署指南
