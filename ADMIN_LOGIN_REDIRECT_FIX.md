# Admin Portal 登录循环重定向修复

## 修复内容

### Step 2: 创建 SSR Supabase 工具封装
✅ **文件**: `apps/admin-web/lib/supabase/server-ssr.ts`
- 使用 `NextRequest` 创建 SSR Supabase 客户端
- 正确映射 cookies（读取和写入）
- 支持 `sb-admin-` 前缀的 cookie

### Step 3: 重写 middleware
✅ **文件**: `apps/admin-web/middleware.ts`
- 使用新的 `createServerSupabaseClient` 创建客户端
- 通过 `getUser()` 检查登录状态
- 调用 `/api/admin/me` API 判断 admin 权限（避免在 middleware 中直接查表）
- 保护路径：`/`, `/dashboard/*`, `/events/*`, `/users/*`, `/admin/*` 等
- 放行路径：`/login`, `/api/*`, `/_next/*`, `/favicon.ico`

### Step 4: 创建 admin 判定 API
✅ **文件**: `apps/admin-web/app/api/admin/me/route.ts`
- 使用 SSR client 从 cookie 获取用户
- 使用 **service role key** 查询 `profiles.is_admin` 和 `admin_users` 表
- 返回 `{ userId, email, isAdmin }`

### Step 6: 修复根路径页面
✅ **文件**: `apps/admin-web/app/page.tsx`
- 简化逻辑，直接重定向到 `/dashboard`
- Middleware 已处理认证和权限检查

## 关键修复点

### 1. Cookie 读取问题
**问题**: Middleware 无法从 `sb-<projectRef>-auth-token` cookie 读取用户信息

**修复**: 
- 在 `server-ssr.ts` 中同时匹配带前缀的 cookie（`sb-admin-xxx`）和标准 cookie（`sb-xxx`）
- 确保 cookie 正确映射到 Supabase 期望的格式

### 2. Admin 判断问题
**问题**: Middleware 中直接调用 RPC 或查表可能受 RLS 限制

**修复**:
- 创建 `/api/admin/me` 路由，使用 service role key 绕过 RLS
- Middleware 通过 HTTP fetch 调用该 API 判断 admin 权限

### 3. 循环重定向问题
**问题**: 已登录用户访问 `/` 仍然被重定向到 `/login`

**修复**:
- Middleware 正确读取 cookie 并获取 user
- 正确判断 admin 权限
- 根路径页面简化为直接重定向

## 环境变量检查（Step 7）

确保 `apps/admin-web/.env.local` 包含：

```env
NEXT_PUBLIC_SUPABASE_URL=https://hbbhtmvcqpdybclbdtot.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**重要**: 
- `SUPABASE_SERVICE_ROLE_KEY` 必须设置（用于 `/api/admin/me`）
- Project ref (`hbbhtmvcqpdybclbdtot`) 必须与 cookie 名中的 ref 一致

## 验收步骤

1. **清空浏览器存储**:
   - 清除 cookies 和 localStorage
   - 或使用无痕模式

2. **登录测试**:
   - 访问 `http://localhost:3002/login`
   - 输入邮箱和密码登录
   - 应该重定向到 `/dashboard`

3. **访问根路径**:
   - 访问 `http://localhost:3002/`
   - 应该直接进入 `/dashboard`，而不是 307 到 `/login`

4. **访问受保护路由**:
   - `/dashboard`, `/events`, `/merchants` 等应该正常访问

5. **非 admin 用户测试**:
   - 使用非 admin 账号登录
   - 应该重定向到 `/no-access`

## 调试日志

开发环境下，middleware 会打印：
- `[ADMIN MIDDLEWARE] Checking protected path:` - 检查的保护路径
- `[ADMIN MIDDLEWARE] User check:` - 用户检查结果
- `[ADMIN MIDDLEWARE] Admin check result:` - Admin 权限检查结果
- `[SSR CLIENT] Cookies found:` - 找到的 cookies

如果仍有问题，检查：
1. 终端日志中的调试信息
2. 浏览器 Network 标签中的 `/api/admin/me` 请求状态
3. Cookie 是否正确设置（Application → Cookies）
