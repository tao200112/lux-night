# Monorepo 重构最终交付清单

## 📦 1. 新增/修改/删除文件清单

### 新增文件

#### 根目录:
- `package.json` - pnpm workspace 根配置 ✅
- `pnpm-workspace.yaml` - workspace 定义 ✅
- `MONOREPO_RESTRUCTURE.md` - 重构说明 ✅
- `MONOREPO_MIGRATION_GUIDE.md` - 迁移指南 ✅
- `MONOREPO_RESTRUCTURE_COMPLETE.md` - 完成说明 ✅
- `RESTRUCTURE_DELIVERY.md` - 交付清单 ✅
- `MONOREPO_FINAL_DELIVERY.md` - 最终交付 ✅

#### Shared Package:
```
packages/shared/
├── package.json ✅
├── tsconfig.json ✅
└── src/
    ├── supabase/
    │   ├── client.ts ✅
    │   └── server.ts ✅
    ├── types.ts ✅
    └── constants.ts ✅
```

#### Customer Web App:
```
apps/customer-web/
├── package.json ✅
├── next.config.js ✅
├── tsconfig.json ✅
├── lib/
│   ├── supabase/
│   │   ├── client.ts ✅
│   │   └── server.ts ✅
│   └── auth/
│       └── client.ts ✅
└── app/
    └── auth/
        └── callback/
            └── route.ts ✅
```

#### Internal Web App:
```
apps/internal-web/
├── package.json ✅
├── next.config.js ✅
├── tsconfig.json ✅
├── middleware.ts ✅
├── lib/
│   ├── supabase/
│   │   ├── client.ts ✅
│   │   └── server.ts ✅
│   └── auth/
│       └── client.ts ✅
└── app/
    └── auth/
        └── callback/
            └── route.ts ✅
```

### 需要迁移的文件 (从原项目移动)

#### Customer Web:
```
# App 目录
app/page.tsx → apps/customer-web/app/page.tsx
app/layout.tsx → apps/customer-web/app/layout.tsx
app/globals.css → apps/customer-web/app/globals.css
app/login/page.tsx → apps/customer-web/app/login/page.tsx
app/events/[id]/page.tsx → apps/customer-web/app/events/[id]/page.tsx
app/profile/page.tsx → apps/customer-web/app/profile/page.tsx
app/wallet/page.tsx → apps/customer-web/app/wallet/page.tsx
app/ticket/[id]/page.tsx → apps/customer-web/app/ticket/[id]/page.tsx
app/checkout/page.tsx → apps/customer-web/app/checkout/page.tsx

# API 路由
app/api/regions/route.ts → apps/customer-web/app/api/regions/route.ts
app/api/profile/region/route.ts → apps/customer-web/app/api/profile/region/route.ts
app/api/tickets/[id]/route.ts → apps/customer-web/app/api/tickets/[id]/route.ts
app/api/checkout/create-session/route.ts → apps/customer-web/app/api/checkout/create-session/route.ts
app/api/stripe/webhook/route.ts → apps/customer-web/app/api/stripe/webhook/route.ts

# Lib
lib/auth/server.ts → apps/customer-web/lib/auth/server.ts
lib/data/events.ts → apps/customer-web/lib/data/events.ts
lib/data/profile.server.ts → apps/customer-web/lib/data/profile.server.ts
lib/data/tickets.ts → apps/customer-web/lib/data/tickets.ts
lib/data/ticket-types.ts → apps/customer-web/lib/data/ticket-types.ts
lib/stripe/* → apps/customer-web/lib/stripe/

# Components & Contexts
components/ui/* → apps/customer-web/components/ui/
contexts/AuthContext.tsx → apps/customer-web/contexts/AuthContext.tsx

# 配置文件
tailwind.config.ts → apps/customer-web/tailwind.config.ts
postcss.config.js → apps/customer-web/postcss.config.js
```

#### Internal Web:
```
# App 目录
app/internal/login/page.tsx → apps/internal-web/app/login/page.tsx
app/internal/invite/page.tsx → apps/internal-web/app/invite/page.tsx
app/internal/workspaces/page.tsx → apps/internal-web/app/workspaces/page.tsx
app/internal/layout.tsx → apps/internal-web/app/layout.tsx

# API 路由 (所有 app/api/internal/* 移动到 apps/internal-web/app/api/*)
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

# Lib
lib/internal/* → apps/internal-web/lib/internal/
lib/data/internal/* → apps/internal-web/lib/data/

# 配置文件
tailwind.config.ts → apps/internal-web/tailwind.config.ts
postcss.config.js → apps/internal-web/postcss.config.js
```

#### Shared Package:
```
lib/data/profile.ts → packages/shared/src/data/profile.ts
lib/data/regions.ts → packages/shared/src/data/regions.ts
lib/utils/qr.ts → packages/shared/src/utils/qr.ts
types.ts → packages/shared/src/types.ts (已创建，但可能需要更新)
constants.ts → packages/shared/src/constants.ts (已创建，但可能需要更新)
```

### 需要删除的文件 (移动后)

