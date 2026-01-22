# Lux Night - 诊断和修复计划

**日期**: 2026-01-22  
**问题**: OAuth 跨域、Invite Gate 旧用户、Admin API 加载失败

---

## 🔍 根因列表

### 1. OAuth 跨域问题 ⚠️ 需要优化

**当前状态**: 
- ✅ 已使用 `getOAuthRedirectTo(window.location.origin)` - 正确
- ✅ 回调到 `/auth/callback` - 正确
- ⚠️ 使用 localStorage 存储目标路径 - 可能在某些场景失效

**根因**:
- localStorage 在跨域、隐私模式、某些浏览器可能失效
- 用户要求使用 `?redirect=` query 参数（更可靠）

**风险**:
- 低 - 当前实现基本可用，但不够健壮

---

### 2. Invite Gate 旧用户问题 ❌ 关键问题

**当前状态**:
- ❌ `internal-web/middleware.ts` (140-149行): 强制所有无 membership 用户跳转 `/invite`
- ❌ `internal-web/app/auth/post-login/page.tsx` (61-75行): 同样的强制逻辑
- ❌ 没有白名单/bypass 机制
- ❌ 没有邀请码兑换 API

**根因**:
1. **硬编码的门禁逻辑**: 没有考虑旧用户、测试账号、管理员账号
2. **缺少邀请码兑换流程**: 即使用户有邀请码，也没有后端 API 处理
3. **缺少数据迁移方案**: 旧用户数据库里有 profile，但没有 merchant_members 记录

**影响**:
- 🔴 **阻塞**: 所有旧用户无法登录 internal-web
- 🔴 **阻塞**: 测试和开发账号无法绕过门禁
- 🔴 **阻塞**: 新用户即使有邀请码也无法加入

---

### 3. Admin-Web 数据加载问题 ⚠️ 可能是误判

**当前状态**:
- ⚠️ Console 只有 favicon 404
- ❓ 需要确认是否真的有 API 401/403/500

**根因（待确认）**:
1. **Favicon 404**: `apps/admin-web/public/favicon.ico` 不存在 - ✅ 已确认
2. **API 认证失败**: 可能的原因：
   - RPC 函数 `is_admin()` 不存在
   - Session cookie 读取失败
   - RLS 策略阻止查询

**需要检查**:
- `/api/admin/merchants` 实际返回状态码
- `/api/admin/me` 实际返回状态码
- Supabase RPC `is_admin()` 是否存在
- `profiles.is_admin` 字段是否存在

---

## 🔧 修复方案

### A) OAuth Redirect 参数支持（优化但非必需）

**文件**: 
1. `apps/internal-web/app/auth/callback/route.ts`
2. `apps/customer-web/app/auth/callback/route.ts`
3. `apps/admin-web/app/auth/callback/route.ts` (如果未来支持 OAuth)

**改动**:
```typescript
// 支持 query 参数 ?redirect=xxx 作为 fallback
const redirectParam = requestUrl.searchParams.get('redirect');
const safeRedirect = normalizeRelativePath(redirectParam, '/auth/post-login');

// 优先级：
// 1. localStorage (现有机制，客户端 post-login 页面处理)
// 2. Query 参数 (fallback，服务端直接重定向)
return NextResponse.redirect(new URL(safeRedirect, request.url));
```

**优先级**: 🟡 中（现有机制基本可用）

---

### B) Internal-Web Invite Gate 修复 🔴 高优先级

#### B1. 环境变量白名单

**文件**: 
- `apps/internal-web/middleware.ts`
- `apps/internal-web/app/auth/post-login/page.tsx`

**新增环境变量**:
```env
# 逗号分隔的邮箱白名单，这些用户不需要 membership 即可访问
INTERNAL_BYPASS_EMAILS=admin@example.com,test@example.com,your@email.com
```

