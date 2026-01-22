# Invite Gate & Auth Fix Summary

**日期**: 2026-01-22  
**修复内容**: Internal-Web Invite Gate 旧用户问题、邀请码兑换 API、Admin RPC

---

## 🎯 修复目标

### 问题 1: Internal-Web Invite Gate 阻塞所有无 membership 用户
**症状**: 旧用户（数据库有 profile）登录后被要求输入邀请码  
**根因**: Middleware 和 post-login 页面强制检查 `merchant_members`，无白名单机制  
**影响**: 🔴 阻塞所有旧用户和测试账号

### 问题 2: 缺少邀请码兑换后端 API
**症状**: 前端 invite 页面调用的 API 不存在  
**根因**: 没有实现 `/api/invite/consume` 路由  
**影响**: 🔴 新用户无法加入 merchant

### 问题 3: Admin-Web API 可能失败
**症状**: 页面骨架屏，Console 只有 favicon 404  
**根因**: 可能是 RPC 函数 `is_admin()` 不存在  
**影响**: ⚠️ 待确认是否真实问题

---

## ✅ 已实施的修复

### 修复 1: 添加邮箱白名单支持

#### 1.1 Updated `apps/internal-web/middleware.ts`

**改动**:
- 添加环境变量 `NEXT_PUBLIC_INTERNAL_BYPASS_EMAILS` 支持
- 白名单用户直接放行，不检查 membership
- 优先级: 白名单 > Membership > Invite Gate

**代码**:
```typescript
// 1. 检查邮箱白名单
const bypassEmails = (process.env.NEXT_PUBLIC_INTERNAL_BYPASS_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const userEmail = user.email?.toLowerCase() || '';
const isBypassUser = bypassEmails.includes(userEmail);

if (isBypassUser) {
  console.log('[MIDDLEWARE] ✅ User in bypass list, allowing access:', userEmail);
  return response;
}
```

#### 1.2 Updated `apps/internal-web/app/auth/post-login/page.tsx`

**改动**:
- 添加相同的白名单检查逻辑
- 白名单用户直接跳转到目标页面
- 与 middleware 保持一致

**代码**:
```typescript
// 2. 检查邮箱白名单（与 middleware 保持一致）
const bypassEmails = (process.env.NEXT_PUBLIC_INTERNAL_BYPASS_EMAILS || '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

const userEmail = user.email?.toLowerCase() || '';
const isBypassUser = bypassEmails.includes(userEmail);

if (isBypassUser) {
  const targetPath = consumePostAuthRedirect(APP_NAME, DEFAULT_AFTER_LOGIN);
  console.log('[PostLogin] ✅ User in bypass list, redirecting to:', targetPath);
  router.replace(targetPath);
  return;
}
```

---

### 修复 2: 邀请码兑换 API

#### 2.1 Created `apps/internal-web/app/api/invite/consume/route.ts`

**功能**:
1. ✅ 验证用户登录状态
2. ✅ 查询邀请码（使用 Service Role Key 绕过 RLS）
3. ✅ 验证邀请码状态（active, 未使用, 未过期）
4. ✅ 检查用户是否已是成员（幂等操作）
5. ✅ 创建 `merchant_members` 记录
6. ✅ 标记邀请码为 `used`
7. ✅ 返回跳转目标 `/workspaces`

**API 接口**:
```typescript
POST /api/invite/consume

Request:
{
  "code": "INVITE123"
}

Response (Success):
{
  "success": true,
  "data": {
    "merchant_id": "xxx",
    "role": "staff",
    "next": "/workspaces"
  }
}

Response (Error):
{
  "success": false,
  "error": "Invalid invite code"
}
```

**错误处理**:
- 401: 未登录
- 400: 邀请码无效/已使用/已过期
- 404: 邀请码不存在
- 500: 服务器错误

#### 2.2 Updated `apps/internal-web/app/invite/page.tsx`

**改动**:
- 修改 API 调用从 `/api/invites/redeem` 到 `/api/invite/consume`
- 修改请求体格式从 `{ token }` 到 `{ code }`
- 显示错误消息而不是直接跳转 invalid 页面
- 成功后跳转到 API 返回的 `next` 路径

**代码**:
```typescript
const res = await fetch('/api/invite/consume', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: token.trim() }),
});

const data = await res.json();

if (!res.ok || !data.success) {
  setError(data.error || 'Failed to redeem invite code. Please try again.');
  return;
}

// 成功，跳转到工作台
router.push(data.data.next || '/workspaces');
```

---

### 修复 3: 数据迁移工具

#### 3.1 Created `scripts/migrate-old-users.ts`

**功能**:
- ✅ 读取所有 profiles
- ✅ 检查哪些用户没有 merchant_members
- ✅ 将这些用户关联到指定的默认 merchant
- ✅ 提供详细的进度和错误日志

