# Internal 商家端邀请码系统修复完成报告

## 修复内容

### 1. 数据库修复

#### Migration 文件
- `011_fix_invite_system.sql`: 统一角色为小写，修复约束和外键
- `012_invite_rpc_functions.sql`: 创建 RPC 函数（redeem_preview, redeem_invite_code, create_invite_code）
- `013_fix_invite_rls_policies.sql`: 修复 RLS policies 使用小写角色
- `014_fix_helper_functions.sql`: 修复 helper 函数使用小写角色
- `015_seed_example.sql`: 提供正确的种子数据示例（无硬编码 UUID）

#### 关键修复
1. **角色统一为小写**: `staff`, `manager`, `owner`, `admin`
2. **invites 表修复**:
   - `expires_at` 可为 NULL（永久有效）
   - `disabled` 字段添加
   - `venue_id` 字段添加（可选）
   - `created_by` 外键改为 `ON DELETE SET NULL`
   - token 自动统一为大写（通过触发器）
3. **移除硬编码 UUID**: 删除所有 `00000000-0000-0000-0000-000000000001` 示例数据

### 2. RPC 函数

#### `redeem_preview(p_token TEXT)`
- 预览邀请码（不写库）
- 返回邀请码状态（VALID/EXPIRED/DISABLED/USED_UP/INVALID）
- 返回商户、场地、角色信息
- 匿名用户也可以调用（用于登录前预览）

#### `redeem_invite_code(p_token TEXT)`
- 兑换邀请码（写库）
- 必须已登录
- 校验邀请码状态
- 校验商户和场地存在
- 角色升级逻辑（只能提升，不能降级）
- Upsert merchant_members
- 更新邀请码使用计数
- 返回 memberships 列表

#### `create_invite_code(p_merchant_id, p_venue_id, p_role, p_max_uses, p_expires_days)`
- 创建邀请码（owner/manager/admin 使用）
- 权限检查
- 自动生成唯一 token
- 校验场地归属
- 支持永久有效（expires_days = NULL）

### 3. RLS Policies

#### merchant_members
- 用户可读自己的记录
- owner/manager/admin 可读同商户的所有成员
- 只有 owner/manager/admin 可更新成员的 is_active
- 禁止普通用户直接 INSERT（只能通过 RPC）

#### invites
- owner/manager/admin 可读同商户的邀请码
- 匿名用户也可以预览（用于登录前查看）
- 禁止普通用户直接 INSERT/UPDATE/DELETE（只能通过 RPC）

#### venues/merchants
- 用户可读自己商户下的数据

### 4. 前端修复

#### 新增页面
- `/app/join/page.tsx`: 加入确认页面，显示邀请码预览信息

#### 修复页面
- `/app/page.tsx`: 统一角色判断为小写
- `/app/invite/page.tsx`: 改为调用 preview，跳转到 join 页面
- `/app/workspaces/page.tsx`: 统一角色判断为小写

#### 新增 API Routes
- `/app/api/invites/preview/route.ts`: 预览邀请码 API

#### 修复 API Routes
- `/app/api/invites/redeem/route.ts`: 修复错误映射和响应格式
- `/app/api/invites/create/route.ts`: 修复角色验证和错误处理

## 登录状态机

### 流程
1. **未登录** -> `/login`
2. **已登录但无 merchant_members** -> `/invite`（强制门禁）
3. **输入邀请码** -> `/join`（预览） -> Confirm -> 兑换邀请码
4. **有 membership 但多个商户** -> `/workspaces`（选择工作区）
5. **有 membership 且单个商户**:
   - `role = 'staff'` -> `/scan`
   - `role = 'manager'/'owner'/'admin'` -> `/dashboard`

### 邀请码流程
1. **输入邀请码** (`/invite`):
   - 调用 `redeem_preview` 预览
   - 验证成功后跳转到 `/join?token=...`

2. **确认加入** (`/join`):
   - 显示预览信息（商户、场地、角色）
   - 用户确认后调用 `redeem_invite_code` 兑换
   - 成功后根据 memberships 数量和角色跳转

3. **创建邀请码** (owner/manager 在内部端):
   - 调用 `create_invite_code` RPC
   - 返回生成的 token

## 错误映射

### 邀请码错误状态
- `INVALID`: 邀请码不存在
- `EXPIRED`: 邀请码已过期
- `DISABLED`: 邀请码已禁用
- `USED_UP`: 邀请码使用次数已用完
- `MERCHANT_NOT_FOUND`: 商户不存在
- `VENUE_MISMATCH`: 场地不属于该商户
- `NOT_ALLOWED`: 无权限操作
- `UNAUTHORIZED`: 未登录

## 使用方法

### 1. 执行 Migration

在 Supabase Dashboard SQL Editor 中按顺序执行：
1. `011_fix_invite_system.sql`
2. `012_invite_rpc_functions.sql`
3. `013_fix_invite_rls_policies.sql`
4. `014_fix_helper_functions.sql`

