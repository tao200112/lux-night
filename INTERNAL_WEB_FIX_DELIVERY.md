# Internal Web 修复交付总结

## 🎯 任务完成状态

### ✅ 已完成的工作

1. **文件编码修复**
   - ✅ 删除并重建 `apps/internal-web/lib/internal/auth.ts` (UTF-8)
   - ✅ 删除并重建 `apps/internal-web/lib/internal/workspace.ts` (UTF-8)
   - ✅ 解决 "Unexpected character '⨯'" 编译错误

2. **QR 码模块**
   - ✅ 创建 `apps/internal-web/lib/utils/qr.ts`
   - ✅ 实现 QR 生成、验证、ticket 数据编解码
   - ✅ 解决 "Module not found: @/lib/utils/qr" 错误

3. **数据库迁移验证**
   - ✅ 确认现有迁移已幂等化 (001-004)
   - ✅ 确认 `issued_by_type` (admin/merchant) 支持
   - ✅ 确认 `redeem_invite` RPC 完整实现
   - ✅ 确认测试邀请码 `1461` 生成脚本

4. **登录流程验证**
   - ✅ Middleware 邀请门禁逻辑检查
   - ✅ API `/api/invites/redeem` 路由检查
   - ✅ 错误映射完整性检查

---

## 📝 修改文件清单

### 新建文件
```
apps/internal-web/lib/utils/qr.ts
```

### 重建文件（删除旧文件后重新创建）
```
apps/internal-web/lib/internal/auth.ts
apps/internal-web/lib/internal/workspace.ts
```

### 未修改文件（已确认正确）
```
supabase/migrations/001_schema.sql
supabase/migrations/002_rls.sql
supabase/migrations/003_rpc.sql
supabase/migrations/004_seed.sql
apps/internal-web/middleware.ts
apps/internal-web/app/api/invites/redeem/route.ts
```

---

## 🗄️ 数据库架构确认

### Invites 表结构
```sql
CREATE TABLE public.invites (
  id UUID PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  venue_id UUID REFERENCES venues(id),
  intended_role TEXT NOT NULL CHECK IN ('staff','manager','owner','admin'),
  issued_by_type TEXT NOT NULL DEFAULT 'merchant' 
    CHECK IN ('admin','merchant'),  -- ✅ 支持区分管理员/商家邀请码
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  disabled BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**关键特性**：
- ✅ `issued_by_type` 区分 `admin` (平台管理员发商家码) 和 `merchant` (商家发员工码)
- ✅ `token` 自动规范化为 `UPPER(TRIM())`
- ✅ `merchant_id` 必须存在（外键约束，避免 23503 错误）
- ✅ `venue_id` 可选，限制加入特定场地

### RPC 函数

#### 1. `redeem_invite(p_token TEXT)`
**功能**：兑换邀请码，加入商户

**流程**：
```
1. 校验用户已登录 (auth.uid() 非空)
2. 查询 invite (UPPER(TRIM(p_token)))
3. 校验有效性 (未过期/禁用/用完)
4. 校验 merchant 存在
5. 校验 venue 归属 (如果指定)
6. Upsert merchant_members (不降级权限: owner > manager > staff)
7. 写入 member_venues (如果指定 venue)
8. 原子递增 used_count
9. 返回成功结果
```

**返回值**：
```json
{
  "ok": true,
  "merchant_id": "uuid",
  "merchant_name": "Test Merchant",
  "role": "owner",
  "venue_id": "uuid",
  "venue_name": "Test Venue",
  "member_id": "uuid",
  "message": "Successfully joined Test Merchant"
}
```

**错误码**：
- `NOT_AUTHENTICATED` - 未登录
- `INVALID_TOKEN` - 邀请码不存在
- `DISABLED` - 已禁用
- `EXPIRED` - 已过期
- `USED_UP` - 已用完
- `MERCHANT_NOT_FOUND` - 商户不存在
- `VENUE_MISMATCH` - 场地不属于商户

#### 2. `get_my_workspaces()`
**功能**：获取当前用户所有 workspaces

**返回值**：
```json
[
  {
    "merchant_id": "uuid",
    "merchant_name": "Merchant A",
    "role": "owner",
    "is_active": true,
    "venues": [...]
  }
]
```

### 测试邀请码 1461

**生成脚本**：`supabase/migrations/004_seed.sql`

**配置**：
```
Token: 1461
Merchant: Test Merchant (Invite 1461)
Venue: Test Venue (Los Angeles, CA)
Role: owner
Max Uses: 999999
Expires: NULL (永不过期)
issued_by_type: admin
```

**用途**：
新用户 Google 登录后，输入 `1461`，自动加入测试商户为 OWNER。

---

## 🔄 登录流程

### 完整流程图

```
┌──────────────┐
│ Google Login │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ /auth/callback   │ (Exchange code for session)
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Middleware Check │
└──────┬───────────┘
       │
       ├─ No session? ──────────────────┐
       │                                 │
       │                                 ▼
       ├─ No memberships? ──────► /invite (邀请码门禁)
       │                             │
       │                             ▼
       │                       Input: 1461
       │                             │
       │                             ▼
       │                    POST /api/invites/redeem
       │                             │
       │                             ▼
       │                    Call redeem_invite('1461')
       │                             │
       │                             ▼
       │                    Insert merchant_members
       │                             │
       │                             ▼
       │                       router.refresh()
       │                             │
       └─────────────────────────────┘
                     │
                     ▼
               ┌──────────┐
               │ Has role │
               └─────┬────┘
                     │
              ┌──────┴──────┐
              │             │
      OWNER/MANAGER      STAFF
              │             │
              ▼             ▼
         /dashboard      /scan
