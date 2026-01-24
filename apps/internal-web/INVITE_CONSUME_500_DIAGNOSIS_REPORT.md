# `/api/invite/consume` 500 错误诊断报告

## A) 关键信息输出

### 1) 日志增强完成

已在 `apps/internal-web/app/api/invite/consume/route.ts` 中添加完整的结构化日志，覆盖所有关键步骤：

**日志步骤清单：**
- `env.check` - 环境变量检查（hasSupabaseUrl, hasAnonKey, hasServiceRoleKey）
- `auth.getUser` - 用户认证检查
- `invite.readBody` - 请求体解析（code 长度、预览）
- `client.adminClientReady` - Service Role Client 初始化
- `invite.lookup` - 邀请码查询（查询条件、是否命中、所有字段）
- `parse_role` - 角色解析（intended_role, issued_by_type, roleToAssign）
- `membership.checkExisting` - 检查已存在的 membership（count、查询条件）
- `membership.insert` - 插入 merchant_members（payload、结果、错误码）
- `invite.updateUsed` - 更新 invites 使用计数（payload、结果）
- `response.ok` - 成功响应（next 路径、role）
- `catch.unhandled` - 未捕获异常（error.name/message/stack）

**所有错误现在都返回 JSON：**
```json
{
  "success": false,
  "error": "...",
  "debugId": "...",
  "step": "...",
  "details": { ... }
}
```

### 2) 环境自检字段

每个请求都会打印：
- `env.hasSupabaseUrl` (boolean)
- `env.hasAnonKey` (boolean)
- `env.hasServiceRoleKey` (boolean)
- `client.adminClientReady` (boolean)

---

## B) 自检问题清单

**请根据 Vercel logs 中的实际日志回答以下问题：**

### 1. `invites` 表里是否存在该 code 对应记录？

**检查方法：** 查看日志 `step: 'invite.lookup'` 中的 `found` 字段
- **是** - `found: true`，且 `inviteId` 有值
- **否** - `found: false`，且 `inviteId: null`

**证据位置：** `apps/internal-web/app/api/invite/consume/route.ts:224-247`

---

### 2. invite 记录的字段名是否与 consume 代码读取的一致？

**检查方法：** 对比数据库 schema 和代码中的 select 字段

**代码读取的字段：**
```typescript
.select('id, token, merchant_id, venue_id, intended_role, issued_by_type, max_uses, used_count, expires_at, disabled, is_active, revoked_at')
```

**数据库字段（根据代码注释）：**
- `token` (text) - ✅ 代码使用 `.eq('token', trimmedCode)`
- `merchant_id` (uuid) - ✅
- `intended_role` (text) - ✅
- `issued_by_type` (text) - ✅
- `is_active` (bool) - ✅
- `disabled` (bool) - ✅
- `expires_at` (timestamptz) - ✅
- `used_count` (int) - ✅
- `max_uses` (int) - ✅
- `revoked_at` (timestamptz) - ✅

**证据位置：** `apps/internal-web/app/api/invite/consume/route.ts:217-221`

---

### 3. invite.merchant_id 是否为 null？

**检查方法：** 查看日志 `step: 'invite.lookup'` 中的 `merchantId` 字段
- **是** - `merchantId: null`
- **否** - `merchantId: "uuid-string"`

**证据位置：** `apps/internal-web/app/api/invite/consume/route.ts:232`

---

### 4. invite 是否过期/禁用/已用完？

**检查方法：** 查看日志 `step: 'invite.lookup'` 中的字段：
- `isActive: false` → 非激活
- `disabled: true` → 已禁用
- `expiresAt` < 当前时间 → 已过期
- `usedCount >= maxUses` → 已用尽

**证据位置：** `apps/internal-web/app/api/invite/consume/route.ts:279-348`

---

### 5. service role key 在 Vercel internal-web 环境是否存在且可用？

**检查方法：** 查看日志：
- `step: 'env.check'` → `hasServiceRoleKey: true/false`
- `step: 'client.adminClientReady'` → `ok: true/false`, `clientAdminClientReady: true/false`

**证据位置：** 
- `apps/internal-web/app/api/invite/consume/route.ts:49-59` (env.check)
- `apps/internal-web/app/api/invite/consume/route.ts:173-214` (client.adminClientReady)

---

### 6. merchant_members 是否已存在（幂等情况）？

**检查方法：** 查看日志 `step: 'membership.checkExisting'`：
- `found: true` → 已存在，应该返回成功（幂等）
- `found: false` → 不存在，继续插入

