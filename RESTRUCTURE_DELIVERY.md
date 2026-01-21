# Monorepo 重构最终交付清单

## ✅ 已完成的工作

### 1. Monorepo 结构 ✅

- ✅ 根 `package.json` - pnpm workspace 配置
- ✅ `pnpm-workspace.yaml` - workspace 定义
- ✅ 创建 `apps/` 目录结构
- ✅ 创建 `packages/shared/` 目录结构

### 2. Shared Package ✅

**已创建文件**:
```
packages/shared/
├── package.json ✅
├── tsconfig.json ✅
└── src/
    ├── supabase/
    │   ├── client.ts ✅ (浏览器客户端)
    │   └── server.ts ✅ (服务端客户端，支持 cookie 前缀隔离)
    ├── types.ts ✅
    └── constants.ts ✅
```

**关键实现**:
- ✅ `client.ts`: 使用标准 `createBrowserClient`（localStorage 隔离通过服务端 cookie）
- ✅ `server.ts`: 通过 cookie 名称前缀隔离 (`sb-customer-*` vs `sb-internal-*`)
- ✅ 类型定义和常量共享

### 3. Customer Web App ✅

**已创建文件**:
```
apps/customer-web/
├── package.json ✅
├── next.config.js ✅
├── tsconfig.json ✅
├── lib/
│   ├── supabase/
│   │   ├── client.ts ✅ (使用 shared，配置 customer)
│   │   └── server.ts ✅ (使用 shared，配置 customer)
│   └── auth/
│       └── client.ts ✅ (OAuth 回调指向 customer app)
└── app/
    └── auth/
        └── callback/
            └── route.ts ✅ (处理 customer OAuth 回调)
```

**待迁移文件** (见迁移清单):

### 4. Internal Web App ✅

**已创建文件**:
```
apps/internal-web/
├── package.json ✅
├── next.config.js ✅
├── tsconfig.json ✅
├── middleware.ts ✅ (Invite Gate 完整实现)
├── lib/
│   ├── supabase/
│   │   ├── client.ts ✅ (使用 shared，配置 internal)
│   │   └── server.ts ✅ (使用 shared，配置 internal)
│   └── auth/
│       └── client.ts ✅ (OAuth 回调指向 internal app)
└── app/
    └── auth/
        └── callback/
            └── route.ts ✅ (处理 internal OAuth 回调 + 检查 merchant_members)
```

**待迁移文件** (见迁移清单):

### 5. OAuth 回调隔离 ✅

**Customer Web**:
- ✅ Callback URL: `http://localhost:3000/auth/callback` (本地)
- ✅ Production: 使用 `NEXT_PUBLIC_APP_ORIGIN` 环境变量
- ✅ 确保回调后重定向到 customer app 域名

**Internal Web**:
- ✅ Callback URL: `http://localhost:3001/auth/callback` (本地)
- ✅ Production: 使用 `NEXT_PUBLIC_APP_ORIGIN` 环境变量
- ✅ 回调后自动检查 `merchant_members` 并智能重定向

### 6. Cookie 隔离实现 ✅

**Server 端**:
- ✅ `packages/shared/src/supabase/server.ts` - 通过 cookie 名称前缀隔离
- ✅ Customer: `sb-customer-*`
- ✅ Internal: `sb-internal-*`

**Client 端**:
- ✅ 使用标准 `createBrowserClient`
- ✅ Session 隔离通过服务端 cookie 实现

**Middleware**:
- ✅ `apps/internal-web/middleware.ts` - 过滤 internal cookies
- ✅ 实现 Invite Gate 逻辑

### 7. Invite Gate 实现 ✅

**`apps/internal-web/middleware.ts`**:
- ✅ 未登录 → `/login`
- ✅ 已登录但无 `merchant_members` → `/invite`
- ✅ 有 membership → 允许访问（路由会根据角色进一步处理）

**`apps/internal-web/app/auth/callback/route.ts`**:
- ✅ 登录后自动检查 `merchant_members`
- ✅ 无 membership → 重定向到 `/invite`
- ✅ 有 membership → 根据角色重定向（STAFF → `/scan`, MANAGER/OWNER → `/dashboard`）

## 📋 待迁移文件清单

### Customer Web 待迁移文件

