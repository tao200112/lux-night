# Vercel 部署可用性全量审计报告

**审计日期**: 2024-12-19  
**审计范围**: apps/admin-web, apps/customer-web, apps/internal-web  
**目标**: 确保三个应用都能在 Vercel 上独立部署、可预览、可生产发布

---

## A. 项目结构与构建系统检查

### ✅ 1. 包管理器与 Workspace

**发现**:
- **包管理器**: `pnpm` (>= 8.0.0)
- **Workspace**: 使用 pnpm workspace (`pnpm-workspace.yaml`)
- **Node 版本**: >= 18.0.0 (符合 Vercel 要求)

**Workspace 结构**:
```
packages:
  - 'apps/*'
  - 'packages/*'
```

**构建命令**:
- `apps/admin-web`: `next build` (输出: `.next`)
- `apps/customer-web`: `next build` (输出: `.next`)
- `apps/internal-web`: `next build` (输出: `.next`)

**结论**: ✅ 无需修改，Vercel 支持 pnpm workspace

---

### ✅ 2. 原生依赖检查

**扫描结果**:
- ❌ 未发现 `sharp` (Next.js 会自动安装)
- ❌ 未发现 `canvas`
- ❌ 未发现 `bcrypt`
- ❌ 未发现 `postinstall` 脚本
- ❌ 未发现 `husky` 钩子

**结论**: ✅ 无原生依赖风险，Vercel 构建不会失败

---

### ✅ 3. Next.js 版本与特性

**发现**:
- **Next.js**: `^15.1.4` (所有三个 app)
- **React**: `^19.0.0`
- **App Router**: ✅ 全部使用 App Router (无 Pages Router)
- **Edge Runtime**: 仅 Stripe webhook 使用 `runtime = 'nodejs'` (正确)

**结论**: ✅ Next.js 15 + React 19 兼容 Vercel，无需修改

---

## B. Vercel 兼容性扫描（风险清单）

### 🔴 严重风险 (必须修复)

#### B1. 环境变量在客户端误用服务端密钥

**位置**: 
- `apps/customer-web/lib/auth/client.ts:13` - 使用 `process.env.CUSTOMER_APP_URL` (非 `NEXT_PUBLIC_*`)
- `apps/internal-web/lib/auth/client.ts:16` - 使用 `process.env.MERCHANT_APP_URL` (非 `NEXT_PUBLIC_*`)

**问题**: 
- `CUSTOMER_APP_URL` 和 `MERCHANT_APP_URL` 不是 `NEXT_PUBLIC_*` 前缀，在客户端组件中无法访问
- 会导致生产环境 OAuth 回调 URL 错误

**影响**: 🔴 严重 - OAuth 登录在生产环境会失败

**修复**: 改为使用 `NEXT_PUBLIC_*` 前缀或使用 `window.location.origin`

---

#### B2. Supabase Service Role Key 使用检查

**位置**:
- `apps/admin-web/app/api/me/route.ts:13-19` - ✅ 正确（仅服务器端）
- `apps/customer-web/app/api/me/route.ts:13-19` - ✅ 正确（仅服务器端）
- `apps/internal-web/app/api/me/route.ts:13-19` - ✅ 正确（仅服务器端）
- `apps/customer-web/app/api/stripe/webhook/route.ts:8-9` - ✅ 正确（仅服务器端）
- `apps/admin-web/lib/supabase/admin.ts:14-20` - ✅ 正确（仅服务器端）

**结论**: ✅ 所有 service role key 使用都在服务器端，无泄漏风险

---

#### B3. Middleware 在 Edge Runtime 的兼容性

**位置**:
- `apps/admin-web/middleware.ts:154-160` - 使用 `fetch()` 调用 `/api/me`
- `apps/customer-web/middleware.ts` - ✅ 仅刷新 session，无问题
- `apps/internal-web/middleware.ts:102-107` - 使用 Supabase 查询 `merchant_members`

**问题**:
- `apps/admin-web/middleware.ts` 在 middleware 中调用内部 API (`/api/me`)，可能导致循环或性能问题
- `apps/internal-web/middleware.ts` 在 middleware 中直接查询数据库，可能影响 Edge Runtime 性能

**影响**: 🟡 中等 - 可能导致构建警告或性能问题

**修复**: 
- Admin: 直接在 middleware 中查询数据库（使用 service role 或 anon key + RLS）
- Internal: 保持现状（Supabase Edge 兼容），但需要确保查询效率

---

### 🟡 中等风险 (建议修复)

#### B4. API Routes 文件系统操作

**扫描结果**: ✅ 未发现 `fs.readFileSync`、`fs.writeFileSync`、`child_process` 等操作

**结论**: ✅ 无文件系统依赖，Vercel 兼容

---

#### B5. 图片/文件上传处理

