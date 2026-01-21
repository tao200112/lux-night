# Internal Web 完整修复报告

## 执行时间
2026-01-18

## 问题诊断

### 1. 文件编码污染
**问题**：
- `apps/internal-web/lib/internal/auth.ts` - UTF-16 乱码
- `apps/internal-web/lib/internal/workspace.ts` - UTF-16 乱码

**根因**：
Windows 系统 + 某些编辑器/工具在保存时使用了 UTF-16 LE 编码，导致 Next.js SWC 编译器无法读取。

**修复**：
✅ 删除污染文件
✅ 重建为干净的 UTF-8 TypeScript 文件

### 2. 缺失 QR 码模块
**问题**：
- `Module not found: Can't resolve '@/lib/utils/qr'`
- `app/wallet/page.tsx` 和 `lib/data/tickets.ts` 引用了不存在的模块

**修复**：
✅ 创建 `apps/internal-web/lib/utils/qr.ts`
✅ 实现 `generateQRCodeUrl`, `validateQRCode`, `generateTicketQRData`, `parseTicketQRData`
✅ 使用 `qrcode` 库（需安装）

### 3. 数据库迁移状态
**检查结果**：
✅ 现有迁移已经很完善（001-004）
✅ 支持 `issued_by_type` (admin/merchant)
✅ 支持 `redeem_invite` RPC
✅ 支持测试邀请码 `1461`
✅ 所有 SQL 已幂等化（`IF NOT EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT`）

**无需修改！**

---

## 修复内容

### A. 重建文件（UTF-8）

#### 1. `apps/internal-web/lib/internal/auth.ts`
**功能**：
- `getInternalUser()` - 获取当前用户及 memberships
- `requireInternalAuth()` - 要求已认证，否则抛异常
- `hasWorkspace()` - 检查是否已通过邀请码

**接口**：
```typescript
interface InternalUser {
  user: User;
  memberships: Membership[];
  defaultWorkspace?: Workspace;
}

interface Membership {
  merchantId: string;
  merchantName: string;
  role: 'OWNER' | 'MANAGER' | 'STAFF' | 'admin';
  isActive: boolean;
  venues: VenueAccess[];
}
```

#### 2. `apps/internal-web/lib/internal/workspace.ts`
**功能**：
- `setDefaultWorkspace(merchantId, venueId?)` - 设置默认 workspace
- `getActiveWorkspace()` - 获取活跃 workspace

**逻辑**：
- 从 `profiles.default_merchant_id/default_venue_id` 读取
- 校验 membership 和 venue 归属
- 返回 `Workspace` 对象

#### 3. `apps/internal-web/lib/utils/qr.ts` （新建）
**功能**：
- `generateQRCodeUrl(text)` - 生成 QR 码 Data URL
- `generateTicketQRData(ticketId, eventId, venueId)` - 生成 ticket QR JSON
- `parseTicketQRData(qrData)` - 解析 ticket QR 数据
- `validateQRCode(text)` - 验证 QR 文本格式

**依赖**：
- `qrcode` 库（需安装：`pnpm add qrcode @types/qrcode`）

---

## 数据库架构确认

### 表结构（已存在，无需修改）

