# Auth Session 修复报告

## Phase 1: 根因分析

### 问题描述
第二个账号用 Google Auth 登录成功后，无法跳转到 `/invite` 页面，导致无法继续。

### 根因定位

**根因：Cookie 前缀匹配逻辑错误导致服务端无法读取 session**

具体原因：
1. **Cookie 写入与读取不一致**：
   - `setAll()` 将 Supabase 的 cookie 名称 `sb-<project-ref>-auth-token` 改写为 `sb-internal-<project-ref>-auth-token`
   - `getAll()` 的过滤和还原逻辑可能不正确，导致服务端读取不到 cookie
   - 当第二个账号登录时，如果服务端读不到 cookie，`getUser()` 返回 `null`，middleware 会重定向到 `/login`，而不是 `/invite`

2. **开发环境验证不足**：
   - 缺少明确的调试日志，无法追踪 cookie 的读写过程
   - 无法确认 `exchangeCodeForSession` 是否正确写入 cookie
   - 无法确认 `getAll()` 是否正确过滤和还原 cookie 名称

3. **可能的次要原因**：
   - 如果账号B的 profile 创建失败，membership 查询可能因 RLS 问题返回空数组
   - localStorage 可能在账号切换时残留上一个账号的数据，但这不是主要问题（服务端不依赖 localStorage）

### 证据位置

- `packages/shared/src/supabase/server.ts`：
  - `getAll()` 过滤逻辑（第 27-38 行）：可能过滤掉正确的 cookie
  - `setAll()` 前缀添加逻辑（第 40-56 行）：cookie 名称被改写，但 `getAll()` 还原可能失败

- `apps/internal-web/app/auth/callback/route.ts`：
  - `exchangeCodeForSession` 后没有验证 session 是否成功写入
  - 缺少调试日志

- `apps/internal-web/middleware.ts`：
  - 第 64 行：membership 查询错误被静默吞掉（`catch` 后允许继续），可能导致误判

## Phase 2: 修复方案

### 2.1 修复 Cookie 读写逻辑

**文件**: `packages/shared/src/supabase/server.ts`

修复点：
1. **改进 `getAll()` 过滤逻辑**：
   - 正确匹配带前缀的 cookie（`sb-internal-xxx`）
   - 正确还原 cookie 名称为 Supabase 期望的格式（去掉 `internal-` 或 `customer-` 前缀）
   - 添加开发环境调试日志

2. **改进 `setAll()` 写入逻辑**：
   - 确保 cookie 选项正确（httpOnly, secure, sameSite, path）
   - 添加开发环境调试日志

### 2.2 增强调试日志

**文件**: 
- `apps/internal-web/app/auth/callback/route.ts`
- `apps/internal-web/middleware.ts`
- `apps/internal-web/app/page.tsx`

在每个关键点添加开发环境日志：
- Cookie 读写情况
- User 获取结果
- Membership 查询结果

### 2.3 修复 Middleware 错误处理

**文件**: `apps/internal-web/middleware.ts`

- membership 查询错误应该被正确处理，不应该静默吞掉
- 如果查询失败，应该走系统错误页面，而不是误判为"已完成"

## Phase 3: 验收标准

### 验收步骤

1. **账号B新登录流程**：
   ```
   1. 无痕窗口打开商家端 (http://localhost:3001)
   2. 点击 Google 登录
   3. 完成 Google OAuth
   4. 应该重定向到商家端 callback: http://localhost:3001/auth/callback
   5. callback 完成后应该重定向到 `/` (根路径)
   6. `app/page.tsx` 检测到用户无 membership
   7. 自动重定向到 `/invite`
   ```

2. **输入邀请码流程**：
   ```
   1. 在 `/invite` 页面输入邀请码 (例如: 1461)
   2. 提交后应该成功兑换
   3. 刷新页面，middleware 和 page.tsx 检测到 membership
   4. 根据 role 重定向到 `/dashboard` (OWNER/MANAGER) 或 `/scan` (STAFF)
   ```

3. **账号切换流程**：
   ```
   1. 在 `/settings` 点击"切换账户"
   2. 登出后重定向到 `/login`
   3. 用另一个账号登录
   4. 应该正确跳转到 `/invite` 或相应首页
   ```

### 预期日志输出（开发环境）

在浏览器控制台和服务器日志中应该看到：

```
[AUTH CALLBACK] Received code: YES
[AUTH CALLBACK] After exchange - user: <user-id>
[AUTH CALLBACK] Auth cookies found: ['sb-internal-xxx-auth-token']
[SUPABASE SERVER INTERNAL] Set cookie: sb-internal-xxx-auth-token
[MIDDLEWARE] User: <user-id>
[MIDDLEWARE] Auth cookies: ['sb-internal-xxx-auth-token']
[ROOT PAGE] User: <user-id>
[ROOT PAGE] Memberships: 0
[ROOT PAGE] No membership, redirecting to /invite
```

## Phase 4: 修复后的文件清单

1. ✅ `packages/shared/src/supabase/server.ts` - Cookie 读写逻辑修复
2. ✅ `apps/internal-web/app/auth/callback/route.ts` - 添加调试日志和错误处理
3. ✅ `apps/internal-web/middleware.ts` - 添加调试日志和错误处理改进
4. ✅ `apps/internal-web/app/page.tsx` - 添加调试日志

## 注意事项

1. **Cookie 隔离策略**：
   - 当前实现使用前缀 `sb-internal-` 和 `sb-customer-` 来隔离不同 app 的 session
   - 这要求 `getAll()` 和 `setAll()` 的逻辑必须完全一致，否则会导致读取失败

2. **开发环境 vs 生产环境**：
   - 所有调试日志只在 `NODE_ENV === 'development'` 时输出
   - 生产环境不会输出敏感信息

3. **向后兼容性**：
   - 如果 cookie 没有前缀（旧格式），`getAll()` 仍然会尝试匹配（仅限 internal app）
   - 但建议新用户都使用带前缀的格式以确保隔离
