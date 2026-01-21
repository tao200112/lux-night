# Monorepo 重构完整迁移指南

## 📦 当前状态

### ✅ 已完成的核心结构

1. **Monorepo 根配置**
   - `package.json` - pnpm workspace
   - `pnpm-workspace.yaml`

2. **Shared Package**
   - `packages/shared/package.json`
   - `packages/shared/src/supabase/client.ts` ✅
   - `packages/shared/src/supabase/server.ts` ✅
   - `packages/shared/src/types.ts` ✅
   - `packages/shared/src/constants.ts` ✅

3. **Customer Web App 基础**
   - `apps/customer-web/package.json` ✅
   - `apps/customer-web/next.config.js` ✅
   - `apps/customer-web/tsconfig.json` ✅
   - `apps/customer-web/lib/supabase/client.ts` ✅
   - `apps/customer-web/lib/supabase/server.ts` ✅
   - `apps/customer-web/lib/auth/client.ts` ✅
   - `apps/customer-web/app/auth/callback/route.ts` ✅

4. **Internal Web App 基础**
   - `apps/internal-web/package.json` ✅
   - `apps/internal-web/next.config.js` ✅
   - `apps/internal-web/tsconfig.json` ✅
   - `apps/internal-web/middleware.ts` ✅ (包含 Invite Gate)
   - `apps/internal-web/lib/supabase/client.ts` ✅
   - `apps/internal-web/lib/supabase/server.ts` ✅
   - `apps/internal-web/lib/auth/client.ts` ✅
   - `apps/internal-web/app/auth/callback/route.ts` ✅

## 🔄 完整迁移步骤

### 步骤 1: 创建 Shared Package 数据层

复制以下文件到 `packages/shared/src/data/`:

```bash
# 共享数据层（两个 app 都使用）
lib/data/profile.ts → packages/shared/src/data/profile.ts
lib/data/regions.ts → packages/shared/src/data/regions.ts
lib/utils/qr.ts → packages/shared/src/utils/qr.ts
```

### 步骤 2: 迁移 Customer Web 文件

#### App 目录:
```bash
app/page.tsx → apps/customer-web/app/page.tsx
app/layout.tsx → apps/customer-web/app/layout.tsx
app/globals.css → apps/customer-web/app/globals.css
app/login/page.tsx → apps/customer-web/app/login/page.tsx
app/events/[id]/page.tsx → apps/customer-web/app/events/[id]/page.tsx
app/profile/page.tsx → apps/customer-web/app/profile/page.tsx
app/wallet/page.tsx → apps/customer-web/app/wallet/page.tsx
app/ticket/[id]/page.tsx → apps/customer-web/app/ticket/[id]/page.tsx
app/checkout/page.tsx → apps/customer-web/app/checkout/page.tsx
```

#### API 路由:
```bash
app/api/regions/route.ts → apps/customer-web/app/api/regions/route.ts
app/api/profile/region/route.ts → apps/customer-web/app/api/profile/region/route.ts
app/api/tickets/[id]/route.ts → apps/customer-web/app/api/tickets/[id]/route.ts
app/api/checkout/create-session/route.ts → apps/customer-web/app/api/checkout/create-session/route.ts
app/api/stripe/webhook/route.ts → apps/customer-web/app/api/stripe/webhook/route.ts
```

#### Lib 目录:
```bash
lib/auth/server.ts → apps/customer-web/lib/auth/server.ts
lib/data/events.ts → apps/customer-web/lib/data/events.ts
lib/data/profile.server.ts → apps/customer-web/lib/data/profile.server.ts
lib/data/tickets.ts → apps/customer-web/lib/data/tickets.ts
lib/data/ticket-types.ts → apps/customer-web/lib/data/ticket-types.ts
lib/stripe/client.ts → apps/customer-web/lib/stripe/client.ts
lib/stripe/server.ts → apps/customer-web/lib/stripe/server.ts
```

#### Components & Contexts:
```bash
components/ui/Button.tsx → apps/customer-web/components/ui/Button.tsx
components/ui/BackButton.tsx → apps/customer-web/components/ui/BackButton.tsx
components/ui/BottomTabBar.tsx → apps/customer-web/components/ui/BottomTabBar.tsx
contexts/AuthContext.tsx → apps/customer-web/contexts/AuthContext.tsx
```

#### 配置文件:
```bash
tailwind.config.ts → apps/customer-web/tailwind.config.ts
postcss.config.js → apps/customer-web/postcss.config.js
constants.ts → apps/customer-web/constants.ts (如果非共享)
```

### 步骤 3: 迁移 Internal Web 文件