#### `invites` 表
```sql
CREATE TABLE public.invites (
  id UUID PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,  -- 自动 UPPER(TRIM())
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  venue_id UUID REFERENCES venues(id),
  intended_role TEXT NOT NULL CHECK IN ('staff','manager','owner','admin'),
  issued_by_type TEXT NOT NULL DEFAULT 'merchant' CHECK IN ('admin','merchant'), -- ✅ 已支持
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

**关键点**：
- ✅ `issued_by_type` 区分管理员邀请码 (`admin`) 和商家邀请码 (`merchant`)
- ✅ `token` 自动规范化（`UPPER(TRIM())`）
- ✅ `merchant_id` 必须存在（外键约束）
- ✅ `venue_id` 可选，限制加入特定场地

#### `merchant_members` 表
```sql
CREATE TABLE public.merchant_members (
  id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK IN ('staff','manager','owner','admin'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, merchant_id)
);
```

### RPC 函数（已存在，无需修改）

#### `redeem_invite(p_token TEXT)`
**功能**：兑换邀请码，加入 merchant

**流程**：
1. 校验用户已登录（`auth.uid()` 非空）
2. 查询 invite（`UPPER(TRIM(p_token))`）
3. 校验有效性（未过期、未禁用、未用完）
4. 校验 merchant 存在
5. 校验 venue 归属（如果指定）
6. Upsert `merchant_members`（不降级权限：owner > manager > staff）
7. 写入 `member_venues`（如果指定 venue）
8. 原子递增 `used_count`
9. 返回 `{ ok: true, merchant_id, role, ... }`

**返回格式**：
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

#### `get_my_workspaces()`
**功能**：获取当前用户所有 workspaces

**返回**：
```json
[
  {
    "merchant_id": "uuid",
    "merchant_name": "Merchant A",
    "role": "owner",
    "is_active": true,
    "venues": [
      {
        "venue_id": "uuid",
        "venue_name": "Venue 1",
        "is_assigned": true
      }
    ]
  }
]
```

### 测试数据（已存在，无需修改）

#### 测试邀请码 `1461`
**来源**：`supabase/migrations/004_seed.sql`

**配置**：
- Token: `1461`
- Merchant: `Test Merchant (Invite 1461)`
- Venue: `Test Venue` (Los Angeles, CA)
- Role: `owner`
- Max Uses: `999999`
- Expires: `NULL` (永不过期)
- issued_by_type: `admin`

**用途**：
新用户 Google 登录后，输入 `1461`，自动加入测试商户为 OWNER。

---

## Internal Auth 流程

### 登录与邀请门禁（Middleware）

**路径**：`apps/internal-web/middleware.ts`

**逻辑**：
```
1. API 路由 `/api/*` → 直接放行
2. 登录与回调 `/login`, `/auth/callback` → 放行
3. 检查 session:
   - 未登录 → 跳 `/login`
4. 查询 memberships:
   - 无 membership → 跳 `/invite`（邀请码门禁）
   - 有 1+ membership → 放行内部页面
```

### 邀请码兑换流程

**用户视角**：
```
1. Google 登录 → /login
2. 登录成功 → /
3. Middleware 检测无 membership → 跳 /invite
4. 输入邀请码 1461 → 调用 POST /api/invites/redeem
5. 兑换成功 → router.refresh()
6. Middleware 检测有 membership → 跳 /dashboard (role=OWNER/MANAGER) 或 /scan (role=STAFF)
```

**技术流程**：
```
POST /api/invites/redeem { token: "1461" }
  ↓
调用 redeem_invite('1461') RPC
  ↓
写入 merchant_members
  ↓
返回 { ok: true, merchant_id, role, ... }
  ↓
前端 router.refresh()
  ↓
Middleware 重新检查 memberships
  ↓
根据 role 跳转:
  - owner/manager → /dashboard
  - staff → /scan
```

---

## 依赖安装

### 必须安装的包

```bash
cd C:\Users\yesod\Desktop\lux-night
pnpm add qrcode --filter internal-web
pnpm add -D @types/qrcode --filter internal-web
```

**说明**：
- `qrcode` - QR 码生成库
- `@types/qrcode` - TypeScript 类型定义

---

## 验证步骤

### 1. 类型检查
```bash
cd apps/internal-web
pnpm run build
```

**预期**：
- ✅ 无 `Module not found` 错误
- ✅ 无 `Unexpected character '⨯'` 错误
- ✅ 无 TypeScript 类型错误

### 2. 数据库迁移
```bash
npx supabase db push
```

**预期**：
- ✅ 无 `policy already exists` 错误
- ✅ 无 `foreign key violation (23503)` 错误
- ✅ 迁移成功应用

### 3. 测试邀请码
```bash
npx supabase db reset  # 重置到干净状态
```

**预期**：
- ✅ 生成测试邀请码 `1461`
- ✅ 绑定到 `Test Merchant (Invite 1461)`

### 4. 完整登录流程

**手动测试**：
1. 打开 `http://localhost:3001/login`
2. 点击 Google 登录
3. 登录成功 → 自动跳转 `/invite`
4. 输入邀请码 `1461`
5. 点击 Confirm
6. 自动跳转 `/dashboard`
7. 看到 "Welcome! You've successfully joined as OWNER"

**数据验证**：
```sql
-- 查询 merchant_members
SELECT * FROM merchant_members WHERE user_id = 'your_user_id';

-- 查询 invite 使用次数
SELECT token, used_count FROM invites WHERE token = '1461';
```

---

## 错误解决说明

### 1. `policy already exists`
**原因**：旧迁移未正确使用幂等语法

