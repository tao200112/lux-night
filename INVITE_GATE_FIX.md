# Internal-Web Invite Gate 逻辑修复

## 📋 问题描述

**症状**: Internal/merchant 端登录后总要求输入邀请码，即使是已有 profiles 记录的老用户。

**用户期望**: 
- 只有当用户不属于任何 merchant（无 membership）时，才显示邀请码页面
- 若用户已属于 merchant，直接进入 /workspaces

---

## 🔍 根本原因分析

### 问题 1: Post-Login 页面缺少 Membership 检查 ❌

**文件**: `apps/internal-web/app/auth/post-login/page.tsx` (旧版)

```typescript
// ❌ 有问题的代码
export default function PostLoginPage() {
  useEffect(() => {
    // 直接从 localStorage 读取目标路径并跳转
    const targetPath = consumePostAuthRedirect(APP_NAME, DEFAULT_AFTER_LOGIN);
    router.replace(targetPath);  // 跳转到 /workspaces
  }, [router]);
}
```

**问题**:
1. 没有检查用户是否有 merchant membership
2. 直接跳转到 `/workspaces`（DEFAULT_AFTER_LOGIN）
3. Middleware 检测到无 membership，重定向到 `/invite`
4. 造成用户困惑：为什么登录后还要邀请码？

**流程**:
```
登录成功
  ↓
post-login 页面
  ↓
直接跳转到 /workspaces（没检查 membership）
  ↓
middleware 拦截
  ↓
检查 membership → 无
  ↓
重定向到 /invite ❌ 用户困惑
```

### 问题 2: 无差异化的提示信息 ❌

**旧的 invite 页面**:
- 不区分新用户和老用户
- 没有解释为什么需要邀请码
- 老用户（有 profile）看到和新用户一样的提示，感到困惑

---

## ✅ 修复方案

### 修复 1: Post-Login 增加 Membership 检查

**文件**: `apps/internal-web/app/auth/post-login/page.tsx`

**新逻辑**:
```typescript
export default function PostLoginPage() {
  useEffect(() => {
    async function checkMembershipAndRedirect() {
      // 1. 获取当前用户
      const { data: { user } } = await supabase.auth.getUser();
      
      // 2. 检查 merchant membership
      const { data: memberships } = await supabase
        .from('merchant_members')
        .select('id, merchant_id, role')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1);
      
      // 3. 根据结果决定跳转
      if (memberships && memberships.length > 0) {
        // ✅ 有 membership - 跳转到工作台
        const targetPath = consumePostAuthRedirect(APP_NAME, DEFAULT_AFTER_LOGIN);
        router.replace(targetPath);
      } else {
        // ❌ 无 membership - 跳转到邀请码页面
        router.replace('/invite?reason=no_membership');
      }
    }
    
    checkMembershipAndRedirect();
  }, [router]);
}
```

**改进**:
- ✅ 登录后立即检查 membership
- ✅ 有 membership → 进入工作台
- ✅ 无 membership → 进入邀请码页面（带 reason 参数）
- ✅ 避免用户困惑

### 修复 2: Invite 页面差异化提示

**文件**: `apps/internal-web/app/invite/page.tsx`

**新增 reason 参数支持**:

| Reason | 场景 | 提示信息 |
|--------|------|---------|
| `no_membership` | 老用户无 merchant 关联 | "Welcome back! Your account is active, but you need to join a merchant..." |
| `query_error` | Membership 查询失败 | "Unable to verify your membership status..." |
| `error` | 其他错误 | "An error occurred during login..." |
| （无） | 首次访问 | "Enter your invite code to access the internal workspace" |

**特殊提示（老用户）**:
```tsx
{reason === 'no_membership' && (
  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
    <p className="text-sm text-blue-800 dark:text-blue-300">
      <strong>Welcome back!</strong> Your account is active, but you need to join a merchant to access the workspace. 
      Please contact your merchant owner to get an invite code.
    </p>
  </div>
)}
```

### 修复 3: Middleware 增强日志

**文件**: `apps/internal-web/middleware.ts`

