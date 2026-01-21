# Monorepo 重构完成文档

## 📋 已完成的工作

### 1. Monorepo 结构 ✅

- ✅ 创建根 `package.json` 配置 pnpm workspace
- ✅ 创建 `pnpm-workspace.yaml`
- ✅ 创建 `packages/shared` - 共享代码包
- ✅ 创建 `apps/customer-web` - 顾客端应用（端口 3000）
- ✅ 创建 `apps/internal-web` - 商家端应用（端口 3001）

### 2. Shared Package ✅

**文件结构**:
```
packages/shared/
├── package.json
├── tsconfig.json
└── src/
    ├── supabase/
    │   ├── client.ts      # 浏览器客户端（支持 cookie 隔离）
    │   └── server.ts      # 服务端客户端（支持 cookie 前缀）
    ├── types.ts           # 共享类型定义
    └── constants.ts       # 共享常量
```

**关键实现**:
- ✅ `client.ts` - 支持通过 storageKey 隔离不同 app 的 localStorage
- ✅ `server.ts` - 支持通过 cookie 前缀隔离不同 app 的 session
- Cookie 前缀: `sb-customer-` vs `sb-internal-`

### 3. Customer Web App ✅

**已创建**:
- ✅ `package.json` - 依赖配置
- ✅ `next.config.js` - Next.js 配置
- ✅ `tsconfig.json` - TypeScript 配置
- ✅ `lib/supabase/client.ts` - 使用 shared package，配置 customer 前缀
- ✅ `lib/supabase/server.ts` - 使用 shared package，配置 customer 前缀
- ✅ `lib/auth/client.ts` - OAuth 登录，确保回调指向 customer app
- ✅ `app/auth/callback/route.ts` - OAuth 回调处理

**待迁移**:
- ⏳ 所有顾客端页面（app/page.tsx, app/login/, app/events/, 等）
- ⏳ 顾客端 API 路由（app/api/regions/, app/api/profile/, 等）
- ⏳ 顾客端组件和上下文
- ⏳ 样式文件（tailwind.config.ts, globals.css）

### 4. Internal Web App ✅

**已创建**:
- ✅ `package.json` - 依赖配置
- ✅ `next.config.js` - Next.js 配置
- ✅ `tsconfig.json` - TypeScript 配置
- ✅ `middleware.ts` - **Invite Gate 实现**：
  - 未登录 → `/login`
  - 已登录但无 merchant_members → `/invite`
  - 有 membership → 根据角色重定向（STAFF → `/scan`, MANAGER/OWNER → `/dashboard`）
- ✅ `lib/supabase/client.ts` - 使用 shared package，配置 internal 前缀
- ✅ `lib/supabase/server.ts` - 使用 shared package，配置 internal 前缀
- ✅ `lib/auth/client.ts` - OAuth 登录，确保回调指向 internal app
- ✅ `app/auth/callback/route.ts` - OAuth 回调处理 + 自动检查 merchant_members