**改动逻辑**:
```typescript
// 1. 检查邮箱白名单
const bypassEmails = (process.env.INTERNAL_BYPASS_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
if (bypassEmails.includes(user.email)) {
  console.log('[BYPASS] User email in bypass list, allowing access');
  return response; // 或 router.replace(targetPath)
}

// 2. 检查 membership（现有逻辑）
const { data: memberships } = await supabase
  .from('merchant_members')
  .select('id')
  .eq('user_id', user.id)
  .eq('is_active', true)
  .limit(1);

if (memberships && memberships.length > 0) {
  // 有 membership，允许访问
  return response;
}

// 3. 无 membership 且不在白名单，跳转 /invite
return NextResponse.redirect(new URL('/invite?reason=no_membership', request.url));
```

#### B2. 邀请码兑换 API

**新建文件**: `apps/internal-web/app/api/invite/consume/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 1. 检查用户登录
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. 读取邀请码
    const { code } = await request.json();
    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Invite code is required' },
        { status: 400 }
      );
    }

    // 3. 查询邀请码（使用 service role key 绕过 RLS）
    const { createClient: createServiceClient } = await import('@supabase/supabase-js');
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: invite, error: inviteError } = await serviceSupabase
      .from('invites')
      .select('id, code, merchant_id, role, status, used_by, expires_at')
      .eq('code', code)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json(
        { success: false, error: 'Invalid invite code' },
        { status: 404 }
      );
    }

    // 4. 验证邀请码状态
    if (invite.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'Invite code is not active' },
        { status: 400 }
      );
    }

    if (invite.used_by) {
      return NextResponse.json(
        { success: false, error: 'Invite code has been used' },
        { status: 400 }
      );
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Invite code has expired' },
        { status: 400 }
      );
    }

    // 5. 检查用户是否已经是该 merchant 的成员
    const { data: existingMembership } = await serviceSupabase
      .from('merchant_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('merchant_id', invite.merchant_id)
      .single();

    if (existingMembership) {
      return NextResponse.json(
        { success: false, error: 'You are already a member of this merchant' },
        { status: 400 }
      );
    }

    // 6. 创建 merchant_member 记录
    const { error: memberError } = await serviceSupabase
      .from('merchant_members')
      .insert({
        merchant_id: invite.merchant_id,
        user_id: user.id,
        role: invite.role || 'staff',
        is_active: true,
      });

    if (memberError) {
      console.error('[INVITE CONSUME] Failed to create membership:', memberError);
      return NextResponse.json(
        { success: false, error: 'Failed to join merchant' },
        { status: 500 }
      );
    }

    // 7. 标记邀请码为已使用
    const { error: updateError } = await serviceSupabase
      .from('invites')
      .update({
        status: 'used',
        used_by: user.id,
        used_at: new Date().toISOString(),
      })
      .eq('id', invite.id);

    if (updateError) {
      console.error('[INVITE CONSUME] Failed to mark invite as used:', updateError);
      // 不返回错误，membership 已创建成功
    }

    return NextResponse.json({
      success: true,
      data: {
        merchant_id: invite.merchant_id,
        role: invite.role || 'staff',
        next: '/workspaces',
      },
    });

  } catch (error: any) {
    console.error('[INVITE CONSUME] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

#### B3. 前端邀请码兑换

**文件**: `apps/internal-web/app/invite/page.tsx`

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  setError(null);

  try {
    const response = await fetch('/api/invite/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: token }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      setError(result.error || 'Failed to join merchant');
      return;
    }

    // 成功，跳转到 workspaces
    router.push(result.data.next || '/workspaces');
  } catch (err: any) {
    setError('Network error, please try again');
  } finally {
    setLoading(false);
  }
};
```

#### B4. 数据迁移脚本

**新建文件**: `scripts/migrate-old-users.ts`

