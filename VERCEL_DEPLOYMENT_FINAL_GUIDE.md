# Lux Night - Vercel 部署完整指南

**完成日期**: 2026-01-21  
**适用版本**: Next.js 15.1.4, React 19, pnpm monorepo  
**三个应用**: admin-web, customer-web, internal-web

---

## 📋 目录

- [A. 代码扫描结果](#a-代码扫描结果)
- [B. Vercel 部署配置](#b-vercel-部署配置)
- [C. Supabase 配置](#c-supabase-配置)
- [D. 最终检查清单](#d-最终检查清单)

---

## A. 代码扫描结果

### 1. 三个应用的关键文件清单

#### Admin-Web (管理后台)

| 类型 | 文件路径 | 说明 |
|------|---------|------|
| Package | `apps/admin-web/package.json` | Next.js 15.1.4, React 19 |
| Config | `apps/admin-web/next.config.js` | 标准配置，transpilePackages: @lux-night/shared |
| Middleware | `apps/admin-web/middleware.ts` | Session 刷新 + Admin 权限检查 |
| Auth Client | `apps/admin-web/lib/auth/client.ts` | 邮箱密码登录（非 OAuth） |
| Supabase Client | `apps/admin-web/lib/supabase/client.ts` | Browser client |
| Supabase Server | `apps/admin-web/lib/supabase/server.ts` | Server client |
| Supabase Admin | `apps/admin-web/lib/supabase/admin.ts` | Service role client |

#### Customer-Web (顾客端)

| 类型 | 文件路径 | 说明 |
|------|---------|------|
| Package | `apps/customer-web/package.json` | Next.js 15.1.4, React 19, Stripe |
| Config | `apps/customer-web/next.config.js` | 标准配置，transpilePackages: @lux-night/shared |
| Middleware | `apps/customer-web/middleware.ts` | Session 刷新（简化版） |
| Auth Client | `apps/customer-web/lib/auth/client.ts` | Google/Apple OAuth |
| Callback | `apps/customer-web/app/auth/callback/route.ts` | OAuth 回调处理 |
| Post-Login | `apps/customer-web/app/auth/post-login/page.tsx` | 登录后跳转 |
| Stripe Webhook | `apps/customer-web/app/api/stripe/webhook/route.ts` | runtime='nodejs' |

#### Internal-Web (商户/员工端)

| 类型 | 文件路径 | 说明 |
|------|---------|------|
| Package | `apps/internal-web/package.json` | Next.js 15.1.4, React 19, qrcode |
| Config | `apps/internal-web/next.config.js` | 标准配置，transpilePackages: @lux-night/shared |
| Middleware | `apps/internal-web/middleware.ts` | Session 刷新 + Membership Gate |
| Auth Client | `apps/internal-web/lib/auth/client.ts` | Google/Apple OAuth |
| Callback | `apps/internal-web/app/auth/callback/route.ts` | OAuth 回调处理 |
| Post-Login | `apps/internal-web/app/auth/post-login/page.tsx` | Membership 检查 + 跳转 |
| Error Page | `apps/internal-web/app/auth/error/page.tsx` | OAuth 错误页面 |
| Invite Gate | `apps/internal-web/app/invite/page.tsx` | 邀请码门禁 |

### 2. 硬编码域名检查结果 ✅

**扫描结果**: ✅ **未发现硬编码域名**

所有应用都正确使用了：
- `window.location.origin` (客户端)
- `request.url` (服务端)
- 环境变量 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**没有使用**:
- ❌ `NEXT_PUBLIC_APP_ORIGIN` (已移除)
- ❌ `CUSTOMER_APP_URL`, `MERCHANT_APP_URL`, `ADMIN_APP_URL`
- ❌ 硬编码的 `http://localhost:3000` 等

**OAuth 回调 URL 生成**:
```typescript
// ✅ 正确的实现（来自 @lux-night/shared/auth）
export function getOAuthRedirectTo(origin: string): string {
  const cleanOrigin = origin.replace(/\/$/, '');
  return `${cleanOrigin}/auth/callback`;
}

// 使用方式
const redirectTo = getOAuthRedirectTo(window.location.origin);
```

### 3. Next.js 15 兼容性检查 ✅

#### useSearchParams + Suspense ✅

**所有使用 `useSearchParams()` 的页面都已包裹 Suspense**:

| 应用 | 页面 | 状态 |
|------|------|------|
| admin-web | `app/login/page.tsx` | ✅ 已包裹 |
| admin-web | `app/events/new/page.tsx` | ✅ 已包裹 |
| customer-web | `app/login/page.tsx` | ✅ 已包裹 |
| customer-web | `app/checkout/page.tsx` | ✅ 已包裹 |
| internal-web | `app/login/page.tsx` | ✅ 已包裹 |
| internal-web | `app/invite/page.tsx` | ✅ 已包裹 |
| internal-web | `app/join/page.tsx` | ✅ 已包裹 |
| internal-web | `app/error/page.tsx` | ✅ 已包裹 |
| internal-web | `app/auth/error/page.tsx` | ✅ 已包裹 |

**标准模式**:
```typescript
'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function PageContent() {
  const searchParams = useSearchParams();
  // ... 使用 searchParams
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <PageContent />
    </Suspense>
  );
}
```

#### Route Handlers Runtime ✅

**检查 API routes 的 runtime 声明**:

| 文件 | Runtime | 说明 |
|------|---------|------|
| `customer-web/app/api/stripe/webhook/route.ts` | `nodejs` | ✅ 显式声明，需要 Buffer |
| 其他 API routes | 默认 | ✅ Vercel 自动选择 nodejs |

**Stripe Webhook** (需要 Node.js runtime):
```typescript
// ✅ 正确
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  const event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  // ...
}
```

#### Middleware 检查 ✅

**所有 middleware 都符合 Edge Runtime 要求**:

| 应用 | Middleware 功能 | Edge 兼容性 |
|------|----------------|-------------|
| admin-web | Session 刷新 + RPC 调用 | ✅ 使用 Supabase client |
| customer-web | Session 刷新 | ✅ 最简实现 |
| internal-web | Session 刷新 + Membership 查询 | ✅ 使用 Supabase client |

**没有使用不兼容的 Node.js API**:
- ❌ fs, child_process, pg
- ❌ crypto (部分 API)
- ✅ 只使用 Supabase client (Edge 兼容)

### 4. 潜在问题和建议 ✅

#### ✅ 已修复的问题

1. **OAuth 跨域重定向** - 已修复，使用 `window.location.origin`
2. **Suspense 边界** - 已修复，所有 `useSearchParams` 都包裹
3. **Membership 检查** - 已修复，post-login 页面增加检查
4. **错误处理** - 已增强，友好的错误页面和日志

#### ⚠️ 需要注意的配置

**Environment Variables**:
- 每个 Vercel Project **必须独立设置** 环境变量
- **不要**在 Vercel Team/Organization 级别共享环境变量
- **不要**在 monorepo 根目录的 `.env` 文件中设置（会被忽略）

---

## B. Vercel 部署配置

### 前置要求

1. **Vercel Account**: 需要 Pro 或 Team 计划（支持 monorepo）
2. **GitHub Repository**: 已连接 `tao200112/lux-night`
3. **pnpm**: Vercel 会自动检测并使用 pnpm
4. **Node.js**: 20.x (Vercel 默认)

---

### B1. Admin-Web 部署配置

#### Vercel Project 设置

登录 Vercel Dashboard → 点击 "Add New" → "Project" → 选择 `lux-night` 仓库

**Project Name**: `lux-night-admin`

**Framework Preset**: Next.js

**Root Directory**: `apps/admin-web` ✅

**Build & Development Settings**:

| 设置 | 值 | 说明 |
|------|---|------|
| Framework Preset | Next.js | 自动检测 |
| Root Directory | `apps/admin-web` | ⚠️ 必须设置 |
| Build Command | `cd ../.. && pnpm install && pnpm --filter admin-web build` | ⚠️ 从 monorepo 根目录构建 |
| Output Directory | `.next` | Next.js 默认 |
| Install Command | `pnpm install` | Vercel 自动检测 |
| Node.js Version | 20.x | 默认 |

**简化版（推荐）**:

| 设置 | 值 |
|------|---|
| Root Directory | `apps/admin-web` |
| Build Command | 留空（让 Vercel 自动） |
| Install Command | 留空（让 Vercel 自动） |

Vercel 会自动执行：
```bash
cd <repo-root>
pnpm install
cd apps/admin-web
pnpm run build
```

#### Environment Variables

**Production + Preview 环境**:

```env
# Supabase (公开)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Supabase (服务端密钥)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Node 环境
NODE_ENV=production
```

**Development 环境** (可选):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NODE_ENV=development
```

**⚠️ 重要**: 
- **不需要** `NEXT_PUBLIC_APP_ORIGIN`（已移除）
- **不要**设置 `CUSTOMER_APP_URL` 等（会导致混淆）

#### Domains

**Production**:
- Primary: `admin.your-domain.com`
- 或: `lux-night-admin.vercel.app`

**Preview**:
- 自动生成: `lux-night-admin-git-<branch>.vercel.app`

---

### B2. Customer-Web 部署配置

#### Vercel Project 设置

**Project Name**: `lux-night-customer`

**Framework Preset**: Next.js

**Root Directory**: `apps/customer-web` ✅

**Build & Development Settings**:

| 设置 | 值 |
|------|---|
| Root Directory | `apps/customer-web` |
| Build Command | 留空（让 Vercel 自动） |
| Install Command | 留空（让 Vercel 自动） |

#### Environment Variables

**Production + Preview**:

```env
# Supabase (公开)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Supabase (服务端密钥)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Stripe (生产环境)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Node 环境
NODE_ENV=production
```

**Development** (可选):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Stripe (测试环境)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

NODE_ENV=development
```

#### Domains

**Production**:
- Primary: `app.your-domain.com` 或 `customer.your-domain.com`
- 或: `lux-night-customer.vercel.app`

**Preview**:
- 自动生成: `lux-night-customer-git-<branch>.vercel.app`

---

### B3. Internal-Web 部署配置

#### Vercel Project 设置

**Project Name**: `lux-night-internal`

**Framework Preset**: Next.js

**Root Directory**: `apps/internal-web` ✅

**Build & Development Settings**:

| 设置 | 值 |
|------|---|
| Root Directory | `apps/internal-web` |
| Build Command | 留空（让 Vercel 自动） |
| Install Command | 留空（让 Vercel 自动） |

#### Environment Variables

**Production + Preview**:

```env
# Supabase (公开)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Supabase (服务端密钥)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Node 环境
NODE_ENV=production
```

**Development** (可选):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NODE_ENV=development
```

#### Domains

**Production**:
- Primary: `internal.your-domain.com` 或 `merchant.your-domain.com`
- 或: `lux-night-internal.vercel.app`

**Preview**:
- 自动生成: `lux-night-internal-git-<branch>.vercel.app`

---

### B4. Monorepo 特殊配置

#### pnpm Workspace 配置 ✅

**Root `pnpm-workspace.yaml`** (已存在):
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Vercel 自动处理**:
- ✅ 检测到 `pnpm-lock.yaml`
- ✅ 使用 pnpm 安装依赖
- ✅ 正确处理 workspace 依赖 (`@lux-night/shared`)

#### 不需要 Turbo

当前项目**不使用 Turbo**，Vercel 会直接使用 pnpm 构建。

如果未来要使用 Turbo:
```bash
# 安装 Turbo
pnpm add -Dw turbo

# 创建 turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**"]
    }
  }
}
```

---

## C. Supabase 配置

### C1. 数据库 Schema ✅

**结论**: ✅ **不需要修改数据库 Schema**

当前 Schema 已完整支持三端应用：
- ✅ `profiles` - 用户资料
- ✅ `merchants` - 商户
- ✅ `merchant_members` - 商户成员
- ✅ `venues` - 场地
- ✅ `events` - 活动
- ✅ `ticket_types` - 票种
- ✅ `orders` - 订单
- ✅ `tickets` - 票据
- ✅ `users` - 管理员表
- ✅ `invites` - 邀请码

**RLS (Row Level Security)**: ✅ 已启用并正确配置

---

### C2. Supabase Authentication 配置

登录 Supabase Dashboard → 选择项目 → Authentication → URL Configuration

#### Site URL

**设置为 Customer-Web 的域名** (主应用):

```
https://app.your-domain.com
```

或（如果使用 Vercel 默认域名）:
```
https://lux-night-customer.vercel.app
```

**原因**: Site URL 是 Supabase Auth 的默认回调域名，设置为最常用的应用。

#### Redirect URLs (Allow List)

**必须添加所有三个应用的 `/auth/callback` URL**:

```
https://admin.your-domain.com/auth/callback
https://app.your-domain.com/auth/callback
https://internal.your-domain.com/auth/callback

https://lux-night-admin.vercel.app/auth/callback
https://lux-night-customer.vercel.app/auth/callback
https://lux-night-internal.vercel.app/auth/callback

http://localhost:3002/auth/callback
http://localhost:3000/auth/callback
http://localhost:3001/auth/callback
```

**⚠️ 重要**:
- 每个域名都必须包含完整的 `/auth/callback` 路径
- 包括生产域名、Vercel 预览域名、本地开发域名
- **不要**使用通配符（Supabase 不支持）

#### Preview Deployment URLs

**对于 Vercel Preview 部署**，有两种方案：

**方案 1**: 手动添加 Preview URL (不推荐)
- 每次创建 PR 都要手动添加 URL
- 维护成本高

**方案 2**: 使用 Vercel 集成 (推荐)
- Vercel 自动将 Preview URL 添加到 Supabase
- 需要在 Vercel Marketplace 安装 Supabase 集成

---

### C3. OAuth Provider 配置

#### Google OAuth

**Google Cloud Console 设置**:

1. 创建 OAuth 2.0 Client ID
2. Authorized redirect URIs:
   ```
   https://<your-project>.supabase.co/auth/v1/callback
   ```

3. 在 Supabase Dashboard → Authentication → Providers → Google:
   - 启用 Google Provider
   - 填入 Client ID 和 Client Secret

#### Apple OAuth

**Apple Developer Console 设置**:

1. 创建 Services ID
2. 配置 Return URLs:
   ```
   https://<your-project>.supabase.co/auth/v1/callback
   ```

3. 在 Supabase Dashboard → Authentication → Providers → Apple:
   - 启用 Apple Provider
   - 填入相关配置

---

### C4. Cookie Settings

**Supabase Auth Cookie 配置** (Supabase 自动处理):

| 设置 | 值 | 说明 |
|------|---|------|
| Cookie Name | `sb-<project>-auth-token` | Supabase 默认 |
| Domain | `.your-domain.com` | 需要跨子域共享 |
| Path | `/` | 所有路径 |
| Secure | `true` | 仅 HTTPS |
| SameSite | `Lax` | 允许跨域导航 |
| HttpOnly | `true` | 防止 XSS |

**⚠️ 跨子域 Cookie 共享**:

如果使用不同子域（`admin.example.com`, `app.example.com`, `internal.example.com`）:

1. **Cookie Domain 必须设置为** `.example.com` (注意前面的点)
2. **Supabase 会自动处理** Cookie Domain 设置
3. **不需要手动配置**（除非遇到问题）

**如果使用不同域名**（`admin-app.com`, `customer-app.com`）:
- ❌ Cookie **不能**跨域共享
- ✅ 每个应用独立管理 session
- ✅ 用户需要在每个应用分别登录（这是正常的）

---

## D. 最终检查清单

### D1. 部署前检查

#### 代码检查 ✅

- [x] 所有应用的 Next.js 版本一致（15.1.4）
- [x] 所有应用的 React 版本一致（19.0.0）
- [x] 没有硬编码的域名或 URL
- [x] 所有 `useSearchParams` 都包裹在 Suspense 中
- [x] Stripe webhook route 使用 `runtime='nodejs'`
- [x] Middleware 不使用不兼容的 Node.js API
- [x] 所有 TypeScript 错误已修复

#### Vercel 配置检查

**每个 Project**:
- [ ] Root Directory 设置正确
- [ ] Build Command 设置（或留空自动检测）
- [ ] 环境变量已添加（Production + Preview）
- [ ] 域名已配置（可选）

#### 环境变量检查

**必需的环境变量（所有应用）**:
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

**Customer-Web 额外需要**:
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`

**⚠️ 确认**:
- [ ] 每个 Project 的环境变量是独立设置的（不是共享的）
- [ ] Production 和 Preview 环境都设置了
- [ ] 没有设置 `NEXT_PUBLIC_APP_ORIGIN`（已弃用）

---

### D2. 部署后测试清单

#### Admin-Web 测试

**登录测试**:
- [ ] 访问 `https://admin.your-domain.com`
- [ ] 使用邮箱密码登录（不是 OAuth）
- [ ] 检查是否重定向到 `/dashboard`
- [ ] 确认 session 持久化（刷新页面不掉登录）

**权限测试**:
- [ ] 访问受保护页面（如 `/merchants`）
- [ ] Middleware 正确验证 admin 权限
- [ ] 非 admin 用户被拒绝访问

**登出测试**:
- [ ] 点击登出
- [ ] 确认重定向到 `/login`
- [ ] 尝试访问受保护页面，应被重定向

#### Customer-Web 测试

**OAuth 登录测试**:
- [ ] 访问 `https://app.your-domain.com/login`
- [ ] 点击 "Google 登录"
- [ ] 完成 Google OAuth 流程
- [ ] 确认回调到 `https://app.your-domain.com/auth/callback`
- [ ] 确认重定向到 `/auth/post-login`
- [ ] 最终进入首页 `/`

**Session 持久化测试**:
- [ ] 登录后刷新页面
- [ ] 确认仍然保持登录状态
- [ ] 关闭浏览器重新打开
- [ ] 确认 session 仍然有效

**Stripe 支付测试**:
- [ ] 选择活动和票种
- [ ] 进入 Checkout
- [ ] 完成支付（使用测试卡）
- [ ] 确认订单创建成功
- [ ] 检查 Stripe Webhook 是否正常工作

**跨域 Cookie 测试** (如果使用相同父域):
- [ ] 在 customer-web 登录
- [ ] 打开 internal-web
- [ ] 确认是否共享 session（取决于 cookie domain 设置）

#### Internal-Web 测试

**OAuth 登录测试**:
- [ ] 访问 `https://internal.your-domain.com/login`
- [ ] 点击 "Google 登录"
- [ ] 完成 Google OAuth 流程
- [ ] 确认回调到 `https://internal.your-domain.com/auth/callback`
- [ ] 确认重定向到 `/auth/post-login`

**Membership Gate 测试**:

**场景 1: 有 Membership 的用户**:
- [ ] 登录后检查浏览器 Console
- [ ] 应看到: `[PostLogin] Has membership, redirecting to: /workspaces`
- [ ] 确认进入 `/workspaces`（不要求邀请码）

**场景 2: 无 Membership 的用户**:
- [ ] 登录后检查浏览器 Console
- [ ] 应看到: `[PostLogin] No membership, redirecting to /invite`
- [ ] 确认进入 `/invite?reason=no_membership`
- [ ] 确认显示友好的提示信息
- [ ] 输入有效邀请码
- [ ] 确认成功加入 merchant
- [ ] 确认重定向到 `/workspaces`

**Middleware 保护测试**:
- [ ] 未登录时访问 `/workspaces`
- [ ] 应重定向到 `/login?redirect=/workspaces`
- [ ] 登录后（有 membership）
- [ ] 应回到 `/workspaces`

**OAuth 错误处理测试**:
- [ ] 触发 OAuth 错误（例如取消授权）
- [ ] 应看到友好的错误页面 `/auth/error`
- [ ] 确认显示错误详情（开发/预览环境）
- [ ] 点击 "Try Again" 按钮
- [ ] 确认返回登录页

---

### D3. 跨应用测试

#### 独立部署测试

**测试目标**: 确认三个应用完全独立，不互相干扰

**测试步骤**:
1. 打开三个浏览器标签页
   - Tab 1: admin.your-domain.com
   - Tab 2: app.your-domain.com
   - Tab 3: internal.your-domain.com

2. 在每个标签页分别登录

3. 确认:
   - [ ] 每个应用都留在自己的域名（不跳转到其他应用）
   - [ ] 每个应用的 session 独立管理
   - [ ] OAuth 回调正确返回到发起登录的应用

#### Cookie 共享测试 (可选)

**如果使用相同父域** (如 `*.your-domain.com`):

1. 在 customer-web 登录
2. 检查 Cookie:
   ```javascript
   // 浏览器 Console
   document.cookie
   // 应包含: sb-<project>-auth-token
   ```

3. 访问 internal-web
4. 确认是否自动识别登录状态（取决于 Cookie Domain 设置）

**如果使用不同域名**:
- Cookie **不会**共享
- 用户需要在每个应用分别登录
- 这是**正常且安全**的行为

---

### D4. 生产环境最终验证

#### Performance 检查

**使用 Vercel Analytics**:
- [ ] 启用 Vercel Analytics
- [ ] 检查页面加载时间
- [ ] 检查 Core Web Vitals (LCP, FID, CLS)

**使用 Lighthouse**:
- [ ] 对每个应用首页运行 Lighthouse
- [ ] 确认 Performance > 90
- [ ] 确认 Accessibility > 90
- [ ] 确认 Best Practices > 90
- [ ] 确认 SEO > 90 (如果适用)

#### Security 检查

**HTTPS**:
- [ ] 所有域名都使用 HTTPS
- [ ] HTTP 自动重定向到 HTTPS

**Headers**:
- [ ] 检查 Security Headers (使用 securityheaders.com)
- [ ] 确认 Content-Security-Policy (如果设置)
- [ ] 确认 X-Frame-Options
- [ ] 确认 X-Content-Type-Options

**Cookie Security**:
- [ ] 所有 cookie 都设置 `Secure` 标志
- [ ] 所有 cookie 都设置 `HttpOnly` (除非需要 JS 访问)
- [ ] 所有 cookie 都设置适当的 `SameSite`

#### Monitoring 设置

**Vercel Logs**:
- [ ] 检查每个 Project 的部署日志
- [ ] 检查 Function Logs (API routes)
- [ ] 设置 Log Drains (可选)

**Error Tracking** (可选):
- [ ] 集成 Sentry
- [ ] 测试错误上报
- [ ] 设置 Alert 规则

**Uptime Monitoring** (可选):
- [ ] 使用 Vercel Monitoring
- [ ] 或使用第三方服务 (UptimeRobot, Pingdom)
- [ ] 设置 Downtime Alerts

---

## E. 故障排查

### E1. 常见问题

#### 问题 1: Build 失败 - "Cannot find module"

**原因**: Monorepo workspace 依赖未正确安装

**解决方案**:
```bash
# 在 Root Directory 设置中
Root Directory: apps/admin-web  # 或其他应用

# Build Command (如果需要)
cd ../.. && pnpm install && pnpm --filter admin-web build

# 或让 Vercel 自动检测（推荐）
Build Command: (留空)
```

#### 问题 2: OAuth 回调后 404

**原因**: Redirect URL 不在 Supabase Allow List 中

**解决方案**:
1. 登录 Supabase Dashboard
2. Authentication → URL Configuration
3. 添加完整的回调 URL:
   ```
   https://your-app.vercel.app/auth/callback
   ```

#### 问题 3: "useSearchParams() should be wrapped in a suspense boundary"

**原因**: Next.js 15 要求 Suspense 边界

**解决方案**:
```typescript
import { Suspense } from 'react';

function PageContent() {
  const searchParams = useSearchParams();
  // ...
}

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PageContent />
    </Suspense>
  );
}
```

#### 问题 4: "AuthSessionMissingError"

**原因**: Session cookie 未正确设置或传递

**解决方案**:
1. 检查 Middleware 中的 cookie 处理
2. 确认 `createServerClient` 正确配置 `cookies.setAll`
3. 检查 Domain 设置（跨子域场景）

#### 问题 5: Stripe Webhook 失败

**原因**: Webhook signature 验证失败

**解决方案**:
1. 确认 `STRIPE_WEBHOOK_SECRET` 正确设置
2. 确认 route 声明 `export const runtime = 'nodejs'`
3. 使用 `await req.text()` 获取 raw body
4. 检查 Stripe Dashboard 中的 webhook 日志

---

## F. 附录

### F1. 环境变量清单（汇总）

#### 所有应用共享

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Customer-Web 额外

```env
# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### F2. 有用的命令

#### 本地测试

```bash
# 测试 admin-web
cd apps/admin-web
pnpm dev

# 测试 customer-web
cd apps/customer-web
pnpm dev

# 测试 internal-web
cd apps/internal-web
pnpm dev
```

#### 本地构建测试

```bash
# 模拟 Vercel 构建
cd apps/admin-web
pnpm build
pnpm start
```

#### 检查依赖

```bash
# 检查 workspace 依赖
pnpm list --depth 0

# 检查特定应用的依赖
pnpm --filter admin-web list --depth 0
```

---

## G. 总结

### 关键要点

1. **三个独立 Vercel Projects**: admin-web, customer-web, internal-web
2. **Root Directory 必须设置**: `apps/<app-name>`
3. **环境变量独立管理**: 每个 Project 单独设置
4. **Supabase Redirect URLs**: 必须添加所有三个应用的 `/auth/callback`
5. **没有硬编码域名**: 所有应用使用 `window.location.origin`
6. **Suspense 边界**: 所有 `useSearchParams` 都包裹
7. **Membership Gate**: internal-web 正确检查 merchant membership

### 部署顺序建议

1. **先部署 Customer-Web** (主应用)
   - 验证 OAuth 流程
   - 验证 Stripe 集成
   - 作为其他应用的参考

2. **再部署 Internal-Web**
   - 验证 Membership Gate
   - 验证邀请码系统
   - 验证 OAuth 回调独立性

3. **最后部署 Admin-Web**
   - 验证邮箱密码登录
   - 验证 Admin 权限
   - 验证 RPC 调用

### 成功标志

✅ 所有三个应用都能：
- 独立登录（不跳转到其他应用）
- 正确的 OAuth 回调
- Session 持久化
- Middleware 正确保护路由
- 在生产环境稳定运行

---

**部署完成后，请使用 [D. 最终检查清单](#d-最终检查清单) 进行全面测试！**

**祝部署顺利！** 🚀🎉✨