**使用方法**:
```bash
# 设置环境变量
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
DEFAULT_MERCHANT_ID=your_merchant_id \
DEFAULT_ROLE=staff \
pnpm tsx scripts/migrate-old-users.ts
```

**输出示例**:
```
========================================
🚀 Starting Old Users Migration
========================================
Supabase URL: https://xxx.supabase.co
Default Merchant ID: merchant_123
Default Role: staff
========================================

📋 Step 1: Verifying default merchant...
✅ Found merchant: Test Merchant (merchant_123)

📋 Step 2: Fetching all user profiles...
✅ Found 50 profiles

📋 Step 3: Migrating users...
----------------------------------------
[1/50] Processing: john@example.com
  ✅ Migrated successfully (role: staff)
[2/50] Processing: jane@example.com
  ⏭️  Skipped - already has membership (role: owner)
...
----------------------------------------

========================================
📊 Migration Summary
========================================
Total profiles:     50
✅ Migrated:        35
⏭️  Skipped:         15
❌ Failed:          0
⏱️  Duration:        2.34s
========================================

✅ Migration completed successfully!
```

#### 3.2 Created `supabase/migrations/20260122000001_fix_invite_gate_and_admin_rpc.sql`

**功能**:
1. ✅ 添加 `profiles.is_admin` 列（如果不存在）
2. ✅ 创建 `is_admin()` RPC 函数
3. ✅ 授予 authenticated 用户执行权限
4. ✅ 提供手动迁移 SQL（注释掉）

**RPC 函数**:
```sql
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
```

**手动迁移 SQL** (需要手动执行):
```sql
-- 替换 'YOUR_MERCHANT_ID' 为实际 merchant ID
INSERT INTO public.merchant_members (merchant_id, user_id, role, is_active)
SELECT 
  'YOUR_MERCHANT_ID',
  p.id,
  'staff',
  TRUE
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 
  FROM public.merchant_members mm 
  WHERE mm.user_id = p.id
);
```

---

## 🌍 需要配置的环境变量

### Vercel - Internal-Web Project

**新增**:
```env
# 邮箱白名单（逗号分隔，用于绕过 membership 检查）
NEXT_PUBLIC_INTERNAL_BYPASS_EMAILS=admin@example.com,test@example.com,your@email.com
```

**说明**:
- 使用 `NEXT_PUBLIC_` 前缀，因为需要在客户端和服务端保持一致
- 多个邮箱用逗号分隔
- 不区分大小写（代码中会自动转换为小写）
- 这些用户可以直接访问 internal-web，不需要 merchant membership

### Vercel - 所有 Projects (确认已设置)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 📋 验证清单

### Internal-Web:

#### ✅ 白名单用户测试
```bash
# 1. 在 Vercel 设置环境变量
NEXT_PUBLIC_INTERNAL_BYPASS_EMAILS=test@example.com

# 2. 使用 test@example.com 登录
# 3. 确认直接进入 /workspaces（不要求邀请码）
```

#### ✅ 邀请码兑换测试
```bash
# 1. 创建新测试账号（无 membership）
# 2. 登录后进入 /invite 页面
# 3. 输入有效邀请码
# 4. 确认 API 调用成功
# 5. 确认跳转到 /workspaces
# 6. 确认数据库中创建了 merchant_members 记录
# 7. 确认邀请码被标记为 used
```

#### ✅ 旧用户迁移测试
```bash
# 方案 1: 使用 TypeScript 脚本
SUPABASE_URL=xxx \
SUPABASE_SERVICE_ROLE_KEY=yyy \
DEFAULT_MERCHANT_ID=zzz \
pnpm tsx scripts/migrate-old-users.ts

# 方案 2: 使用 SQL（在 Supabase SQL Editor 中）
-- 替换 'YOUR_MERCHANT_ID' 然后执行
INSERT INTO merchant_members (merchant_id, user_id, role, is_active)
SELECT 'YOUR_MERCHANT_ID', p.id, 'staff', TRUE
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM merchant_members mm WHERE mm.user_id = p.id
);
```

#### ✅ 新用户拒绝测试
```bash
# 1. 创建新测试账号（无 membership，不在白名单）
# 2. 登录后确认跳转到 /invite
# 3. 不输入邀请码，尝试访问 /workspaces
# 4. 确认被 middleware 重定向回 /invite
```

### Admin-Web:

#### ✅ RPC 函数测试
```sql
-- 在 Supabase SQL Editor 运行
SELECT public.is_admin();
-- 应返回 true (admin) 或 false (非 admin)
```