#### App 目录 (从 `app/` 迁移，排除 `internal/`):
```
✅ app/auth/callback/route.ts (已创建)
⏳ app/page.tsx
⏳ app/layout.tsx
⏳ app/globals.css
⏳ app/login/page.tsx
⏳ app/events/[id]/page.tsx
⏳ app/profile/page.tsx
⏳ app/wallet/page.tsx
⏳ app/ticket/[id]/page.tsx
⏳ app/checkout/page.tsx
```

#### API 路由 (从 `app/api/` 迁移，排除 `internal/`):
```
⏳ app/api/regions/route.ts
⏳ app/api/profile/region/route.ts
⏳ app/api/tickets/[id]/route.ts
⏳ app/api/checkout/create-session/route.ts
⏳ app/api/stripe/webhook/route.ts
```

#### Lib 目录:
```
✅ lib/supabase/client.ts (已创建)
✅ lib/supabase/server.ts (已创建)
✅ lib/auth/client.ts (已创建)
⏳ lib/auth/server.ts
⏳ lib/data/events.ts
⏳ lib/data/profile.server.ts
⏳ lib/data/tickets.ts
⏳ lib/data/ticket-types.ts
⏳ lib/stripe/client.ts
⏳ lib/stripe/server.ts
```

#### Components & Contexts:
```
⏳ components/ui/Button.tsx
⏳ components/ui/BackButton.tsx
⏳ components/ui/BottomTabBar.tsx
⏳ contexts/AuthContext.tsx
```

#### 配置文件:
```
⏳ tailwind.config.ts
⏳ postcss.config.js
⏳ constants.ts (如果非共享)
```

### Internal Web 待迁移文件

#### App 目录 (从 `app/internal/` 迁移):
```
✅ app/auth/callback/route.ts (已创建)
⏳ app/login/page.tsx (从 app/internal/login/page.tsx)
⏳ app/invite/page.tsx (从 app/internal/invite/page.tsx)
⏳ app/workspaces/page.tsx (从 app/internal/workspaces/page.tsx)
⏳ app/layout.tsx (从 app/internal/layout.tsx)
⏳ app/scan/page.tsx (待创建)
⏳ app/dashboard/page.tsx (待创建)
⏳ app/events/page.tsx (待创建)
⏳ app/events/[id]/page.tsx (待创建)
⏳ app/staff/page.tsx (待创建)
⏳ app/requests/page.tsx (待创建)
⏳ app/admin/requests/page.tsx (待创建)
```

#### API 路由 (从 `app/api/internal/` 迁移到 `app/api/`):
```
✅ app/api/me/route.ts (从 app/api/internal/me/route.ts)
✅ app/api/invites/redeem/route.ts
✅ app/api/workspace/select/route.ts
✅ app/api/checkins/route.ts
✅ app/api/tickets/search/route.ts
✅ app/api/dashboard/route.ts
✅ app/api/events/route.ts
✅ app/api/events/[id]/route.ts
✅ app/api/invites/create/route.ts
✅ app/api/staff/route.ts
✅ app/api/staff/[memberId]/route.ts
✅ app/api/requests/route.ts
✅ app/api/requests/[id]/route.ts
✅ app/api/admin/requests/[id]/approve/route.ts
✅ app/api/admin/requests/[id]/reject/route.ts
```

**注意**: 这些 API 路由已经创建，但需要移动到正确的路径（从 `app/api/internal/*` 到 `app/api/*`）

#### Lib 目录:
```
✅ lib/supabase/client.ts (已创建)
✅ lib/supabase/server.ts (已创建)
✅ lib/auth/client.ts (已创建)
⏳ lib/internal/auth.ts
⏳ lib/internal/workspace.ts
⏳ lib/internal/permissions.ts
⏳ lib/data/internal/* (所有 internal 数据层文件)
```

#### 配置文件:
```
⏳ tailwind.config.ts
⏳ postcss.config.js
```

### Shared Package 待迁移文件

#### 数据层 (共享的):
```
⏳ lib/data/profile.ts → packages/shared/src/data/profile.ts
⏳ lib/data/regions.ts → packages/shared/src/data/regions.ts
```

#### Utils (共享的):
```
⏳ lib/utils/qr.ts → packages/shared/src/utils/qr.ts
```

## 📝 需要修改的文件

### 1. Import 路径修复

所有迁移后的文件需要更新 import：

**From**:
```typescript
import { createClient } from '@/lib/supabase/client';
import { Event } from '@/types';
import { getProfile } from '@/lib/data/profile';
```

**To (Customer Web)**:
```typescript
import { createClient } from '@/lib/supabase/client'; // 已使用 shared
import { Event } from '@lux-night/shared/types';
import { getProfile } from '@lux-night/shared/data/profile';
```

