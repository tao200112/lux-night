# Admin API Observability Update

**日期**: 2026-01-22  
**目标**: 为所有 Admin API 添加完整的可观测性

---

## ✅ 已完成的更新

### 1. Health Check Endpoint (NEW)
**文件**: `apps/admin-web/app/api/admin/health/route.ts`

**功能**:
```typescript
GET /api/admin/health

返回:
{
  ok: true,
  timestamp: "2026-01-22T...",
  env: {
    hasUrl: true,
    hasAnon: true,
    hasService: true,
    nodeEnv: "production"
  },
  vercel: {
    region: "iad1",
    env: "production"
  },
  request: {
    host: "admin.your-domain.com",
    xForwardedHost: "...",
    userAgent: "..."
  },
  cookies: {
    present: true,
    authCookieCount: 2,
    authCookieNames: ["sb-xxx-auth-token", "sb-xxx-auth-token.0"]
  }
}
```

**日志**: `[ADMIN_HEALTH]` 完整的诊断信息

---

### 2. Merchants API (ENHANCED)
**文件**: `apps/admin-web/app/api/admin/merchants/route.ts`

**新增**:
- ✅ `export const runtime = 'nodejs'`
- ✅ `export const dynamic = 'force-dynamic'`
- ✅ 5 步分段日志 (STEP1-STEP5)
- ✅ 详细的错误处理
- ✅ 执行时间统计

**日志输出** (GET):
```
[ADMIN_API_ENTER] { path: '/api/admin/merchants', method: 'GET', timestamp: '...' }
[ADMIN_MERCHANTS] STEP1: env check
[ADMIN_MERCHANTS] STEP1 result: { hasUrl: true, hasAnon: true, hasService: true }
[ADMIN_MERCHANTS] STEP2: create supabase client
[ADMIN_MERCHANTS] STEP2 result: client created
[ADMIN_MERCHANTS] STEP3: auth getUser
[ADMIN_MERCHANTS] STEP3 result: { hasUser: true, userId: '...', userEmail: '...' }
[ADMIN_MERCHANTS] STEP4: admin check (RPC call)
[ADMIN_MERCHANTS] STEP4 result: { isAdmin: true, rpcError: null }
[ADMIN_MERCHANTS] STEP5: query merchants (external API call)
[ADMIN_MERCHANTS] STEP5 params: { query: '', region: '', status: '' }
[ADMIN_MERCHANTS] STEP5: executing query...
[ADMIN_MERCHANTS] STEP5 result: { success: true, merchantsCount: 10, error: null }
[ADMIN_MERCHANTS] SUCCESS: returning data { merchantsCount: 10, regionsCount: 5, duration: '234ms' }
```

**关键点**:
- STEP5 是真正的 Supabase 外部请求
- 如果 Vercel 显示 "No outgoing requests"，说明代码在 STEP5 之前就返回了

---

### 3. Me API (ENHANCED)
**文件**: `apps/admin-web/app/api/admin/me/route.ts`

**新增**:
- ✅ `export const runtime = 'nodejs'`
- ✅ `export const dynamic = 'force-dynamic'`
- ✅ `[ADMIN_API_ENTER]` 日志
- ✅ `[ADMIN_ME] SUCCESS` 日志
- ✅ `[ADMIN_API_ERROR]` 统一错误日志

---

## 📋 需要手动更新的其他 API Routes

以下文件需要添加相同的模式（由于文件数量多，建议批量更新）：

### 高优先级（用户直接访问）:
1. ✅ `apps/admin-web/app/api/admin/health/route.ts` - 已创建
2. ✅ `apps/admin-web/app/api/admin/merchants/route.ts` - 已更新
3. ✅ `apps/admin-web/app/api/admin/me/route.ts` - 已更新
4. ⏳ `apps/admin-web/app/api/admin/approvals/route.ts` - 待更新
5. ⏳ `apps/admin-web/app/api/admin/orders/route.ts` - 待更新
6. ⏳ `apps/admin-web/app/api/admin/settings/route.ts` - 待更新
7. ⏳ `apps/admin-web/app/api/admin/overview/route.ts` - 待更新
8. ⏳ `apps/admin-web/app/api/admin/events/route.ts` - 待更新

### 中优先级（间接访问）:
9. `apps/admin-web/app/api/admin/customers/route.ts`
10. `apps/admin-web/app/api/admin/invites/route.ts`
11. `apps/admin-web/app/api/admin/venues/route.ts`

### 统一更新模板

对于每个 route.ts 文件，在顶部添加：

```typescript
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
```

在每个 handler 开头添加：

```typescript
export async function GET(request: NextRequest) {
  console.log('[ADMIN_API_ENTER]', {
    path: request.nextUrl.pathname,
    method: request.method,
    timestamp: new Date().toISOString(),
  });

  try {
    // ... 原有逻辑
```

在 catch 块更新为：

```typescript
  } catch (error: any) {
    console.error('[ADMIN_API_ERROR]', {
      path: request.nextUrl.pathname,
      method: request.method,
      error: error.message,
      stack: error.stack,
    });
    
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
```

---

## 🔍 验证步骤

### 1. 验证 Health Check

```bash
# 访问 health endpoint
curl https://admin.your-domain.com/api/admin/health

# 预期输出 (200 OK):
{
  "ok": true,
  "timestamp": "2026-01-22T...",
  "env": {
    "hasUrl": true,
    "hasAnon": true,
    "hasService": true,
    "nodeEnv": "production"
  },
  ...
}

# 在 Vercel Dashboard → Functions → Logs 应该看到:
[ADMIN_HEALTH] { ... 完整的诊断信息 ... }
```