#### App 目录:
```bash
app/internal/login/page.tsx → apps/internal-web/app/login/page.tsx
app/internal/invite/page.tsx → apps/internal-web/app/invite/page.tsx
app/internal/workspaces/page.tsx → apps/internal-web/app/workspaces/page.tsx
app/internal/layout.tsx → apps/internal-web/app/layout.tsx
```

**注意**: 路径从 `/internal/login` 变为 `/login`（在 internal app 内部）

#### API 路由:
```bash
app/api/internal/me/route.ts → apps/internal-web/app/api/me/route.ts
app/api/internal/invites/redeem/route.ts → apps/internal-web/app/api/invites/redeem/route.ts
app/api/internal/workspace/select/route.ts → apps/internal-web/app/api/workspace/select/route.ts
app/api/internal/checkins/route.ts → apps/internal-web/app/api/checkins/route.ts
app/api/internal/tickets/search/route.ts → apps/internal-web/app/api/tickets/search/route.ts
app/api/internal/dashboard/route.ts → apps/internal-web/app/api/dashboard/route.ts
app/api/internal/events/route.ts → apps/internal-web/app/api/events/route.ts
app/api/internal/events/[id]/route.ts → apps/internal-web/app/api/events/[id]/route.ts
app/api/internal/invites/create/route.ts → apps/internal-web/app/api/invites/create/route.ts
app/api/internal/staff/route.ts → apps/internal-web/app/api/staff/route.ts
app/api/internal/staff/[memberId]/route.ts → apps/internal-web/app/api/staff/[memberId]/route.ts
app/api/internal/requests/route.ts → apps/internal-web/app/api/requests/route.ts
app/api/internal/requests/[id]/route.ts → apps/internal-web/app/api/requests/[id]/route.ts
app/api/internal/admin/requests/[id]/approve/route.ts → apps/internal-web/app/api/admin/requests/[id]/approve/route.ts
app/api/internal/admin/requests/[id]/reject/route.ts → apps/internal-web/app/api/admin/requests/[id]/reject/route.ts
```

**注意**: API 路径从 `/api/internal/*` 变为 `/api/*`（在 internal app 内部）

#### Lib 目录:
```bash
lib/internal/auth.ts → apps/internal-web/lib/internal/auth.ts
lib/internal/workspace.ts → apps/internal-web/lib/internal/workspace.ts
lib/internal/permissions.ts → apps/internal-web/lib/internal/permissions.ts
lib/data/internal/* → apps/internal-web/lib/data/
```

#### 配置文件:
```bash
tailwind.config.ts → apps/internal-web/tailwind.config.ts
postcss.config.js → apps/internal-web/postcss.config.js
```

### 步骤 4: 修复 Import 路径

#### 全局替换规则:

1. **Supabase Client**:
```typescript
// From:
import { createClient } from '@/lib/supabase/client';

// To (Customer Web):
import { createClient } from '@/lib/supabase/client'; // 已经使用 shared

// To (Internal Web):
import { createClient } from '@/lib/supabase/client'; // 已经使用 shared
```

2. **Shared Types**:
```typescript
// From:
import { types } from '@/types';

// To:
import { types } from '@lux-night/shared/types';
```

3. **Shared Data**:
```typescript
// From:
import { getProfile } from '@/lib/data/profile';

// To:
import { getProfile } from '@lux-night/shared/data/profile';
```

4. **相对路径**: 保持不变（因为文件相对位置不变）

### 步骤 5: 修复 Auth Client Import

#### Customer Web 的 `lib/auth/client.ts`:
```typescript
// 确保使用 customer app 的 supabase client
import { createClient } from '@/lib/supabase/client'; // ✅ 已正确
```

#### Internal Web 的 `lib/auth/client.ts`:
```typescript
// 确保使用 internal app 的 supabase client
import { createClient } from '@/lib/supabase/client'; // ✅ 已正确
```

### 步骤 6: 创建 Tailwind 配置文件

两个 app 使用相同的 Tailwind 配置（设计系统一致）。

### 步骤 7: 创建环境变量文件

#### `apps/customer-web/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

#### `apps/internal-web/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3001
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3001
```

## 🚀 快速迁移脚本

由于文件量大，建议手动迁移关键文件，然后逐步迁移其他文件。

### 关键文件优先级

1. **Customer Web**:
   - `app/layout.tsx` - 根布局
   - `app/page.tsx` - 首页
   - `app/login/page.tsx` - 登录页
   - `app/auth/callback/route.ts` - 回调 ✅ (已完成)
   - `contexts/AuthContext.tsx` - 认证上下文

2. **Internal Web**:
   - `app/layout.tsx` - 根布局
   - `app/login/page.tsx` - 登录页
   - `app/invite/page.tsx` - 邀请码门禁
   - `app/workspaces/page.tsx` - Workspace 选择
   - `app/auth/callback/route.ts` - 回调 ✅ (已完成)
   - `middleware.ts` - 中间件 ✅ (已完成)

## 📝 Supabase Dashboard 配置

### Authentication → URL Configuration

**Site URL**:
- 开发环境: `http://localhost:3000` (Customer)
- 生产环境: `https://app.example.com` (Customer)