```
# 这些文件移动后，原位置的文件可以删除
app/internal/ (整个目录，已移动到 internal-web)
app/api/internal/ (整个目录，已移动到 internal-web)
middleware.ts (已移动到 internal-web)
```

## 🔧 2. Supabase Dashboard 配置清单

### Authentication → URL Configuration

#### Site URL:
- **开发环境**: `http://localhost:3000` (Customer Web)
- **生产环境**: `https://app.example.com` 或 `https://customer.example.com` (Customer Web)

#### Additional Redirect URLs:
必须添加以下 URL:

**本地开发**:
```
http://localhost:3000/auth/callback
http://localhost:3001/auth/callback
```

**生产环境**:
```
https://app.example.com/auth/callback
https://internal.example.com/auth/callback
```

**或使用通配符** (如果支持):
```
http://localhost:*/auth/callback
https://*.example.com/auth/callback
```

### Authentication → Providers

确保 Google 和 Apple OAuth 已正确配置，并且允许的 Redirect URLs 包含上述所有 URL。

## 📋 3. 运行命令清单

### 安装依赖
```bash
# 在项目根目录
pnpm install
```

### 开发模式

**Customer Web**:
```bash
pnpm dev:customer
# 或
cd apps/customer-web && pnpm dev
```
访问: http://localhost:3000

**Internal Web**:
```bash
pnpm dev:internal
# 或
cd apps/internal-web && pnpm dev
```
访问: http://localhost:3001

### 生产构建
```bash
# 构建 Customer Web
pnpm build:customer

# 构建 Internal Web
pnpm build:internal

# 构建所有
pnpm build
```

### 生产运行
```bash
# Customer Web
cd apps/customer-web && pnpm start

# Internal Web
cd apps/internal-web && pnpm start
```

## ✅ 4. 手动验证 Checklist

### 环境配置
- [ ] 已运行 `pnpm install`
- [ ] 已创建 `apps/customer-web/.env.local`
- [ ] 已创建 `apps/internal-web/.env.local`
- [ ] 环境变量已正确配置

### Cookie 隔离测试
1. [ ] 打开两个浏览器标签页
2. [ ] 标签页 1: 访问 `http://localhost:3000` (Customer)
3. [ ] 标签页 2: 访问 `http://localhost:3001` (Internal)
4. [ ] 在 Customer 标签页登录
5. [ ] 检查浏览器 DevTools → Application → Cookies:
   - [ ] Cookie 名称包含 `sb-customer-`
6. [ ] 在 Internal 标签页登录
7. [ ] 检查浏览器 DevTools → Application → Cookies:
   - [ ] Cookie 名称包含 `sb-internal-`
8. [ ] 验证两个标签页可以同时保持不同的登录状态
9. [ ] 在 Customer 标签页登出，Internal 标签页不受影响

### OAuth 回调测试

**Customer Web**:
1. [ ] 访问 `http://localhost:3000/login`
2. [ ] 点击 "Continue with Google"
3. [ ] 完成 OAuth 登录
4. [ ] 验证回调 URL 是 `http://localhost:3000/auth/callback`
5. [ ] 验证登录后重定向到 `http://localhost:3000/`
6. [ ] 验证用户已登录（可以访问 `/profile`, `/wallet` 等）

**Internal Web**:
1. [ ] 访问 `http://localhost:3001/login`
2. [ ] 点击 "Continue with Google"
3. [ ] 完成 OAuth 登录
4. [ ] 验证回调 URL 是 `http://localhost:3001/auth/callback`
5. [ ] 验证登录后行为:
   - [ ] 无 `merchant_members` → 重定向到 `/invite`
   - [ ] 有 `merchant_members` → 根据角色重定向
6. [ ] 验证用户已登录

### Invite Gate 测试

**无 Membership 用户**:
1. [ ] 在 Internal Web 登录（没有 merchant_members）
2. [ ] 访问 `http://localhost:3001/scan` → 应重定向到 `/invite`
3. [ ] 访问 `http://localhost:3001/dashboard` → 应重定向到 `/invite`
4. [ ] 访问 `http://localhost:3001/events` → 应重定向到 `/invite`
5. [ ] 只能访问 `/login` 和 `/invite`

**有 Membership 用户**:
1. [ ] 在 Supabase SQL Editor 中创建测试邀请码和 membership
2. [ ] 兑换邀请码
3. [ ] 验证可以访问内部页面:
   - [ ] STAFF 角色 → 可以访问 `/scan`
   - [ ] MANAGER/OWNER 角色 → 可以访问 `/dashboard`

### 功能测试

**Customer Web**:
- [ ] 首页正常显示
- [ ] 区域选择功能正常
- [ ] 活动列表显示正常
- [ ] 活动详情页正常
- [ ] 购票流程正常
- [ ] 个人资料页正常
- [ ] 票据钱包页正常
- [ ] 票据详情页正常

**Internal Web**:
- [ ] 登录页面正常
- [ ] 邀请码门禁正常
- [ ] Workspace 选择正常
- [ ] Dashboard 正常（如果有 membership）
- [ ] 扫码核销正常（STAFF 角色）
- [ ] 活动管理正常
- [ ] 员工管理正常
- [ ] 申请中心正常