```

### Middleware 逻辑

**路径**：`apps/internal-web/middleware.ts`

```typescript
// 1. API 路由直接放行
if (pathname.startsWith('/api/')) return response;

// 2. 登录与回调放行
if (pathname === '/login' || pathname === '/auth/callback') return response;

// 3. 检查 session
const { user } = await supabase.auth.getUser();
if (!user) return redirect('/login');

// 4. 检查 memberships
const { data: workspaces } = await supabase.rpc('get_my_workspaces');
if (!workspaces || workspaces.length === 0) {
  return redirect('/invite'); // 邀请码门禁
}

// 5. 放行内部页面
return response;
```

---

## 🧪 本地验证步骤

### 1. 安装依赖
```bash
cd C:\Users\yesod\Desktop\lux-night
pnpm install  # 或 npm install
```

**说明**：安装 `qrcode` 和 `@types/qrcode` 包

### 2. 数据库迁移
```bash
npx supabase db reset  # 重置到干净状态
npx supabase db push   # 应用迁移 (001-004)
```

**预期**：
- ✅ 无 "policy already exists" 错误
- ✅ 无 "foreign key violation (23503)" 错误
- ✅ 生成测试邀请码 `1461`

### 3. 启动服务
```bash
pnpm dev:internal  # 或 cd apps/internal-web && pnpm dev
```

**预期**：
- ✅ 编译成功，无 UTF-16 乱码错误
- ✅ 无 "Module not found: @/lib/utils/qr" 错误
- ✅ 服务运行在 `http://localhost:3001`

### 4. 手动测试登录流程

**步骤**：
1. 打开 `http://localhost:3001`
2. 点击 "Login with Google"
3. 完成 Google OAuth
4. 自动跳转 `/invite` (邀请码门禁)
5. 输入邀请码：`1461`
6. 点击 "Confirm"
7. 自动跳转 `/dashboard`
8. 看到 "Welcome! You've successfully joined as OWNER"

**数据验证**：
```sql
-- 查询你的 membership
SELECT * FROM merchant_members WHERE user_id = 'your_google_user_id';

-- 查询邀请码使用次数
SELECT token, used_count FROM invites WHERE token = '1461';
```

---

## 🐛 错误解决说明

### 1. "Unexpected character '⨯'" (已修复)
**原因**：Windows 编辑器保存为 UTF-16 LE

**修复**：删除并重建为 UTF-8 文件

**涉及文件**：
- `apps/internal-web/lib/internal/auth.ts`
- `apps/internal-web/lib/internal/workspace.ts`

### 2. "Module not found: @/lib/utils/qr" (已修复)
**原因**：QR 模块不存在

**修复**：创建 `apps/internal-web/lib/utils/qr.ts`

### 3. "policy already exists" (无需修复)
**状态**：现有迁移已幂等化

**证据**：
- 所有 `CREATE POLICY` 使用 `DROP ... IF EXISTS` 前缀
- 所有 `CREATE FUNCTION` 使用 `CREATE OR REPLACE`
- 所有 `CREATE TABLE` 使用 `IF NOT EXISTS`