**Additional Redirect URLs**:
```
# 本地开发
http://localhost:3000/auth/callback
http://localhost:3001/auth/callback

# 生产环境
https://app.example.com/auth/callback
https://internal.example.com/auth/callback
```

## ✅ 验证清单

### Cookie 隔离测试
- [ ] 在浏览器打开 `http://localhost:3000` 和 `http://localhost:3001`
- [ ] 分别登录，检查 cookie 名称:
  - Customer: `sb-customer-*`
  - Internal: `sb-internal-*`
- [ ] 两个标签页可以同时保持不同的登录状态

### OAuth 回调测试
- [ ] Customer Web: 登录后回调到 `http://localhost:3000/auth/callback`
- [ ] Internal Web: 登录后回调到 `http://localhost:3001/auth/callback`
- [ ] Customer Web 登录后重定向到 `/`
- [ ] Internal Web 登录后:
  - 无 membership → `/invite`
  - 有 membership → `/scan` 或 `/dashboard`

### Invite Gate 测试
- [ ] Internal Web 无 membership 时，访问任何内部页面都跳转到 `/invite`
- [ ] 兑换邀请码后，可以正常访问内部页面

## 🎯 假设

1. **部署方式**: 生产环境使用不同子域名
   - Customer: `https://app.example.com` 或 `https://customer.example.com`
   - Internal: `https://internal.example.com` 或 `https://merchant.example.com`

2. **Cookie 隔离**: 
   - 本地开发: 同域名不同端口，通过 cookie 名称前缀隔离
   - 生产环境: 不同子域名，自然隔离

3. **localStorage**: 
   - 本地开发时，两个 app 在同一个浏览器中会共享 localStorage（因为同源）
   - 但由于使用服务端 cookie，session 仍然可以正确隔离
   - 生产环境使用不同子域名时，localStorage 自然隔离

4. **共享代码**: 
   - 只在 `packages/shared` 中共享基础工具（Supabase client, types, utils）
   - 不共享页面、路由、组件

## 📦 最终文件结构

```
lux-night/
├── apps/
│   ├── customer-web/
│   │   ├── app/
│   │   │   ├── (customer)/           # 顾客端路由组
│   │   │   │   ├── events/
│   │   │   │   ├── profile/
│   │   │   │   ├── wallet/
│   │   │   │   └── ticket/
│   │   │   ├── auth/
│   │   │   │   └── callback/
│   │   │   ├── api/
│   │   │   │   ├── regions/
│   │   │   │   ├── profile/
│   │   │   │   ├── tickets/
│   │   │   │   ├── checkout/
│   │   │   │   └── stripe/
│   │   │   ├── login/
│   │   │   ├── checkout/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   └── globals.css
│   │   ├── lib/
│   │   │   ├── supabase/          # 使用 shared
│   │   │   ├── auth/
│   │   │   ├── data/
│   │   │   └── stripe/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── package.json
│   │   ├── next.config.js
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   └── .env.local
│   └── internal-web/
│       ├── app/
│       │   ├── (internal)/         # 商家端路由组（可选）
│       │   │   ├── scan/
│       │   │   ├── dashboard/
│       │   │   ├── events/
│       │   │   ├── staff/
│       │   │   ├── requests/
│       │   │   └── admin/
│       │   ├── auth/
│       │   │   └── callback/
│       │   ├── api/
│       │   │   ├── me/
│       │   │   ├── invites/
│       │   │   ├── workspace/
│       │   │   ├── checkins/
│       │   │   ├── dashboard/
│       │   │   ├── events/
│       │   │   ├── staff/
│       │   │   ├── requests/
│       │   │   └── admin/
│       │   ├── login/
│       │   ├── invite/
│       │   ├── workspaces/
│       │   ├── layout.tsx
│       │   └── globals.css
│       ├── lib/
│       │   ├── supabase/          # 使用 shared
│       │   ├── auth/
│       │   ├── internal/
│       │   └── data/
│       ├── middleware.ts          # Invite Gate
│       ├── package.json
│       ├── next.config.js
│       ├── tsconfig.json
│       ├── tailwind.config.ts
│       └── .env.local
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── supabase/
│       │   ├── data/
│       │   ├── utils/
│       │   ├── types.ts
│       │   └── constants.ts
│       ├── package.json
│       └── tsconfig.json
├── supabase/
│   ├── config.toml
│   └── migrations/
├── package.json
├── pnpm-workspace.yaml
└── MONOREPO_MIGRATION_GUIDE.md
```