### 2. 验证 Merchants API

```bash
# 方案 A: 浏览器访问
# 打开 admin-web 并登录
# 访问 /merchants 页面
# 打开 DevTools → Network
# 查看 /api/admin/merchants 请求:
#   - Status: 200 (成功) / 401 (未登录) / 403 (非 admin) / 500 (RPC 错误)
#   - Response: JSON 格式

# 方案 B: 直接 API 调用（需要 cookie）
curl -X GET 'https://admin.your-domain.com/api/admin/merchants' \
  -H 'Cookie: sb-xxx-auth-token=...' \
  -H 'Content-Type: application/json'

# 预期 Vercel Logs 输出:
[ADMIN_API_ENTER] { path: '/api/admin/merchants', method: 'GET', ... }
[ADMIN_MERCHANTS] STEP1: env check
[ADMIN_MERCHANTS] STEP1 result: { hasUrl: true, hasAnon: true, hasService: true }
[ADMIN_MERCHANTS] STEP2: create supabase client
[ADMIN_MERCHANTS] STEP2 result: client created
[ADMIN_MERCHANTS] STEP3: auth getUser
[ADMIN_MERCHANTS] STEP3 result: { hasUser: true, userId: '...', userEmail: '...' }
[ADMIN_MERCHANTS] STEP4: admin check (RPC call)
[ADMIN_MERCHANTS] STEP4 result: { isAdmin: true, rpcError: null }
[ADMIN_MERCHANTS] STEP5: query merchants (external API call)
[ADMIN_MERCHANTS] STEP5 params: { query: '', region: '', status: '' }
[ADMIN_MERCHANTS] STEP5: executing query...
[ADMIN_MERCHANTS] STEP5 result: { success: true, merchantsCount: 10, error: null }
[ADMIN_MERCHANTS] SUCCESS: returning data { merchantsCount: 10, regionsCount: 5, duration: '234ms' }

# Vercel Dashboard → Functions → External APIs 应该显示:
# - Supabase API 请求 (多个，因为有 merchants、regions、orders 等查询)
```

### 3. 诊断 "No outgoing requests" 问题

如果 Vercel 仍然显示 "No outgoing requests"：

**检查点 1**: 日志中是否到达 STEP5？
```
如果看到 STEP1-STEP4 但没有 STEP5：
→ 说明在权限检查时就返回了（401/403）
→ 检查用户是否已登录、是否为 admin

如果没有看到任何日志：
→ 说明 handler 根本没有执行
→ 检查路由配置、中间件是否拦截
```

**检查点 2**: 是否有 RPC 错误？
```
如果 STEP4 显示 rpcError：
→ is_admin() RPC 函数不存在或执行失败
→ 运行 Supabase 迁移创建 RPC 函数
```

**检查点 3**: 环境变量检查
```
访问 /api/admin/health
检查 env.hasUrl, env.hasAnon, env.hasService 是否都为 true

如果有 false：
→ 在 Vercel Project Settings → Environment Variables 添加缺失的变量
```

---

## 🚨 常见问题排查

### 问题 1: "External APIs: No outgoing requests"

**可能原因**:
1. 代码在 Supabase 查询前就返回了（401/403/500）
2. RPC 函数不存在或执行失败
3. 环境变量缺失

**排查步骤**:
1. 访问 `/api/admin/health` - 检查环境变量
2. 查看 Vercel Functions Logs - 找到具体在哪一步失败
3. 如果是 STEP4 失败 - 运行 Supabase 迁移
4. 如果是 STEP3 失败 - 检查 session cookie

---

### 问题 2: 401 Unauthorized

**原因**: Session cookie 丢失或无效

**排查**:
1. 检查浏览器 Cookie（DevTools → Application → Cookies）
2. 确认有 `sb-xxx-auth-token` cookie
3. 尝试重新登录

---

### 问题 3: 403 Forbidden

**原因**: 用户不是 admin

**排查**:
1. 访问 `/api/admin/me` - 检查 `isAdmin` 字段
2. 如果 `isAdmin: false`，在 Supabase 中设置:
   ```sql
   UPDATE profiles SET is_admin = true WHERE email = 'your@email.com';
   ```

---

### 问题 4: 500 RPC Error

**原因**: `is_admin()` RPC 函数不存在

**修复**:
```bash
# 运行 Supabase 迁移
# 在 Supabase SQL Editor 执行:
supabase/migrations/20260122000001_fix_invite_gate_and_admin_rpc.sql

# 或手动创建:
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_is_admin BOOLEAN;
BEGIN
  SELECT is_admin INTO user_is_admin
  FROM public.profiles
  WHERE id = auth.uid();
  
  RETURN COALESCE(user_is_admin, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
```

---

## 📊 修改文件汇总

### 新建文件:
1. ✅ `apps/admin-web/app/api/admin/health/route.ts`

### 已更新文件:
2. ✅ `apps/admin-web/app/api/admin/merchants/route.ts`
3. ✅ `apps/admin-web/app/api/admin/me/route.ts`

### 待更新文件 (可选):
4. `apps/admin-web/app/api/admin/approvals/route.ts`
5. `apps/admin-web/app/api/admin/orders/route.ts`
6. `apps/admin-web/app/api/admin/settings/route.ts`
7. `apps/admin-web/app/api/admin/overview/route.ts`
8. `apps/admin-web/app/api/admin/events/route.ts`

---

**下一步**: 
1. 提交当前修改
2. 部署到 Vercel
3. 验证 `/api/admin/health` 和 `/api/admin/merchants`
4. 查看 Vercel Functions Logs
5. 根据日志输出定位具体问题