**新增日志**:
```typescript
// 打印 membership 检查结果
console.log('[MIDDLEWARE] Membership check:', {
  userId: user.id,
  hasMembership: memberships && memberships.length > 0,
  membershipCount: memberships?.length || 0,
  memberships: memberships || [],
});

// 无 membership 时的日志
if (!memberships || memberships.length === 0) {
  console.log('[MIDDLEWARE] ⚠️ No membership found, redirecting to /invite');
  const inviteUrl = new URL('/invite', request.url);
  inviteUrl.searchParams.set('reason', 'no_membership');
  return NextResponse.redirect(inviteUrl);
}
```

**改进**:
- ✅ 详细的 membership 信息
- ✅ 清晰的重定向日志
- ✅ 便于诊断问题

---

## 📊 数据来源确认

### Membership 表: `merchant_members`

**Schema** (来自 `supabase/migrations/001_schema.sql`):
```sql
CREATE TABLE public.merchant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('staff','manager','owner','admin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_members_user ON public.merchant_members(user_id);
CREATE INDEX idx_members_merchant ON public.merchant_members(merchant_id);
```

### SQL 查询

**检查用户是否有 active membership**:
```sql
SELECT id, merchant_id, role, is_active
FROM public.merchant_members
WHERE user_id = $1
  AND is_active = true
LIMIT 1;
```

**返回结果**:
- ✅ 有记录 → 用户属于 merchant，允许访问
- ❌ 无记录 → 用户不属于任何 merchant，需要邀请码

---

## 🔄 修复后的完整流程

### 场景 1: 老用户有 Membership ✅

```
1. 用户登录（Google OAuth）
   ↓
2. /auth/callback → exchangeCodeForSession
   ↓
3. 重定向到 /auth/post-login
   ↓
4. Post-login 检查 membership
   SELECT * FROM merchant_members WHERE user_id = ? AND is_active = true
   ↓
5. 结果：✅ 找到记录
   ↓
6. 读取 localStorage 的目标路径（或使用 /workspaces）
   ↓
7. router.replace('/workspaces')
   ↓
8. Middleware 检查 membership（再次验证）
   ↓
9. ✅ 允许访问 /workspaces
```

### 场景 2: 老用户无 Membership（需要邀请码）❌

```
1. 用户登录（Google OAuth）
   ↓
2. /auth/callback → exchangeCodeForSession
   ↓
3. 重定向到 /auth/post-login
   ↓
4. Post-login 检查 membership
   SELECT * FROM merchant_members WHERE user_id = ? AND is_active = true
   ↓
5. 结果：❌ 无记录
   ↓
6. router.replace('/invite?reason=no_membership')
   ↓
7. 显示友好的提示：
   "Welcome back! Your account is active, but you need to join a merchant..."
   ↓
8. 用户输入邀请码
   ↓
9. 调用 /api/invites/redeem
   ↓
10. 成功后创建 merchant_members 记录
    ↓
11. window.location.href = '/'
    ↓
12. Middleware 检查 membership → ✅ 有记录
    ↓
13. 允许访问 /workspaces
```

### 场景 3: 新用户首次访问

```
1. 未登录，访问 internal-web
   ↓
2. Middleware 检查 → 无 session
   ↓
3. 重定向到 /login
   ↓
4. 用户点击 Google 登录
   ↓
5. [与场景 2 相同的流程]
```

---

## 🎯 判定逻辑总结

### 核心判定条件

```typescript
// 查询 merchant_members
const { data: memberships } = await supabase
  .from('merchant_members')
  .select('id, merchant_id, role')
  .eq('user_id', user.id)
  .eq('is_active', true)
  .limit(1);

// 判定
if (memberships && memberships.length > 0) {
  // ✅ 有 membership → 进入工作台
  router.replace('/workspaces');
} else {
  // ❌ 无 membership → 需要邀请码
  router.replace('/invite?reason=no_membership');
}
```

### 双重检查机制

**Post-Login（第一关）**:
- 登录后立即检查
- 决定初始跳转目标

**Middleware（第二关）**:
- 每次请求都检查
- 防止绕过 invite gate

---

## 📝 修改文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `apps/internal-web/app/auth/post-login/page.tsx` | 重构 | 增加 membership 检查逻辑 |
| `apps/internal-web/app/invite/page.tsx` | 增强 | 支持 reason 参数，差异化提示 |
| `apps/internal-web/middleware.ts` | 增强 | 增加详细日志，便于诊断 |
| `INVITE_GATE_FIX.md` | 新增 | 完整的修复文档 |

---

## 🧪 测试清单

