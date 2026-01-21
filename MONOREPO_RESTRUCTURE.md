# Monorepo 重构完成说明

## 重构目标

将单 Next.js app 重构为完全分离的两套程序：
- **Customer App** (顾客端) - `apps/customer-web`
- **Internal App** (商家/员工端) - `apps/internal-web`
- **Shared Package** (共享代码) - `packages/shared`

## 文件迁移计划

### 已完成 ✅

1. **Monorepo 根配置**
   - `package.json` - pnpm workspace 配置
   - `pnpm-workspace.yaml` - workspace 定义

2. **Shared Package**
   - `packages/shared/package.json`
   - `packages/shared/src/supabase/client.ts` - 支持 cookie 前缀隔离
   - `packages/shared/src/supabase/server.ts` - 支持 cookie 前缀隔离
   - `packages/shared/src/types.ts`
   - `packages/shared/src/constants.ts`

3. **App 基础结构**
   - `apps/customer-web/package.json` - 运行在端口 3000
   - `apps/internal-web/package.json` - 运行在端口 3001

### 待迁移 ⏳

由于代码量巨大，剩余迁移工作：

#### Customer Web 需要迁移：

1. **App 目录** (从 `app/` 迁移，排除 `internal/`):
   - `app/page.tsx` → `apps/customer-web/app/page.tsx`
   - `app/login/` → `apps/customer-web/app/login/`
   - `app/auth/callback/` → `apps/customer-web/app/auth/callback/`
   - `app/events/` → `apps/customer-web/app/events/`
   - `app/profile/` → `apps/customer-web/app/profile/`
   - `app/wallet/` → `apps/customer-web/app/wallet/`
   - `app/ticket/` → `apps/customer-web/app/ticket/`
   - `app/checkout/` → `apps/customer-web/app/checkout/`
   - `app/layout.tsx` → `apps/customer-web/app/layout.tsx`
   - `app/globals.css` → `apps/customer-web/app/globals.css`

2. **API 路由** (从 `app/api/` 迁移，排除 `internal/`):
   - `app/api/regions/` → `apps/customer-web/app/api/regions/`
   - `app/api/profile/` → `apps/customer-web/app/api/profile/`
   - `app/api/tickets/` → `apps/customer-web/app/api/tickets/`
   - `app/api/checkout/` → `apps/customer-web/app/api/checkout/`
   - `app/api/stripe/` → `apps/customer-web/app/api/stripe/`

3. **Lib 目录**:
   - `lib/auth/` → `apps/customer-web/lib/auth/` (使用 shared supabase client)
   - `lib/data/` (customer 相关) → `packages/shared/src/data/` 或 `apps/customer-web/lib/data/`
   - `lib/stripe/` → `apps/customer-web/lib/stripe/`
   - `lib/utils/` → `packages/shared/src/utils/` 或保留在各自 app

4. **Components**:
   - `components/ui/` → `apps/customer-web/components/ui/`

5. **Contexts**:
   - `contexts/AuthContext.tsx` → `apps/customer-web/contexts/AuthContext.tsx`

#### Internal Web 需要迁移：

1. **App 目录** (从 `app/internal/` 迁移):
   - `app/internal/login/` → `apps/internal-web/app/login/`
   - `app/internal/invite/` → `apps/internal-web/app/invite/`
   - `app/internal/workspaces/` → `apps/internal-web/app/workspaces/`
   - `app/internal/layout.tsx` → `apps/internal-web/app/layout.tsx`

2. **API 路由** (从 `app/api/internal/` 迁移):
   - 全部迁移到 `apps/internal-web/app/api/`

3. **Lib 目录**:
   - `lib/internal/` → `apps/internal-web/lib/internal/`
   - `lib/data/internal/` → `apps/internal-web/lib/data/`

#### Shared Package 需要迁移：

1. **数据层** (共享的):
   - `lib/data/profile.ts` → `packages/shared/src/data/profile.ts`
   - `lib/data/regions.ts` → `packages/shared/src/data/regions.ts`
   - 其他需要共享的数据函数

2. **Utils**:
   - `lib/utils/qr.ts` → `packages/shared/src/utils/qr.ts`

## 关键配置更改

### OAuth 回调隔离

**Customer Web**:
- Callback URL: `http://localhost:3000/auth/callback` (本地)
- Production: `https://app.example.com/auth/callback`
- Cookie 前缀: `sb-customer-`

**Internal Web**:
- Callback URL: `http://localhost:3001/auth/callback` (本地)
- Production: `https://internal.example.com/auth/callback`
- Cookie 前缀: `sb-internal-`

### Environment Variables

**Customer Web** (`.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
# Stripe keys...
```

**Internal Web** (`.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
NEXT_PUBLIC_SITE_URL=http://localhost:3001
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3001
```

## Supabase Dashboard 配置

### Additional Redirect URLs

需要在 Supabase Dashboard → Authentication → URL Configuration 添加：

**本地开发**:
- `http://localhost:3000/auth/callback`
- `http://localhost:3001/auth/callback`

**生产环境**:
- `https://app.example.com/auth/callback`
- `https://internal.example.com/auth/callback`

## 运行命令

```bash
# 安装依赖
pnpm install

# 启动 Customer Web (端口 3000)
pnpm dev:customer

# 启动 Internal Web (端口 3001)
pnpm dev:internal

# 同时启动两个（需要两个终端）
pnpm dev:customer & pnpm dev:internal

# 构建
pnpm build:customer
pnpm build:internal
```

## 验证清单

- [ ] Customer Web 可以独立运行
- [ ] Internal Web 可以独立运行
- [ ] OAuth 登录正确跳转到各自 callback
- [ ] Cookie 隔离生效（同浏览器不同标签页不互相影响）
- [ ] Internal 门禁逻辑正确（无 merchant_members 跳转 /invite）
- [ ] 共享代码正确引用

## 注意事项

1. **Cookie 隔离**: 两个 app 使用不同的 cookie 前缀，即使同域名也不会冲突
2. **端口隔离**: 本地开发使用不同端口（3000 vs 3001）
3. **中间件**: 每个 app 都有自己的 middleware.ts
4. **共享代码**: 只在 `packages/shared` 中共享基础工具，不共享页面或路由

## 假设

1. 生产环境使用不同子域名（app.example.com vs internal.example.com）
2. 共享同一个 Supabase 项目（同一个 auth user pool）
3. 使用 pnpm 作为包管理器
4. Next.js 15.1.4 版本