**证据位置：** `apps/internal-web/app/api/invite/consume/route.ts:411-485`

---

### 7. 插入 merchant_members 是否触发唯一约束冲突？

**检查方法：** 查看日志 `step: 'membership.insert'` 中的 `memberError.code`：
- `errorCode: '23505'` → 唯一约束冲突（PostgreSQL）
- 其他错误码 → 其他数据库错误

**证据位置：** `apps/internal-web/app/api/invite/consume/route.ts:529-583`

---

### 8. 更新 invites.used_count 是否失败？失败原因是什么？

**检查方法：** 查看日志 `step: 'invite.updateUsed'` 中的 `ok` 和 `updateError`：
- `ok: false` + `updateError.code/message` → 更新失败

**证据位置：** `apps/internal-web/app/api/invite/consume/route.ts:618-650`

**注意：** 即使更新失败，也不会返回错误（因为 membership 已创建成功）

---

### 9. 是否存在 staff/owner 角色解析为空或不在允许集合里（roleToAssign）？

**检查方法：** 查看日志 `step: 'parse_role'` 中的 `ok` 和 `roleToAssign`：
- `ok: false` → 角色解析失败
- `roleToAssign: null` 或不在 `['staff', 'manager', 'owner', 'admin']` → 无效角色

**证据位置：** `apps/internal-web/app/api/invite/consume/route.ts:350-406`

---

## C) 文件定位

### 1. `/api/invite/consume` Route Handler

**文件路径：** `apps/internal-web/app/api/invite/consume/route.ts`

**关键代码片段：**

```typescript
// 环境检查
const envCheck = {
  hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
};

// Service Role Client 创建
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

// 查询邀请码
const { data: invite, error: inviteError } = await serviceSupabase
  .from('invites')
  .select('id, token, merchant_id, venue_id, intended_role, issued_by_type, max_uses, used_count, expires_at, disabled, is_active, revoked_at')
  .eq('token', trimmedCode)
  .maybeSingle();

// 检查已存在的 membership
const { data: existingMembership, error: membershipCheckError } = await serviceSupabase
  .from('merchant_members')
  .select('id, role, is_active')
  .eq('user_id', user.id)
  .eq('merchant_id', invite.merchant_id)
  .eq('is_active', true)
  .maybeSingle();

// 插入 merchant_members
const { data: newMembership, error: memberError } = await serviceSupabase
  .from('merchant_members')
  .insert({
    merchant_id: invite.merchant_id,
    user_id: user.id,
    role: roleToAssign,
    is_active: true,
  })
  .select('id, merchant_id, role')
  .single();
```

---

### 2. Supabase Server Client

**文件路径：** `apps/internal-web/lib/supabase/server.ts`

**完整内容：**
```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}
```

**说明：** 这个文件只创建普通的 server client（使用 anon key），不创建 service role client。

---

### 3. Service Role Client 创建位置

**文件路径：** `apps/internal-web/app/api/invite/consume/route.ts` (行 176-186)

**代码片段：**
```typescript
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
```

**说明：** Service Role Client 直接在 route handler 中创建，使用 `@supabase/supabase-js` 的 `createClient`（不是 `@supabase/ssr`）。

---

## D) 复现日志分析

### 结论候选 Top3（基于代码分析）

#### 根因候选 #1: `membership.checkExisting` 查询失败（最可能）

**证据：**
- UI 显示 "Failed to check existing membership"
- 错误发生在 `membership.checkExisting` 步骤
- 代码位置：`apps/internal-web/app/api/invite/consume/route.ts:447-463`

**可能原因：**
1. Service Role Client 权限不足（虽然理论上应该绕过 RLS）
2. `merchant_members` 表的 RLS 策略阻止了 service role 查询
3. 数据库连接问题
4. `merchant_id` 为 null 导致查询失败

**检查方法：** 查看日志 `step: 'membership.checkExisting'` 中的 `membershipCheckError.code` 和 `membershipCheckError.message`

---

#### 根因候选 #2: Service Role Key 未正确配置或无效

**证据：**
- 如果 `env.hasServiceRoleKey: false` → 环境变量未配置
- 如果 `client.adminClientReady: false` → Client 初始化失败

**检查方法：** 查看日志：
- `step: 'env.check'` → `hasServiceRoleKey`
- `step: 'client.adminClientReady'` → `ok`, `clientAdminClientReady`

**证据位置：** `apps/internal-web/app/api/invite/consume/route.ts:49-214`

---

#### 根因候选 #3: `invite.merchant_id` 为 null 导致后续查询失败