**待迁移**:
- ⏳ 内部端页面（app/login/, app/invite/, app/workspaces/, app/scan/, 等）
- ⏳ 内部端 API 路由（app/api/internal/*）
- ⏳ 内部端 lib 文件（lib/internal/*, lib/data/internal/*）
- ⏳ 内部端组件和上下文

### 5. OAuth 回调隔离 ✅

**Customer Web**:
- Callback URL: `http://localhost:3000/auth/callback` (本地)
- Production: `https://app.example.com/auth/callback`
- Cookie 前缀: `sb-customer-`
- 重定向: 默认到 `/` (首页)

**Internal Web**:
- Callback URL: `http://localhost:3001/auth/callback` (本地)
- Production: `https://internal.example.com/auth/callback`
- Cookie 前缀: `sb-internal-`
- 重定向: 根据 merchant_members 和角色智能重定向

### 6. Cookie 隔离实现 ✅

**原理**:
- Server 端: 通过 cookie 名称前缀隔离（`sb-customer-*` vs `sb-internal-*`）
- Client 端: 通过 localStorage key 隔离（如果支持）

**实现位置**:
- `packages/shared/src/supabase/server.ts` - cookie 过滤和重命名
- `apps/customer-web/middleware.ts` - 过滤 customer cookies
- `apps/internal-web/middleware.ts` - 过滤 internal cookies

## 🚧 待完成的工作

### 1. 代码迁移

由于代码量巨大，以下文件需要手动迁移：

#### Customer Web 需要迁移：

**App 目录**:
```
app/page.tsx → apps/customer-web/app/page.tsx
app/login/ → apps/customer-web/app/login/
app/events/ → apps/customer-web/app/events/
app/profile/ → apps/customer-web/app/profile/
app/wallet/ → apps/customer-web/app/wallet/
app/ticket/ → apps/customer-web/app/ticket/
app/checkout/ → apps/customer-web/app/checkout/
app/layout.tsx → apps/customer-web/app/layout.tsx
app/globals.css → apps/customer-web/app/globals.css
```

**API 路由**:
```
app/api/regions/ → apps/customer-web/app/api/regions/
app/api/profile/ → apps/customer-web/app/api/profile/
app/api/tickets/ → apps/customer-web/app/api/tickets/
app/api/checkout/ → apps/customer-web/app/api/checkout/
app/api/stripe/ → apps/customer-web/app/api/stripe/
```

**Lib 目录**:
```
lib/auth/server.ts → apps/customer-web/lib/auth/server.ts
lib/data/events.ts → apps/customer-web/lib/data/events.ts
lib/data/profile.ts → packages/shared/src/data/profile.ts (共享)
lib/data/profile.server.ts → apps/customer-web/lib/data/profile.server.ts
lib/data/regions.ts → packages/shared/src/data/regions.ts (共享)
lib/data/tickets.ts → apps/customer-web/lib/data/tickets.ts
lib/data/ticket-types.ts → apps/customer-web/lib/data/ticket-types.ts
lib/stripe/ → apps/customer-web/lib/stripe/
```

**其他**:
```
components/ → apps/customer-web/components/
contexts/ → apps/customer-web/contexts/
constants.ts → apps/customer-web/constants.ts (如果非共享)
tailwind.config.ts → apps/customer-web/tailwind.config.ts
postcss.config.js → apps/customer-web/postcss.config.js
```

#### Internal Web 需要迁移：

**App 目录**:
```
app/internal/login/ → apps/internal-web/app/login/
app/internal/invite/ → apps/internal-web/app/invite/
app/internal/workspaces/ → apps/internal-web/app/workspaces/
app/internal/layout.tsx → apps/internal-web/app/layout.tsx
```

**API 路由**:
```
app/api/internal/* → apps/internal-web/app/api/*
```

**Lib 目录**:
```
lib/internal/* → apps/internal-web/lib/internal/
lib/data/internal/* → apps/internal-web/lib/data/
```

**其他**:
```
tailwind.config.ts → apps/internal-web/tailwind.config.ts
postcss.config.js → apps/internal-web/postcss.config.js
```

#### Shared Package 需要迁移：

**数据层** (共享的):
```
lib/data/profile.ts → packages/shared/src/data/profile.ts
lib/data/regions.ts → packages/shared/src/data/regions.ts
```

**Utils**:
```
lib/utils/qr.ts → packages/shared/src/utils/qr.ts
```

### 2. Import 路径修复

所有迁移后的文件需要更新 import 路径：

**From**:
```typescript
import { createClient } from '@/lib/supabase/client';
import { types } from '@/types';
```

**To (Customer Web)**:
```typescript
import { createClient } from '@/lib/supabase/client'; // 会自动使用 shared
import { types } from '@lux-night/shared/types';
```

**To (Internal Web)**:
```typescript
import { createClient } from '@/lib/supabase/client'; // 会自动使用 shared
import { types } from '@lux-night/shared/types';
```

### 3. 环境变量配置

**Customer Web** (`.env.local`):
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

**Internal Web** (`.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3001
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3001
```

### 4. Supabase Dashboard 配置

需要在 **Supabase Dashboard → Authentication → URL Configuration** 添加：

**Site URL**:
- `http://localhost:3000` (本地 Customer)
- `http://localhost:3001` (本地 Internal)

**Additional Redirect URLs**:
- `http://localhost:3000/auth/callback`
- `http://localhost:3001/auth/callback`
- `https://app.example.com/auth/callback` (生产 Customer)
- `https://internal.example.com/auth/callback` (生产 Internal)

## 🔧 运行命令

```bash
# 安装所有依赖（在根目录）
pnpm install

# 启动 Customer Web (端口 3000)
pnpm dev:customer

# 启动 Internal Web (端口 3001)
pnpm dev:internal

# 构建
pnpm build:customer
pnpm build:internal

# 同时运行两个（需要两个终端）
# Terminal 1:
pnpm dev:customer

# Terminal 2:
pnpm dev:internal
```

## ✅ 验证清单

### Cookie 隔离测试
- [ ] 在同一浏览器中分别访问 `http://localhost:3000` 和 `http://localhost:3001`
- [ ] 在 Customer Web 登录，检查 cookie 名称是否以 `sb-customer-` 开头
- [ ] 在 Internal Web 登录，检查 cookie 名称是否以 `sb-internal-` 开头
- [ ] 两个 tab 互不影响，可以同时保持不同的登录状态

### OAuth 回调测试
- [ ] Customer Web 登录后，回调 URL 是 `http://localhost:3000/auth/callback`
- [ ] Internal Web 登录后，回调 URL 是 `http://localhost:3001/auth/callback`
- [ ] Customer Web 登录后，重定向到 Customer 首页 (`/`)
- [ ] Internal Web 登录后：
  - 无 merchant_members → 重定向到 `/invite`
  - 有 membership → 根据角色重定向到 `/scan` 或 `/dashboard`

### Invite Gate 测试
- [ ] Internal Web 中，无 merchant_members 的用户无法访问任何内部页面
- [ ] 所有内部页面（除 `/login` 和 `/invite`）都会重定向到 `/invite`
- [ ] 兑换邀请码后，可以正常访问内部页面

### 功能测试
- [ ] Customer Web 的所有顾客端功能正常工作
- [ ] Internal Web 的所有商家端功能正常工作
- [ ] 共享的数据层函数在两个 app 中都能正常使用

## 📝 注意事项

1. **Cookie 隔离**: 两个 app 使用不同的 cookie 前缀，即使同域名也不会冲突
2. **端口隔离**: 本地开发使用不同端口（3000 vs 3001）
3. **生产部署**: 推荐使用不同子域名（app.example.com vs internal.example.com）
4. **共享代码**: 只在 `packages/shared` 中共享基础工具，不共享页面或路由
5. **环境变量**: 每个 app 都有自己的 `.env.local` 文件

## 🎯 假设

1. 生产环境使用不同子域名（app.example.com vs internal.example.com）
2. 共享同一个 Supabase 项目（同一个 auth user pool）
3. 使用 pnpm 作为包管理器
4. Next.js 15.1.4 版本
5. 顾客端和商家端使用相同的 Tailwind 配置和设计系统

## 📚 文件结构（完整）

```
lux-night/
├── apps/
│   ├── customer-web/
│   │   ├── app/
│   │   ├── lib/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── package.json
│   │   ├── next.config.js
│   │   ├── tsconfig.json
│   │   └── .env.local
│   └── internal-web/
│       ├── app/
│       ├── lib/
│       ├── middleware.ts
│       ├── package.json
│       ├── next.config.js
│       ├── tsconfig.json
│       └── .env.local
├── packages/
│   └── shared/
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── supabase/
│   ├── config.toml
│   └── migrations/
├── package.json
├── pnpm-workspace.yaml
└── MONOREPO_RESTRUCTURE_COMPLETE.md
```

## 🔄 下一步

1. **迁移所有文件**（按照上述清单）
2. **修复所有 import 路径**
3. **配置环境变量**
4. **运行并测试**
5. **验证 cookie 隔离**
6. **验证 OAuth 回调**