### 2. 创建商户和邀请码

参考 `015_seed_example.sql`:

```sql
-- 1. 创建商户（返回 ID）
INSERT INTO public.merchants (name, status)
VALUES ('测试商户', 'active')
RETURNING id;

-- 2. 手动创建 owner（替换 YOUR_USER_ID 和 YOUR_MERCHANT_ID）
INSERT INTO public.merchant_members (merchant_id, user_id, role, is_active)
VALUES ('YOUR_MERCHANT_ID', 'YOUR_USER_ID', 'owner', true);

-- 3. 创建邀请码（通过 RPC，需要已登录的 owner/manager）
SELECT public.create_invite_code(
  'YOUR_MERCHANT_ID',  -- merchant_id
  NULL,                 -- venue_id (NULL = 所有场地)
  'staff',              -- role (小写)
  10,                   -- max_uses
  30                    -- expires_days (NULL = 永不过期)
);
```

### 3. 验证流程

1. **未登录用户**:
   - 访问任何页面 -> 重定向到 `/login`
   - Google 登录 -> 回到 `/invite`

2. **已登录但无 membership**:
   - 访问任何页面 -> 重定向到 `/invite`
   - 输入邀请码 -> 预览 -> 确认 -> 加入成功

3. **已加入商户**:
   - 访问 `/` -> 根据角色跳转到 `/scan` 或 `/dashboard`
   - 多个商户 -> 跳转到 `/workspaces`

## 改动文件清单

### Migration 文件（新增）
- `supabase/migrations/011_fix_invite_system.sql`
- `supabase/migrations/012_invite_rpc_functions.sql`
- `supabase/migrations/013_fix_invite_rls_policies.sql`
- `supabase/migrations/014_fix_helper_functions.sql`
- `supabase/migrations/015_seed_example.sql`

### 前端文件（新增）
- `apps/internal-web/app/join/page.tsx`
- `apps/internal-web/app/api/invites/preview/route.ts`

### 前端文件（修复）
- `apps/internal-web/app/page.tsx`
- `apps/internal-web/app/invite/page.tsx`
- `apps/internal-web/app/workspaces/page.tsx`
- `apps/internal-web/app/api/invites/redeem/route.ts`
- `apps/internal-web/app/api/invites/create/route.ts`

## 本地验证 Checklist

### 1. 数据库迁移
- [ ] 执行所有 migration 文件
- [ ] 验证角色约束为小写
- [ ] 验证 invites 表结构正确
- [ ] 验证 RPC 函数创建成功
- [ ] 验证 RLS policies 生效

### 2. 创建测试数据
- [ ] 创建测试商户
- [ ] 手动创建 owner 用户
- [ ] 通过 RPC 创建邀请码（owner 登录后）

### 3. 登录流程
- [ ] 未登录访问 -> 重定向到 `/login`
- [ ] Google 登录成功 -> 重定向到 `/invite`（如果无 membership）
- [ ] 输入邀请码 -> 预览成功
- [ ] 确认加入 -> 兑换成功 -> 跳转正确

### 4. 角色跳转
- [ ] staff 角色 -> 跳转到 `/scan`
- [ ] manager/owner 角色 -> 跳转到 `/dashboard`
- [ ] 多个商户 -> 跳转到 `/workspaces`

### 5. 创建邀请码（owner/manager）
- [ ] 登录 owner/manager 账号
- [ ] 调用创建邀请码 API
- [ ] 验证返回的 token 正确
- [ ] 使用新创建的邀请码加入成功

### 6. 错误处理
- [ ] 无效邀请码 -> 显示错误
- [ ] 过期邀请码 -> 显示过期提示
- [ ] 已用完邀请码 -> 显示使用完提示
- [ ] 禁用邀请码 -> 显示禁用提示

## 注意事项

1. **角色大小写**: 所有角色必须使用小写（`staff`, `manager`, `owner`, `admin`）
2. **Token 大小写**: Token 自动统一为大写（通过触发器）
3. **外键约束**: 创建邀请码时必须确保 merchant_id 和 venue_id 存在
4. **权限检查**: 只有 owner/manager/admin 可以创建邀请码
5. **角色升级**: 兑换邀请码时，如果用户已有更高角色，不会降级

## 假设和默认值

1. **角色枚举**: `staff`, `manager`, `owner`, `admin`（小写）
2. **Token 格式**: `{role}-{YYYYMMDD}-{4位随机字符}`（自动生成）
3. **默认有效期**: 30 天（可通过 `expires_days` 参数修改，NULL 表示永不过期）
4. **默认最大使用次数**: 10 次（可通过 `max_uses` 参数修改）
5. **邀请码状态**: 创建后默认激活（`is_active = true`, `disabled = false`）