### 测试 1: 老用户有 Membership ✅

**前置条件**:
- 用户在 `merchant_members` 表中有记录
- `is_active = true`

**步骤**:
1. 登出后重新登录
2. 观察是否直接进入 `/workspaces`
3. 检查浏览器 Console 日志

**预期**:
```
[PostLogin] User authenticated: <user_id>
[PostLogin] Membership check result: { hasMembership: true, count: 1 }
[PostLogin] Has membership, redirecting to: /workspaces
[MIDDLEWARE] Membership check: { hasMembership: true, membershipCount: 1, ... }
[MIDDLEWARE] ✅ Membership found, allowing access
```

### 测试 2: 老用户无 Membership ❌

**前置条件**:
- 用户在 `profiles` 表中有记录（老用户）
- 但在 `merchant_members` 表中无记录

**步骤**:
1. 登出后重新登录
2. 观察是否进入 `/invite?reason=no_membership`
3. 检查页面提示

**预期**:
```
[PostLogin] User authenticated: <user_id>
[PostLogin] Membership check result: { hasMembership: false, count: 0 }
[PostLogin] No membership, redirecting to /invite
```

**页面显示**:
- 标题: "Invite Code Required"
- 提示: "You are not currently a member of any merchant..."
- 蓝色信息框: "Welcome back! Your account is active..."

### 测试 3: 邀请码兑换后

**步骤**:
1. 在 `/invite` 页面输入有效邀请码
2. 提交后观察是否进入 `/workspaces`

**预期**:
- 调用 `/api/invites/redeem` 成功
- `merchant_members` 表创建记录
- 自动跳转到首页
- Middleware 允许访问

---

## 🔑 关键 SQL 查询

### 查询用户的 Membership

```sql
-- Post-Login 和 Middleware 都使用这个查询
SELECT id, merchant_id, role, is_active
FROM public.merchant_members
WHERE user_id = $1
  AND is_active = true
LIMIT 1;
```

### 手动检查用户 Membership（调试用）

```sql
-- 检查特定用户的所有 membership（包括 inactive）
SELECT 
  mm.id,
  mm.merchant_id,
  m.name AS merchant_name,
  mm.role,
  mm.is_active,
  mm.created_at,
  mm.updated_at
FROM public.merchant_members mm
INNER JOIN public.merchants m ON m.id = mm.merchant_id
WHERE mm.user_id = '<user_id>';

-- 检查用户的 profile（确认是老用户）
SELECT id, display_name, email, created_at
FROM public.profiles
WHERE id = '<user_id>';
```

### 手动为老用户添加 Membership（临时解决）

```sql
-- 如果老用户确实应该有 membership，可以手动添加
INSERT INTO public.merchant_members (
  merchant_id,
  user_id,
  role,
  is_active
) VALUES (
  '<merchant_id>',
  '<user_id>',
  'staff',  -- 或 'manager', 'owner'
  true
)
ON CONFLICT DO NOTHING;
```

---

## 🎉 优势总结

| 方面 | 修复前 | 修复后 |
|------|--------|--------|
| **用户体验** | ❌ 老用户困惑为什么要邀请码 | ✅ 差异化提示，清楚说明原因 |
| **逻辑一致性** | ❌ Post-login 不检查 membership | ✅ 双重检查（post-login + middleware） |
| **调试能力** | ❌ 难以诊断为什么要邀请码 | ✅ 完整的日志和 reason 参数 |
| **流程清晰度** | ❌ 跳转逻辑分散 | ✅ 集中的判定逻辑 |
| **提示信息** | ❌ 通用提示 | ✅ 针对老用户的友好提示 |

---

## 🚀 部署后验证

1. **查看日志**:
   - Vercel 部署日志中搜索 `[PostLogin]` 和 `[MIDDLEWARE]`
   - 确认 membership 检查逻辑执行

2. **测试老用户场景**:
   - 找一个有 profile 但无 membership 的用户
   - 登录并观察流程
   - 验证提示信息是否正确

3. **测试邀请码兑换**:
   - 在 `/invite` 页面输入有效邀请码
   - 验证是否成功加入 merchant
   - 验证是否能访问 `/workspaces`

---

**修复完成日期**: 2026-01-21  
**修复作者**: AI Assistant  
**版本**: v1.0  
**状态**: ✅ 已完成并推送