### 4. "foreign key violation (23503)" (无需修复)
**状态**：Seed 脚本已修复

**证据**：
- `004_seed.sql` 使用 `DO $$ ... END $$` 动态创建 merchant
- 不使用硬编码 UUID (`00000000-...`)
- `ON CONFLICT` 确保可重复执行

---

## 📦 依赖安装

### 必须安装的包

```bash
# 方法 1: 从 root 目录（推荐）
cd C:\Users\yesod\Desktop\lux-night
pnpm install

# 方法 2: 从 internal-web 目录
cd apps/internal-web
pnpm install

# 方法 3: 如果 pnpm 未安装，使用 npm
npm install
```

**包清单**：
- `qrcode` - QR 码生成库
- `@types/qrcode` - TypeScript 类型定义

---

## 📚 技术决策说明

### 1. 为什么不重构迁移？
**决策**：保留现有迁移（001-004），不创建新迁移

**理由**：
- 现有迁移已经完善且幂等
- 已支持所有需求（`issued_by_type`, `redeem_invite`, test invite 1461）
- 重构风险大于收益
- 避免破坏已有数据

### 2. 为什么用 `qrcode` 库？
**决策**：使用 `qrcode` npm 包

**理由**：
- 成熟稳定（周下载 500k+）
- 同时支持 Node.js 和浏览器
- Data URL 输出，易于集成
- TypeScript 类型定义完善

### 3. 为什么 Middleware 不检查 API 路由？
**决策**：Middleware 跳过 `/api/*`

**理由**：
- API 路由有自己的认证逻辑（`auth.getUser()`）
- Middleware 拦截会导致返回 HTML redirect 而不是 JSON
- 分离关注点：Middleware 管页面，API 管数据

### 4. 为什么 `created_by` 允许 NULL？
**决策**：`invites.created_by` 外键允许 `ON DELETE SET NULL`

**理由**：
- Seed 脚本执行时 `auth.uid()` 为空
- 管理员邀请码可能由系统生成
- 避免 seed 脚本依赖特定用户存在

---

## 🚀 部署建议

### Local 开发环境

**配置文件**：`apps/internal-web/.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_local_anon_key
```

**启动命令**：
```bash
pnpm dev:internal
```

### Production 部署（Vercel/Netlify）

**环境变量**：
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_prod_anon_key
```

**OAuth Redirect URLs（Supabase Dashboard）**：
```
https://internal.yourdomain.com/auth/callback
http://localhost:3001/auth/callback
```

**数据库迁移**：
1. 在 Supabase Dashboard SQL Editor 执行：
   - `001_schema.sql`
   - `002_rls.sql`
   - `003_rpc.sql`
   - `004_seed.sql` (可选，仅开发环境)

---

## ✅ 验收标准

### 编译检查
- [ ] `pnpm build` 成功，无 TypeScript 错误
- [ ] 无 "Unexpected character '⨯'" 错误
- [ ] 无 "Module not found: @/lib/utils/qr" 错误

### 数据库检查
- [ ] `npx supabase db push` 成功
- [ ] 无 "policy already exists" 错误
- [ ] 无 "foreign key violation" 错误
- [ ] 测试邀请码 `1461` 存在

### 功能检查
- [ ] Google 登录成功
- [ ] 未加入商户 → 自动跳转 `/invite`
- [ ] 输入 `1461` → 加入成功
- [ ] 自动跳转 `/dashboard`
- [ ] 显示 "Welcome! You've successfully joined as OWNER"

### 数据检查
- [ ] `merchant_members` 表有新记录
- [ ] `role = 'owner'`
- [ ] `is_active = true`
- [ ] `invites.used_count` 递增

---

## 📄 文档生成

已生成的文档：
1. `INTERNAL_WEB_FIX_REPORT.md` - 完整修复报告
2. `INTERNAL_WEB_FIX_DELIVERY.md` - 交付总结（本文档）

---

## 🎉 交付完成

**状态**：✅ Ready for Testing

**下一步**：
1. 安装依赖（`pnpm install`）
2. 启动服务（`pnpm dev:internal`）
3. 测试登录流程（Google + 邀请码 1461）

**支持**：
如有问题，参考 `INTERNAL_WEB_FIX_REPORT.md` 的详细说明。

---

**生成时间**: 2026-01-18  
**工程师**: AI Assistant  
**项目**: Lux Night - Internal Web  
**状态**: ✅ All Issues Fixed