```typescript
/**
 * Migrate Old Users to Merchant Members
 * 
 * Usage:
 * SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=yyy DEFAULT_MERCHANT_ID=zzz pnpm tsx scripts/migrate-old-users.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEFAULT_MERCHANT_ID = process.env.DEFAULT_MERCHANT_ID!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DEFAULT_MERCHANT_ID) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function migrateOldUsers() {
  console.log('[MIGRATION] Starting old users migration...');
  
  // 1. 查询所有 profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email, created_at')
    .order('created_at', { ascending: true });

  if (profilesError) {
    console.error('[MIGRATION] Failed to fetch profiles:', profilesError);
    return;
  }

  console.log(`[MIGRATION] Found ${profiles.length} profiles`);

  let migratedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const profile of profiles) {
    // 2. 检查是否已有 merchant_members
    const { data: existingMembership } = await supabase
      .from('merchant_members')
      .select('id')
      .eq('user_id', profile.id)
      .single();

    if (existingMembership) {
      console.log(`[MIGRATION] Skipping ${profile.email} - already has membership`);
      skippedCount++;
      continue;
    }

    // 3. 创建 merchant_member
    const { error: insertError } = await supabase
      .from('merchant_members')
      .insert({
        merchant_id: DEFAULT_MERCHANT_ID,
        user_id: profile.id,
        role: 'staff',
        is_active: true,
      });

    if (insertError) {
      console.error(`[MIGRATION] Failed to migrate ${profile.email}:`, insertError);
      failedCount++;
    } else {
      console.log(`[MIGRATION] ✅ Migrated ${profile.email}`);
      migratedCount++;
    }
  }

  console.log('[MIGRATION] ========================================');
  console.log(`[MIGRATION] Total profiles: ${profiles.length}`);
  console.log(`[MIGRATION] Migrated: ${migratedCount}`);
  console.log(`[MIGRATION] Skipped: ${skippedCount}`);
  console.log(`[MIGRATION] Failed: ${failedCount}`);
  console.log('[MIGRATION] ========================================');
}

migrateOldUsers().catch(console.error);
```

**SQL 快速迁移**:

```sql
-- 快速将所有旧用户关联到默认 merchant
-- 替换 'YOUR_MERCHANT_ID' 为实际的 merchant ID

INSERT INTO merchant_members (merchant_id, user_id, role, is_active)
SELECT 
  'YOUR_MERCHANT_ID',
  p.id,
  'staff',
  true
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM merchant_members mm 
  WHERE mm.user_id = p.id
);
```

---

### C) Admin-Web 诊断和修复

#### C1. 添加 Favicon

**新建文件**: `apps/admin-web/public/favicon.ico`
- 从 `apps/customer-web/public/favicon.ico` 复制
- 或使用默认的浏览器图标

#### C2. 检查 RPC 函数

**SQL 检查**:

```sql
-- 检查 is_admin() RPC 函数是否存在
SELECT routine_name, routine_type, routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'is_admin';
```

**如果不存在，创建**:

```sql
-- 创建 is_admin() RPC 函数
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND is_admin = true
  );
END;
$$;

-- 授权
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
```

#### C3. 检查 profiles.is_admin 字段

**SQL 检查**:

```sql
-- 检查 is_admin 字段是否存在
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name = 'is_admin';
```

**如果不存在，添加**:

```sql
-- 添加 is_admin 字段
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 为现有管理员设置
UPDATE profiles
SET is_admin = true
WHERE email IN ('admin@example.com', 'your@email.com');
```

#### C4. 增强 API 错误日志

**文件**: `apps/admin-web/app/api/admin/merchants/route.ts`

```typescript
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 检查 Admin 权限
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    console.log('[ADMIN API] /api/admin/merchants', {
      hasUser: !!user,
      userId: user?.id,
      userError: userError?.message,
    });
    
    if (!user) {
      return NextResponse.json(
        { success: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' },
        { status: 401 }
      );
    }
    
    const { data: isAdmin, error: rpcError } = await supabase.rpc('is_admin');
    
    console.log('[ADMIN API] is_admin check', {
      isAdmin,
      rpcError: rpcError?.message,
    });
    
    if (rpcError) {
      console.error('[ADMIN API] RPC error:', rpcError);
      return NextResponse.json(
        { success: false, code: 'RPC_ERROR', message: rpcError.message },
        { status: 500 }
      );
    }
    
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', message: 'Must be admin' },
        { status: 403 }
      );
    }
    
    // ... 后续逻辑
  } catch (error: any) {
    console.error('[ADMIN API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
```

---