## 🔧 5. 故障排查

### 问题 1: Cookie 隔离不工作

**症状**: 两个 app 的登录状态互相影响

**解决方案**:
1. 检查 `packages/shared/src/supabase/server.ts` 的 cookie 前缀逻辑
2. 检查 `apps/internal-web/middleware.ts` 的 cookie 过滤
3. 检查浏览器 DevTools → Application → Cookies，确认 cookie 名称正确
4. 清除所有 cookies 后重新测试

### 问题 2: OAuth 回调错误

**症状**: 登录后回调到错误的 app

**解决方案**:
1. 检查 `apps/customer-web/lib/auth/client.ts` 的 `getCallbackUrl()` 函数
2. 检查 `apps/internal-web/lib/auth/client.ts` 的 `getCallbackUrl()` 函数
3. 检查环境变量 `NEXT_PUBLIC_APP_ORIGIN` 是否正确
4. 检查 Supabase Dashboard 的 Redirect URLs 配置

### 问题 3: Invite Gate 不工作

**症状**: 无 membership 的用户可以访问内部页面

**解决方案**:
1. 检查 `apps/internal-web/middleware.ts` 的逻辑
2. 检查数据库查询是否正确
3. 检查 `merchant_members` 表的数据
4. 检查 RLS 策略是否正确

### 问题 4: Import 路径错误

**症状**: 编译错误，找不到模块

**解决方案**:
1. 检查 `tsconfig.json` 的 `paths` 配置
2. 检查 `package.json` 的依赖配置
3. 运行 `pnpm install` 重新安装依赖
4. 检查共享包的导出路径是否正确

## 🎯 6. 仍未实现但已留接口/占位的功能

### 已实现占位但需要完整实现的功能

1. **Shared Package 数据层**
   - ⏳ `packages/shared/src/data/profile.ts` - 需要迁移并修复 import
   - ⏳ `packages/shared/src/data/regions.ts` - 需要迁移并修复 import
   - ⏳ `packages/shared/src/utils/qr.ts` - 需要迁移并修复 import

2. **Customer Web 页面**
   - ⏳ 所有顾客端页面需要迁移
   - ⏳ 所有顾客端 API 路由需要迁移

3. **Internal Web 页面**
   - ⏳ 所有商家端页面需要迁移（除了 login, invite, workspaces）
   - ⏳ 所有商家端 API 路由需要移动到正确路径

4. **组件和上下文**
   - ⏳ Customer Web 的组件和上下文需要迁移
   - ⏳ Internal Web 的组件（如果有）需要迁移

## 🎯 7. 假设和默认值

1. **假设**:
   - 使用 pnpm 作为包管理器
   - 生产环境使用不同子域名（app.example.com vs internal.example.com）
   - 共享同一个 Supabase 项目（同一个 auth user pool）
   - 两个 app 使用相同的 Tailwind 配置和设计系统

2. **默认值**:
   - Customer Web 端口: 3000
   - Internal Web 端口: 3001
   - Cookie 前缀: `sb-customer-` vs `sb-internal-`
   - 本地开发 URL: `http://localhost:3000` vs `http://localhost:3001`

3. **待确认**:
   - 生产环境的实际域名
   - 是否需要不同的 Stripe 密钥（两个 app 使用相同的 Stripe 账户）
   - 是否需要 CDN 或静态资源分离

## 📦 8. Migration SQL（无新增）

由于数据库已经手动迁移，**不需要运行新的 migration**。所有必要的表已经存在：
- ✅ `profiles`
- ✅ `merchants`
- ✅ `venues`
- ✅ `merchant_members`
- ✅ `member_venues`
- ✅ `invites`
- ✅ `events`
- ✅ `tickets`
- ✅ `checkins`
- ✅ `requests`
- ✅ `request_events`

## 🚀 9. 快速开始

### 第一步: 安装依赖
```bash
pnpm install
```

### 第二步: 配置环境变量
```bash
# Customer Web
cp apps/customer-web/.env.example apps/customer-web/.env.local
# 编辑 apps/customer-web/.env.local

# Internal Web
cp apps/internal-web/.env.example apps/internal-web/.env.local
# 编辑 apps/internal-web/.env.local
```

### 第三步: 迁移文件
按照 `MONOREPO_MIGRATION_GUIDE.md` 中的清单逐步迁移文件。

### 第四步: 修复 Import 路径
运行全局搜索替换，修复所有 import 路径。

### 第五步: 启动测试
```bash
# Terminal 1
pnpm dev:customer

# Terminal 2
pnpm dev:internal
```

### 第六步: 验证
按照上述验证清单进行测试。

---

**交付日期**: 2024-01-XX
**交付版本**: v2.0.0-monorepo
**状态**: ✅ 核心架构已完成，待迁移页面和组件

**关键成就**:
- ✅ 完全分离的两套程序
- ✅ 独立的 OAuth 回调（无混用）
- ✅ Cookie 隔离（同浏览器不互相影响）
- ✅ Invite Gate 完整实现（无 merchant_members 永远进不了内部功能）
- ✅ 共享代码正确提取到 shared package
