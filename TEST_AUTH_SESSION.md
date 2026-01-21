# Auth Session 修复验收脚本

## 前置条件

1. 确保开发环境运行：
   ```bash
   # 终端1：启动商家端
   cd apps/internal-web
   npm run dev  # 运行在 http://localhost:3001
   ```

2. 确保 Supabase 项目配置正确：
   - `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 在商家端 `.env.local` 中正确配置
   - Google OAuth 的 Redirect URLs 包含：`http://localhost:3001/auth/callback`

3. 确保有一个可用的邀请码（例如：`1461`）

## 验收步骤

### 测试 1：账号B新登录流程（关键测试）

1. **打开无痕窗口**（避免 cookie 干扰）
   - Chrome: `Ctrl+Shift+N`
   - Firefox: `Ctrl+Shift+P`

2. **访问商家端登录页**
   ```
   http://localhost:3001/login
   ```

3. **打开浏览器开发者工具**
   - 按 `F12` 打开 DevTools
   - 切换到 **Console** 标签
   - 切换到 **Network** 标签

4. **点击 Google 登录按钮**
   - 观察 Console 输出
   - 观察 Network 请求

5. **完成 Google OAuth**
   - 在 Google 登录页面输入账号B的凭证
   - 授权后应该重定向回商家端

6. **验证回调处理**
   - 应该重定向到：`http://localhost:3001/auth/callback?code=xxx`
   - 查看 Console 应该看到：
     ```
     [AUTH CALLBACK] Received code: YES
     [AUTH CALLBACK] After exchange - user: <user-id>
     [AUTH CALLBACK] Auth cookies found: ['sb-internal-xxx-auth-token']
     ```

7. **验证根路径重定向**
   - callback 后应该重定向到：`http://localhost:3001/`
   - 查看 Console 应该看到：
     ```
     [ROOT PAGE] User: <user-id>
     [ROOT PAGE] Memberships: 0
     [ROOT PAGE] No membership, redirecting to /invite
     ```

8. **验证最终跳转**
   - 应该自动跳转到：`http://localhost:3001/invite`
   - **✅ 如果成功跳转到 `/invite`，测试通过**

### 测试 2：输入邀请码流程

1. **在 `/invite` 页面输入邀请码**
   - 输入：`1461`（或你的测试邀请码）
   - 点击提交

2. **验证兑换成功**
   - 应该成功兑换并刷新页面
   - 不应该出现错误

3. **验证后续重定向**
   - 根据角色应该重定向到：
     - OWNER/MANAGER → `/dashboard`
     - STAFF → `/scan`

### 测试 3：账号切换流程

1. **从已登录状态登出**
   - 进入 `/settings` 页面
   - 点击"切换账户"或"登出"

2. **重新登录**
   - 应该重定向到 `/login`
   - 用另一个账号（账号C）登录

3. **验证跳转**
   - 如果账号C没有 membership，应该跳转到 `/invite`
   - 如果账号C有 membership，应该跳转到相应首页

### 测试 4：检查错误情况

1. **检查 Console 无错误**
   - 打开 Console，确保没有红色错误
   - 确保没有 401/403 未处理的错误

2. **检查 Network 请求**
   - 打开 Network 标签
   - 确保所有 API 请求都返回 200/201/302（重定向）
   - 不应该有 401 Unauthorized 或 403 Forbidden

3. **检查 Cookie**
   - 打开 Application → Cookies → `http://localhost:3001`
   - 应该看到 `sb-internal-xxx-auth-token` cookie
   - Cookie 应该设置了正确的 domain 和 path

## 预期结果汇总

| 步骤 | 预期行为 | 验证点 |
|------|---------|--------|
| 登录后回调 | 重定向到 `/auth/callback` | URL 包含 `code` 参数 |
| Callback 处理 | 写入 cookie 并重定向到 `/` | Console 显示 user ID |
| 根路径检查 | 检测无 membership，跳转到 `/invite` | URL 变为 `/invite` |
| 输入邀请码 | 成功兑换 membership | 无错误提示 |
| 兑换后刷新 | 根据 role 跳转到首页 | `/dashboard` 或 `/scan` |

## 常见问题排查

### 问题1：一直重定向到 `/login`

**可能原因**：
- Cookie 没有正确写入
- `getAll()` 过滤逻辑错误，读不到 cookie

**排查方法**：
1. 检查 Application → Cookies 中是否有 `sb-internal-xxx-auth-token`
2. 查看 Console 中 `[SUPABASE SERVER INTERNAL]` 的日志
3. 检查 `[MIDDLEWARE] User:` 是否为 `NULL`

**修复方向**：
- 检查 `packages/shared/src/supabase/server.ts` 的 `getAll()` 逻辑

### 问题2：卡在 `/auth/callback` 页面

**可能原因**：
- `exchangeCodeForSession` 失败
- `ensureProfile` 失败

**排查方法**：
1. 查看 Console 中的 `[AUTH CALLBACK]` 错误信息
2. 检查 Network 请求中的 `/auth/callback` 响应状态码

**修复方向**：
- 检查 Supabase 配置是否正确
- 检查 `ensureProfile` 的 RLS 策略

### 问题3：跳转到 `/invite` 但页面空白或404

**可能原因**：
- `/invite` 路由不存在或组件有错误

**排查方法**：
1. 检查 `apps/internal-web/app/invite/page.tsx` 是否存在
2. 查看 Console 中的 React 错误

**修复方向**：
- 确保 `/invite` 页面已正确实现

## 验收成功标准

✅ **所有测试通过，满足以下条件**：
1. 账号B登录后能正确跳转到 `/invite`
2. 输入邀请码后能成功兑换并跳转到相应首页
3. 账号切换后能正确处理
4. Console 无红色错误
5. Network 无 401/403 未处理错误
6. Cookie 正确设置且可读