#### ✅ API 认证测试
```bash
# 1. 使用 admin 账号登录
# 2. 访问 /dashboard
# 3. 打开浏览器 DevTools → Network
# 4. 检查 /api/admin/merchants 状态码
#    ✅ 200 - 成功
#    ❌ 401 - Session 丢失
#    ❌ 403 - 非 admin
#    ❌ 500 - RPC 错误
```

---

## 🚀 部署步骤

### Step 1: 部署代码更新

```bash
# 1. 提交所有修改
git add .
git commit -m "fix: invite gate bypass + API + migration tools"
git push origin main

# 2. Vercel 自动部署
# 等待部署完成
```

### Step 2: 配置 Vercel 环境变量

```bash
# 在 Vercel Dashboard → Internal-Web Project → Settings → Environment Variables
# 添加：
NEXT_PUBLIC_INTERNAL_BYPASS_EMAILS=your@email.com,test@example.com
```

### Step 3: 运行 Supabase 迁移

```bash
# 方案 A: 使用 Supabase CLI
supabase db push

# 方案 B: 在 Supabase Dashboard → SQL Editor 手动执行
# 复制 supabase/migrations/20260122000001_fix_invite_gate_and_admin_rpc.sql 内容
# 粘贴并执行
```

### Step 4: 迁移旧用户

```bash
# 方案 A: 使用 TypeScript 脚本（推荐）
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=xxx \
DEFAULT_MERCHANT_ID=yyy \
pnpm tsx scripts/migrate-old-users.ts

# 方案 B: 使用 SQL（简单快速）
# 在 Supabase SQL Editor 执行:
INSERT INTO merchant_members (merchant_id, user_id, role, is_active)
SELECT 'YOUR_MERCHANT_ID', p.id, 'staff', TRUE
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM merchant_members mm WHERE mm.user_id = p.id
);
```

### Step 5: 验证修复

```bash
# 1. 白名单用户测试（见验证清单）
# 2. 邀请码兑换测试（见验证清单）
# 3. 旧用户登录测试
# 4. Admin API 测试（见验证清单）
```

---

## 📊 修改文件汇总

### 必须修改（已完成）:

1. ✅ `apps/internal-web/middleware.ts` - 添加邮箱白名单检查
2. ✅ `apps/internal-web/app/auth/post-login/page.tsx` - 添加邮箱白名单检查
3. ✅ `apps/internal-web/app/api/invite/consume/route.ts` (新建) - 邀请码兑换 API
4. ✅ `apps/internal-web/app/invite/page.tsx` - 更新前端兑换逻辑
5. ✅ `scripts/migrate-old-users.ts` (新建) - 旧用户迁移脚本
6. ✅ `supabase/migrations/20260122000001_fix_invite_gate_and_admin_rpc.sql` (新建) - 数据库修复

### 文档:

7. ✅ `DIAGNOSIS_AND_FIX_PLAN.md` - 完整诊断报告
8. ✅ `INVITE_GATE_AND_AUTH_FIX_SUMMARY.md` (本文件) - 修复总结

---

## 🔍 根因总结

### 问题 1: 硬编码的门禁逻辑
**根因**: Middleware 和 post-login 页面没有白名单/bypass 机制  
**后果**: 所有无 membership 的用户都被阻塞  
**修复**: 添加 `NEXT_PUBLIC_INTERNAL_BYPASS_EMAILS` 环境变量支持

### 问题 2: 缺少后端 API
**根因**: 邀请码兑换 API 未实现  
**后果**: 新用户无法加入 merchant  
**修复**: 创建 `/api/invite/consume` 路由，使用 Service Role Key 绕过 RLS

### 问题 3: 旧用户数据不完整
**根因**: 旧用户有 profile 但没有 merchant_members 记录  
**后果**: 旧用户无法通过 invite gate  
**修复**: 提供 TypeScript 脚本和 SQL 进行数据迁移

---

## 💡 最佳实践

### 1. 门禁逻辑设计
- ✅ 提供白名单/bypass 机制（管理员、测试账号）
- ✅ 分离公开路径、认证路径、保护路径
- ✅ 在 middleware 和 post-login 保持一致的逻辑

### 2. API 设计
- ✅ 使用 Service Role Key 进行需要绕过 RLS 的操作
- ✅ 详细的错误处理和日志
- ✅ 幂等操作（重复调用不产生副作用）
- ✅ 清晰的请求/响应格式

### 3. 数据迁移
- ✅ 提供多种方案（脚本、SQL）
- ✅ 详细的进度和错误报告
- ✅ Dry-run 模式（查看影响范围）
- ✅ 可回滚的操作

---

## 🎉 完成状态

- ✅ Internal-Web Invite Gate 修复完成
- ✅ 邀请码兑换 API 创建完成
- ✅ 数据迁移工具创建完成
- ✅ Supabase 迁移文件创建完成
- ✅ 文档完善

**下一步**: 按部署步骤执行，验证所有功能正常