**证据：**
- 如果 `invite.lookup` 中 `merchantId: null`
- 后续 `membership.checkExisting` 使用 `invite.merchant_id` 查询会失败

**检查方法：** 查看日志 `step: 'invite.lookup'` 中的 `merchantId`

**证据位置：** `apps/internal-web/app/api/invite/consume/route.ts:232`

---

### 完整链路日志（按 debugId 聚合）

**请从 Vercel logs 中复制同一个 `debugId` 的所有日志，按时间顺序排列：**

```
[INVITE CONSUME] { debugId: 'xxxx', step: 'env.check', ... }
[INVITE CONSUME] { debugId: 'xxxx', step: 'auth.getUser', ... }
[INVITE CONSUME] { debugId: 'xxxx', step: 'invite.readBody', ... }
[INVITE CONSUME] { debugId: 'xxxx', step: 'client.adminClientReady', ... }
[INVITE CONSUME] { debugId: 'xxxx', step: 'invite.lookup', ... }
[INVITE CONSUME] { debugId: 'xxxx', step: 'parse_role', ... }
[INVITE CONSUME] { debugId: 'xxxx', step: 'membership.checkExisting', ... }
[INVITE CONSUME] { debugId: 'xxxx', step: 'membership.insert', ... } (如果到达)
[INVITE CONSUME] { debugId: 'xxxx', step: 'invite.updateUsed', ... } (如果到达)
[INVITE CONSUME] { debugId: 'xxxx', step: 'response.ok', ... } (如果成功)
[INVITE CONSUME] { debugId: 'xxxx', step: 'catch.unhandled', ... } (如果失败)
```

**请粘贴实际日志到这里：**
```
[等待用户提供 Vercel logs]
```

---

### 下一步最小修复建议

**基于当前代码分析，建议按以下顺序排查：**

1. **确认 Service Role Key 配置**
   - 检查 Vercel 环境变量 `SUPABASE_SERVICE_ROLE_KEY` 是否存在
   - 确认 key 值正确（不是 anon key）
   - 查看日志 `env.check` 和 `client.adminClientReady`

2. **检查 `membership.checkExisting` 错误详情**
   - 查看日志中的 `membershipCheckError.code` 和 `membershipCheckError.message`
   - 如果是 RLS 问题，可能需要调整 RLS 策略或确认 service role 确实绕过 RLS

3. **验证 `invite.merchant_id` 不为 null**
   - 查看日志 `invite.lookup` 中的 `merchantId`
   - 如果为 null，说明数据库数据有问题

4. **检查数据库连接和权限**
   - 确认 Supabase 项目配置正确
   - 确认 service role key 有足够权限

**修复优先级：**
1. 最高优先级：修复 `membership.checkExisting` 错误（因为 UI 明确显示这个错误）
2. 中等优先级：验证环境变量配置
3. 低优先级：优化错误处理和日志

---

## 修改文件列表

- ✅ `apps/internal-web/app/api/invite/consume/route.ts` - 增强日志和错误处理

---

## 新增日志字段清单

### 每个步骤的日志字段：

1. **env.check**
   - `hasSupabaseUrl`, `hasAnonKey`, `hasServiceRoleKey`

2. **auth.getUser**
   - `ok`, `hasUser`, `userId`, `userEmail`, `authError`

3. **invite.readBody**
   - `ok`, `codeLength`, `codePreview`, `isEmpty`

4. **client.adminClientReady**
   - `ok`, `clientAdminClientReady`, `error` (如果失败)

5. **invite.lookup**
   - `ok`, `queryField`, `queryValue`, `found`, `inviteId`, `merchantId`, `intendedRole`, `issuedByType`, `isActive`, `disabled`, `expiresAt`, `usedCount`, `maxUses`, `revokedAt`, `inviteError`

6. **parse_role**
   - `ok`, `intendedRole`, `issuedByType`, `roleToAssign`

7. **membership.checkExisting**
   - `ok`, `count`, `queryConditions`, `found`, `existingMembershipId`, `existingRole`, `membershipCheckError`

8. **membership.insert**
   - `ok`, `payload`, `newMembershipId`, `memberError` (包含 code)

9. **invite.updateUsed**
   - `ok`, `inviteId`, `payload`, `updateError`

10. **response.ok**
    - `ok`, `next`, `role`, `merchantId`

11. **catch.unhandled**
    - `ok`, `error.name`, `error.message`, `error.stack` (截断到 500 字符)

---

**报告生成时间：** 2025-01-XX
**代码版本：** 最新（已增强日志）