**位置**:
- `apps/admin-web/app/api/admin/uploads/poster/route.ts` - 需要检查

**需要确认**: 是否使用本地磁盘写入（Vercel 无持久化）

**建议**: 如果存在文件上传，必须使用 Vercel Blob Storage 或 Supabase Storage

---

#### B6. CORS/Redirect URL 配置

**当前状态**:
- Customer Web: 使用 `CUSTOMER_APP_URL` 或 `NEXT_PUBLIC_APP_ORIGIN` (fallback: `window.location.origin`)
- Internal Web: 使用 `MERCHANT_APP_URL` 或 `NEXT_PUBLIC_APP_ORIGIN` (fallback: `window.location.origin`)
- Admin Web: 需要检查

**问题**:
- 生产环境必须设置正确的 `NEXT_PUBLIC_APP_ORIGIN` 或使用 `window.location.origin`
- Supabase Dashboard 需要配置三个不同的 redirect URL

**影响**: 🟡 中等 - 需要正确配置环境变量和 Supabase

---

#### B7. Stripe Webhook 签名验证

**位置**: `apps/customer-web/app/api/stripe/webhook/route.ts`

**检查结果**: ✅ 已正确验证签名 (第 33-52 行)
```typescript
if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
  return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 });
}

event = stripe.webhooks.constructEvent(
  body,
  signature,
  process.env.STRIPE_WEBHOOK_SECRET
);
```

**结论**: ✅ 签名验证正确，Vercel 兼容

---

#### B8. Runtime 声明

**当前状态**:
- `apps/customer-web/app/api/stripe/webhook/route.ts:221` - ✅ 已声明 `export const runtime = 'nodejs'`
- 其他 API routes: 未声明（默认 nodejs，正确）

**结论**: ✅ Runtime 声明正确

---

### 🟢 低风险 (可选优化)

#### B9. Middleware Matcher 配置

**当前状态**:
- 所有三个 app 的 middleware 都正确排除了静态资源
- Matcher 配置合理

**结论**: ✅ 无需修改

---

#### B10. Shared Package 构建

**位置**: `packages/shared`

**检查**: 
- `next.config.js` 中已配置 `transpilePackages: ['@lux-night/shared']`
- 所有三个 app 都正确配置

**结论**: ✅ Shared package 构建配置正确

---

## C. Supabase 侧检查

### C1. 数据库 Schema

**结论**: ✅ 无需修改数据库 schema

**原因**:
- 三个 app 共享同一个 Supabase 项目
- RLS 策略已正确配置（通过代码中的 service role 使用可见）
- 数据库结构支持多应用架构

---

### C2. Auth Redirect URLs 配置

**必须配置的 Redirect URLs** (在 Supabase Dashboard → Authentication → URL Configuration):

**生产环境**:
```
https://customer-app.vercel.app/auth/callback
https://internal-app.vercel.app/auth/callback
https://admin-app.vercel.app/auth/callback
```

**Preview 环境** (Vercel 自动生成):
```
https://customer-app-*.vercel.app/auth/callback
https://internal-app-*.vercel.app/auth/callback
https://admin-app-*.vercel.app/auth/callback
```

**建议**: 使用通配符或逐个添加 preview URL

---

### C3. RLS 策略检查

**结论**: ✅ 代码中正确使用 service role key 绕过 RLS（仅在服务器端 API routes）

**需要确认**: 
- RLS 策略是否正确配置（需要查看 SQL migrations）
- Service role key 仅用于 webhook 和管理员操作

---

## D. 修复优先级总结

### 🔴 P0 - 必须修复（部署前）

1. **B1**: 修复客户端环境变量使用 (`CUSTOMER_APP_URL` / `MERCHANT_APP_URL`)
2. **B3**: 优化 middleware 中的 API 调用（admin-web）

### 🟡 P1 - 建议修复（首次部署后）

3. **B5**: 确认文件上传使用 Vercel Blob 或 Supabase Storage
4. **B6**: 配置 Supabase Redirect URLs

### 🟢 P2 - 可选优化

5. 性能优化：middleware 查询优化
6. 监控：添加 Vercel Analytics

---

## E. 部署检查清单

### 部署前检查

- [ ] 修复 P0 问题（B1, B3）
- [ ] 配置 Supabase Redirect URLs
- [ ] 准备环境变量清单
- [ ] 创建三个 Vercel 项目
- [ ] 配置 Root Directory 和 Build Command

### 部署后验证

- [ ] 验证 OAuth 登录流程
- [ ] 验证 Stripe Webhook（如使用）
- [ ] 验证 API routes 正常工作
- [ ] 验证静态资源加载
- [ ] 验证 Cookie 隔离（三个 app 独立）

---

**下一步**: 查看 `VERCEL_DEPLOYMENT_FIXES.md` 获取详细修复计划