**To (Internal Web)**:
```typescript
import { createClient } from '@/lib/supabase/client'; // 已使用 shared
import { Event } from '@lux-night/shared/types';
```

### 2. API 路径修复

#### Internal Web API 路由:
- 所有 API 路径从 `/api/internal/*` 改为 `/api/*`
- 客户端调用也需要更新路径

### 3. 页面路径修复

#### Internal Web 页面:
- 所有页面路径从 `/internal/*` 改为 `/*`
- 例如: `/internal/login` → `/login`
- 例如: `/internal/invite` → `/invite`
- 例如: `/internal/scan` → `/scan`

## 🚀 运行命令

```bash
# 在根目录安装依赖
pnpm install

# 启动 Customer Web (端口 3000)
pnpm dev:customer

# 启动 Internal Web (端口 3001)
pnpm dev:internal

# 构建
pnpm build:customer
pnpm build:internal
```

## 🔧 环境变量配置

### Customer Web (`.env.local`):
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

### Internal Web (`.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3001
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3001
```

## 📋 Supabase Dashboard 配置

### Authentication → URL Configuration

**Site URL**:
- 本地: `http://localhost:3000` (Customer)
- 生产: `https://app.example.com` (Customer)

**Additional Redirect URLs**:
```
http://localhost:3000/auth/callback
http://localhost:3001/auth/callback
https://app.example.com/auth/callback
https://internal.example.com/auth/callback
```

## ✅ 验证清单

### Cookie 隔离测试
1. [ ] 在同一浏览器中打开两个标签页
2. [ ] 标签页 1: `http://localhost:3000` (Customer)
3. [ ] 标签页 2: `http://localhost:3001` (Internal)
4. [ ] 在 Customer 登录，检查 cookie 名称包含 `sb-customer-`
5. [ ] 在 Internal 登录，检查 cookie 名称包含 `sb-internal-`
6. [ ] 两个标签页可以同时保持不同的登录状态

### OAuth 回调测试
1. [ ] Customer Web 登录，回调 URL 是 `http://localhost:3000/auth/callback`
2. [ ] Internal Web 登录，回调 URL 是 `http://localhost:3001/auth/callback`
3. [ ] Customer Web 登录后，重定向到 `/`
4. [ ] Internal Web 登录后：
   - [ ] 无 membership → 重定向到 `/invite`
   - [ ] 有 membership → 根据角色重定向

### Invite Gate 测试
1. [ ] Internal Web 中，无 membership 的用户无法访问任何内部页面
2. [ ] 访问 `/scan`, `/dashboard`, `/events` 等都会重定向到 `/invite`
3. [ ] 兑换邀请码后，可以正常访问内部页面

### 功能测试
1. [ ] Customer Web 的所有功能正常工作
2. [ ] Internal Web 的所有功能正常工作
3. [ ] 两个 app 可以独立运行和部署

## 🎯 假设

1. **生产环境**:
   - Customer: `https://app.example.com` 或 `https://customer.example.com`
   - Internal: `https://internal.example.com` 或 `https://merchant.example.com`

2. **Cookie 隔离**:
   - 本地开发: 同域名不同端口，通过 cookie 名称前缀隔离
   - 生产环境: 不同子域名，自然隔离

3. **localStorage**:
   - 本地开发时，两个 app 共享 localStorage（因为同源）
   - Session 隔离通过服务端 cookie 前缀实现
   - 生产环境使用不同子域名时，localStorage 自然隔离

4. **共享代码**:
   - 只在 `packages/shared` 中共享基础工具
   - 不共享页面、路由、组件

5. **数据库**:
   - 共享同一个 Supabase 项目
   - 共享同一个 auth user pool
   - 所有数据表共享

## 📚 相关文档

- [MONOREPO_MIGRATION_GUIDE.md](./MONOREPO_MIGRATION_GUIDE.md) - 详细迁移步骤
- [MONOREPO_RESTRUCTURE.md](./MONOREPO_RESTRUCTURE.md) - 重构说明

## 🔄 下一步

1. **迁移所有文件** (按照上述清单)
2. **修复所有 import 路径**
3. **配置环境变量**
4. **运行并测试**
5. **验证 cookie 隔离**
6. **验证 OAuth 回调**
7. **验证 Invite Gate**

---

**状态**: ✅ 核心架构已完成，待迁移页面和组件
**下一步**: 按照迁移清单逐步迁移文件