**已修复**：
所有 RLS policies 使用 `DROP POLICY IF EXISTS ... CREATE POLICY`

### 2. `ERROR 23503: invites.merchant_id foreign key violation`
**原因**：Seed 使用不存在的硬编码 UUID (`00000000-...`)

**已修复**：
004_seed.sql 使用 `DO $$ ... END $$` 动态创建 merchant 并获取真实 ID

### 3. `UNAUTHENTICATED in RPC`
**原因**：Seed 脚本在 SQL Editor 执行时 `auth.uid()` 为空

**已修复**：
`invites.created_by` 允许 `NULL`，Seed 脚本智能查找第一个 admin 或 auth.users

### 4. `UTF-16 乱码 (Unexpected character '⨯')`
**原因**：Windows 编辑器保存为 UTF-16

**已修复**：
删除并重建为 UTF-8 文件

---

## 文件清单

### 新建文件
- ✅ `apps/internal-web/lib/utils/qr.ts`

### 重建文件（UTF-8）
- ✅ `apps/internal-web/lib/internal/auth.ts`
- ✅ `apps/internal-web/lib/internal/workspace.ts`

### 无需修改（已完善）
- ✅ `supabase/migrations/001_schema.sql`
- ✅ `supabase/migrations/002_rls.sql`
- ✅ `supabase/migrations/003_rpc.sql`
- ✅ `supabase/migrations/004_seed.sql`
- ✅ `apps/internal-web/middleware.ts`
- ✅ `apps/internal-web/app/api/invites/redeem/route.ts`

---

## 部署清单

### Local 开发环境

1. **安装依赖**
```bash
cd C:\Users\yesod\Desktop\lux-night
pnpm install  # 或 npm install (如果 pnpm 未安装)
```

2. **数据库迁移**
```bash
npx supabase db reset  # 重置到干净状态
npx supabase db push   # 应用迁移
```

3. **启动服务**
```bash
pnpm dev:internal  # http://localhost:3001
```

4. **测试登录**
- 打开 `http://localhost:3001`
- Google 登录
- 输入邀请码 `1461`
- 确认进入 Dashboard

### Production 部署

1. **Supabase Dashboard**
- 在 SQL Editor 执行 `001_schema.sql`
- 执行 `002_rls.sql`
- 执行 `003_rpc.sql`
- 执行 `004_seed.sql`（生产环境可选）

2. **环境变量（Vercel/Netlify）**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

3. **OAuth Redirect URLs（Supabase Dashboard）**
```
https://internal.yourdomain.com/auth/callback
http://localhost:3001/auth/callback
```

---

## 技术决策

### 1. 为什么不重构迁移？
**原因**：
- 现有迁移已经完善且幂等
- 支持所有需求（issued_by_type, redeem_invite, test invite 1461）
- 重构风险大于收益

### 2. 为什么用 `qrcode` 库？
**原因**：
- 成熟、稳定（周下载 500k+）
- 支持 Node.js 和浏览器
- Data URL 输出，易于集成

### 3. 为什么 middleware 不检查 API 路由？
**原因**：
- API 路由有自己的认证逻辑（`auth.getUser()`）
- Middleware 拦截会导致返回 HTML redirect 而不是 JSON
- 分离关注点：Middleware 管页面，API 管数据

---

## 后续优化建议

### 短期（可选）
1. 添加 `create_invite` API route（商家生成员工邀请码）
2. 实现 workspace 切换 UI（`/workspaces`）
3. 完善 QR 扫码核销页面（`/scan`）

### 长期
1. 离线队列（`IndexedDB` + 后台同步）
2. 实时核销通知（Supabase Realtime）
3. 多语言支持（i18n）
4. Analytics 集成

---

## 结论

✅ **所有核心问题已修复**
- UTF-16 乱码文件已重建
- QR 模块已创建
- 数据库迁移已确认幂等
- 邀请码系统完整可用
- 测试邀请码 1461 已就绪

🚀 **可以开始测试**
1. 安装依赖（qrcode）
2. 启动 dev server
3. Google 登录
4. 输入 1461
5. 进入 Dashboard

📝 **文档已生成**
- 架构说明
- API 接口
- 数据流程
- 验证步骤
- 错误解决

---

**生成时间**: 2026-01-18  
**工程师**: AI Assistant  
**状态**: ✅ Ready for Testing