## 📋 修改文件清单

### 必须修改（高优先级）:

1. ✅ `apps/internal-web/middleware.ts` - 添加邮箱白名单检查
2. ✅ `apps/internal-web/app/auth/post-login/page.tsx` - 添加邮箱白名单检查
3. ✅ `apps/internal-web/app/api/invite/consume/route.ts` (新建) - 邀请码兑换 API
4. ✅ `apps/internal-web/app/invite/page.tsx` - 更新前端兑换逻辑
5. ✅ `apps/admin-web/public/favicon.ico` (新建) - 添加图标
6. ✅ `scripts/migrate-old-users.ts` (新建) - 旧用户迁移脚本
7. ✅ `supabase/migrations/xxx_add_is_admin_rpc.sql` (新建) - RPC 函数

### 可选优化（中优先级）:

8. 🟡 `apps/internal-web/app/auth/callback/route.ts` - 支持 `?redirect=` fallback
9. 🟡 `apps/customer-web/app/auth/callback/route.ts` - 支持 `?redirect=` fallback
10. 🟡 `apps/admin-web/app/api/admin/merchants/route.ts` - 增强错误日志

---

## ✅ 验证清单

### Internal-Web:

#### 1. 白名单用户测试
- [ ] 设置 `INTERNAL_BYPASS_EMAILS=test@example.com`
- [ ] 使用 `test@example.com` 登录
- [ ] 确认直接进入 `/workspaces`（不要求邀请码）

#### 2. 旧用户迁移测试
- [ ] 运行迁移脚本或 SQL
- [ ] 使用旧用户登录
- [ ] 确认可以进入 `/workspaces`

#### 3. 邀请码兑换测试
- [ ] 创建新测试账号（无 membership）
- [ ] 登录后进入 `/invite` 页面
- [ ] 输入有效邀请码
- [ ] 确认 API 调用成功 (`/api/invite/consume`)
- [ ] 确认跳转到 `/workspaces`
- [ ] 确认数据库中创建了 `merchant_members` 记录
- [ ] 确认邀请码被标记为 `used`

#### 4. 新用户拒绝测试
- [ ] 创建新测试账号（无 membership，不在白名单）
- [ ] 登录后确认跳转到 `/invite`
- [ ] 不输入邀请码，尝试访问 `/workspaces`
- [ ] 确认被 middleware 重定向回 `/invite`

### Admin-Web:

#### 1. Favicon 测试
- [ ] 访问 admin-web 首页
- [ ] 确认浏览器 Console 无 favicon 404

#### 2. API 认证测试
- [ ] 使用 admin 账号登录
- [ ] 访问 `/dashboard`
- [ ] 打开浏览器 DevTools → Network
- [ ] 检查 `/api/admin/merchants` 状态码
  - ✅ 200 - 成功
  - ❌ 401 - Session 丢失
  - ❌ 403 - 非 admin
  - ❌ 500 - RPC 错误
- [ ] 检查 Console 日志

#### 3. RPC 函数测试
- [ ] 在 Supabase SQL Editor 运行:
  ```sql
  SELECT public.is_admin();
  ```
- [ ] 确认返回 `true` (admin) 或 `false` (非 admin)

### Customer-Web:

#### 1. OAuth 回调测试
- [ ] 使用 Google 登录
- [ ] 确认回调到 `https://customer-app.com/auth/callback`（不跳到其他应用）
- [ ] 确认成功进入首页

---

## 🌍 需要在 Vercel / Supabase 配置的环境变量

### Vercel - Internal-Web Project:

```env
# 新增：邮箱白名单（逗号分隔）
INTERNAL_BYPASS_EMAILS=admin@example.com,test@example.com,your@email.com
```

### Vercel - 所有 Projects（如果缺失）:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Supabase:

**RPC 函数**:
- 运行 SQL 创建 `is_admin()` 函数（见上文）

**Database 表**:
- 确认 `profiles` 表有 `is_admin BOOLEAN` 字段
- 确认 `merchant_members` 表结构正确

---

**下一步**: 按修改文件清单逐个实施修复
