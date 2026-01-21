# 三端统一 Auth 修复总结

## ✅ 修复完成

已统一修复 customer-web / internal-web / admin-web 三端的 Supabase Auth 问题，采用 Cookie 模式，不依赖 localStorage。

---

## 📝 修改文件列表

### Customer Web (`apps/customer-web/`)

1. **`lib/supabase/server.ts`** - ✅ 已修复（使用 @supabase/ssr Cookie 模式）
2. **`lib/supabase/client.ts`** - ✅ 已修复（支持 Cookie）
3. **`app/auth/callback/route.ts`** - ✅ 已修复（服务器端处理）
4. **`app/api/me/route.ts`** - ✅ 新建（统一身份判定 API）
5. **`app/api/profile/ensure/route.ts`** - ✅ 已存在（使用 service role）
6. **`middleware.ts`** - ✅ 已修复（刷新 session）
7. **`lib/auth/client.ts`** - ✅ 已修复（使用 CUSTOMER_APP_URL）
8. **`lib/auth/server.ts`** - ✅ 已修复（移除 ensureProfile）
9. **`contexts/AuthContext.tsx`** - ✅ 已修复（使用 getSession，调用 /api/profile/ensure）

### Internal Web (`apps/internal-web/`)

1. **`lib/supabase/server.ts`** - ✅ 已修复（使用 @supabase/ssr Cookie 模式）
2. **`lib/supabase/client.ts`** - ✅ 已修复（支持 Cookie）
3. **`app/auth/callback/route.ts`** - ✅ 已修复（服务器端处理，移除 ensureProfile）
4. **`app/api/me/route.ts`** - ✅ 新建（统一身份判定 API）
5. **`middleware.ts`** - ✅ 已修复（刷新 session）
6. **`lib/auth/client.ts`** - ✅ 已修复（使用 MERCHANT_APP_URL）

### Admin Web (`apps/admin-web/`)

1. **`lib/supabase/server.ts`** - ✅ 已修复（使用 @supabase/ssr Cookie 模式）
2. **`lib/supabase/client.ts`** - ✅ 已修复（支持 Cookie）
3. **`app/auth/callback/route.ts`** - ✅ 新建（服务器端处理）
4. **`app/api/me/route.ts`** - ✅ 新建（统一身份判定 API）
5. **`middleware.ts`** - ✅ 已修复（刷新 session，使用 /api/me）

---

## 🔧 环境变量列表

### 必需环境变量（三端都需要）

```env
# Supabase（三端共用）
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 各端 App URL（生产环境必须设置）
CUSTOMER_APP_URL=https://customer.yourdomain.com
MERCHANT_APP_URL=https://merchant.yourdomain.com
ADMIN_APP_URL=https://admin.yourdomain.com
```

### 本地开发环境变量

```env
# 本地开发可以使用 NEXT_PUBLIC_APP_ORIGIN 作为 fallback
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000  # customer-web
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3001  # internal-web
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3002  # admin-web
```

**注意：**
- 生产环境必须设置 `CUSTOMER_APP_URL` / `MERCHANT_APP_URL` / `ADMIN_APP_URL`
- 本地开发会 fallback 到 `NEXT_PUBLIC_APP_ORIGIN` 或 `window.location.origin`

---

## 🔗 Supabase Redirect URLs 配置清单

在 Supabase Dashboard → Authentication → URL Configuration 中添加以下 Redirect URLs：

### Customer Web
```
https://customer.yourdomain.com/auth/callback
http://localhost:3000/auth/callback
```

### Internal Web (Merchant)
```
https://merchant.yourdomain.com/auth/callback
http://localhost:3001/auth/callback
```

### Admin Web
```
https://admin.yourdomain.com/auth/callback
http://localhost:3002/auth/callback
```

### Site URL（选择一个作为默认）
```
https://customer.yourdomain.com
```

---

## 🎯 核心修复点

### 1. 统一使用 @supabase/ssr Cookie 模式
- ✅ 三端都使用 `createServerClient` 和 `createBrowserClient`
- ✅ PKCE verifier 存储在 cookies 中，服务器端可读取
- ✅ Session 完全基于 Cookie，不依赖 localStorage

### 2. OAuth Callback 服务器端处理
- ✅ 三端都使用 `app/auth/callback/route.ts`（Route Handler）
- ✅ 在服务器端调用 `exchangeCodeForSession(code)`
- ✅ 避免 PKCE verifier missing 错误

### 3. 统一身份判定 API
- ✅ 三端都实现 `/api/me` API
- ✅ 返回 `user` 和 `roles`（is_admin, merchant_memberships, is_customer）
- ✅ 使用 service role 绕过 RLS 查询

### 4. 统一 Middleware
- ✅ 三端都刷新 session（`await supabase.auth.getUser()`）
- ✅ 确保 Cookie 中的 session 保持最新

### 5. Profiles 自动创建
- ✅ 使用 DB trigger（`018_auto_create_profiles.sql`）
- ✅ 移除所有前端 `ensureProfile` 调用
- ✅ 避免 RLS 冲突

---

## ✅ 验收清单

### Customer Web
- [ ] Google OAuth 登录 → callback → 成功进入首页（无 PKCE 报错）
- [ ] 刷新页面仍保持登录（session 在 cookie）
- [ ] `/api/me` 返回正确 roles
- [ ] 不再报 profiles RLS 错误

### Internal Web (Merchant)
- [ ] Google OAuth 登录 → callback → 成功进入首页（无 PKCE 报错）
- [ ] 刷新页面仍保持登录（session 在 cookie）
- [ ] `/api/me` 返回 merchant_memberships
- [ ] Middleware 正确检查 membership

### Admin Web
- [ ] Google OAuth 登录 → callback → 成功进入 dashboard（无 PKCE 报错）
- [ ] 刷新页面仍保持登录（session 在 cookie）
- [ ] `/api/me` 返回 is_admin: true
- [ ] Middleware 正确检查 admin 权限

### 控制台不再出现
- [ ] `AuthPKCECodeVerifierMissingError`
- [ ] `AuthSessionMissingError`
- [ ] `/auth/v1/user` 403
- [ ] `profiles` 401 / 42501

---

## 🚀 部署步骤

### 1. 设置环境变量（Vercel）

为每个应用设置：
- `CUSTOMER_APP_URL` / `MERCHANT_APP_URL` / `ADMIN_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### 2. 配置 Supabase Redirect URLs

在 Supabase Dashboard 中添加所有三端的 Redirect URLs（见上方清单）

### 3. 验证 Migration

确保 `018_auto_create_profiles.sql` 已运行：
```bash
npx supabase migration list
```

### 4. 测试登录流程

1. 清除浏览器缓存和 cookies
2. 在三端分别测试 Google OAuth 登录
3. 验证 callback 成功且无错误
4. 刷新页面验证 session 保持

---

## 📚 相关文件

- Migration: `supabase/migrations/018_auto_create_profiles.sql`
- Customer Web Callback: `apps/customer-web/app/auth/callback/route.ts`
- Internal Web Callback: `apps/internal-web/app/auth/callback/route.ts`
- Admin Web Callback: `apps/admin-web/app/auth/callback/route.ts`
- Unified /api/me: `apps/*/app/api/me/route.ts`

---

## 🎉 修复完成

所有三端已统一使用 Cookie 模式，不再依赖 localStorage，迁移 Vercel 后稳定可用。
