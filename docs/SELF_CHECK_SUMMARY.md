# Lux Night 功能组件自检总结

**自检日期**：2026-02-17  
**技术栈**：Next.js 15 + Supabase + Stripe + pnpm Monorepo  

---

## 一、项目概览

### 1.1 仓库结构

```
lux-night/
├── apps/
│   ├── customer-web    # 客户端主站 (port 3000)
│   ├── internal-web    # 内部运营 (port 3001)
│   └── admin-web       # 管理后台 (port 3002)
├── packages/
│   └── shared          # 共享库 (@lux-night/shared)
├── supabase/           # 数据库迁移与配置
│   └── migrations/     # 62 个 migration 文件
└── docs/               # 项目文档
```

### 1.2 技术依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| Next.js | 15.5.9 | App Router |
| React | 19.x | UI 框架 |
| Supabase | 2.90.x | 数据库 + Auth |
| Stripe | 17.7.x | 支付 |
| TypeScript | 5.8.x | 类型系统 |
| pnpm | ≥8 | 包管理 |

---

## 二、应用组件清单

### 2.1 customer-web（客户端）

| 类型 | 路径/模块 | 状态 | 说明 |
|------|-----------|------|------|
| **页面** | `/` | ✅ | 首页 |
| | `/events-v2/[id]` | ✅ | V2 活动详情（主流程） |
| | `/checkout` | ✅ | 结账页 |
| | `/orders`, `/orders/[id]` | ✅ | 订单列表 / 详情 |
| | `/wallet` | ✅ | 钱包/票夹 |
| | `/ticket/[id]` | ✅ | 票详情 |
| | `/t/[token]`, `/redeem/[token]` | ✅ | 票分享 / 核销引导 |
| | `/drops`, `/drops/[id]` | ✅ | Drops 功能 |
| | `/profile`, `/profile/edit` | ✅ | 用户资料 |
| | `/login`, `/auth/post-login` | ✅ | 登录 |
| | `/settings`, `/help`, `/support` | ✅ | 设置 / 帮助 |
| | `/staff-tools` | ✅ | Staff 工具入口 |
| **API** | `/api/public/checkout-v2` | ✅ | 主 Checkout 创建 Stripe Session |
| | `/api/checkout/create-session` | ✅ | 旧版 Checkout |
| | `/api/stripe/webhook` | ✅ | Stripe Webhook 处理 |
| | `/api/stripe/webhook/health` | ✅ | Webhook 健康检查 |
| | `/api/tickets/public` | ✅ | 公开查票（含 60/min rate limit） |
| | `/api/tickets/redeem` | ✅ | 核销（customer 端） |
| | `/api/public/events-v2/[id]` | ✅ | 活动公开接口 |
| | `/api/public/events-v2/[id]/week` | ✅ | 周历数据 |
| | `/api/public/invites/validate` | ✅ | 邀请码校验 |
| | `/api/region/*`, `/api/regions` | ✅ | 区域相关 |
| | `/api/auth/*`, `/api/me`, `/api/profile/*` | ✅ | 认证与用户 |

### 2.2 internal-web（内部运营）

| 类型 | 路径/模块 | 状态 | 说明 |
|------|-----------|------|------|
| **页面** | `/` | ✅ | 首页 |
| | `/dashboard` | ✅ | 仪表盘 |
| | `/events-v2`, `/events-v2/[id]` | ✅ | 活动列表 / 详情 |
| | `/events-v2/[id]/request-change` | ✅ | 发起变更请求 |
| | `/scan` | ✅ | 扫码核销 |
| | `/scan/duplicate`, `/scan/wrong-venue`, `/scan/lookup`, `/scan/offline` | ✅ | 核销状态页 |
| | `/staff`, `/staff/[memberId]` | ✅ | Staff 管理 |
| | `/settings` | ✅ | 设置 |
| | `/invite`, `/invites/create` | ✅ | 邀请 |
| | `/onboarding/*` | ✅ | 入驻流程 |
| | `/requests/*` | ✅ | 各类审批请求 |
| | `/admin/event-change-requests` | ✅ | 管理员变更审批 |
| **API** | `/api/tickets/redeem` | ✅ | 核销（含乐观锁 status='active'） |
| | `/api/merchant/*` | ✅ | 商户相关 |
| | `/api/events-v2/*` | ✅ | 活动相关 |
| | `/api/invite/consume`, `/api/invites/*` | ✅ | 邀请消费与创建 |
| | `/api/workspace/select` | ✅ | 工作空间切换 |
| | `/api/dashboard` | ✅ | 仪表盘数据 |

### 2.3 admin-web（管理后台）

| 类型 | 路径/模块 | 状态 | 说明 |
|------|-----------|------|------|
| **页面** | `/` | ✅ | 首页 |
| | `/dashboard` | ✅ | 仪表盘 |
| | `/merchants`, `/merchants/[merchantId]` | ✅ | 商户管理 |
| | `/orders`, `/orders/[orderId]` | ✅ | 订单管理 |
| | `/events-v2`, `/events-v2/new`, `/events-v2/[id]/week` | ✅ | 活动 V2 管理 |
| | `/approvals`, `/approvals/[requestId]` | ✅ | 审批 |
| | `/change-requests` | ✅ | 变更请求 |
| | `/customers`, `/customers/[customerId]` | ✅ | 客户管理 |
| | `/ambassadors` | ✅ | 大使管理 |
| | `/invites` | ✅ | 邀请管理 |
| | `/exports` | ✅ | 导出 |
| | `/settings` | ✅ | 全局设置 |
| | `/settings/drops`, `/settings/invites`, `/settings/venues` | ✅ | 子设置 |
| | `/debug/orders` | ✅ | 调试订单 |
| **API** | `/api/admin/debug/complete-order` | ✅ | 手动完成订单（生产保护） |
| | `/api/admin/*` | ✅ | 各管理接口 |
| | `/api/admin/health` | ✅ | 健康检查 |
| | `/api/admin/schema-check` | ✅ | Schema 检查 |

### 2.4 packages/shared（共享库）

| 导出 | 说明 |
|------|------|
| `@lux-night/shared/supabase/client` | 浏览器 Supabase 客户端 |
| `@lux-night/shared/supabase/server` | 服务端 Supabase 客户端 |
| `@lux-night/shared/types` | 共享类型 |
| `@lux-night/shared/constants` | 常量 |
| `@lux-night/shared/data/*` | 数据层（profile, regions, drops） |
| `@lux-night/shared/utils/qr` | QR 工具 |
| `@lux-night/shared/auth` | Auth 相关 |

---

## 三、核心业务流程

### 3.1 票务主流程（V2）

```
用户选票 → checkout-v2 (order + order_items + Stripe Session)
        → Stripe 支付
        → Webhook checkout.session.completed
        → 生成 tickets，更新 order status
        → 用户查看 /api/tickets/public?token=...
        → Staff 核销 internal-web /api/tickets/redeem { token }
```

### 3.2 订单状态

`created` → `pending_payment` → `paid` → `fulfilled`（或 `expired` / `refunded`）

### 3.3 数据库关键约束

- `orders.idempotency_key` UNIQUE
- `stripe_webhook_events.event_id` UNIQUE
- `tickets.public_token` UNIQUE

---

## 四、自检结果（2026-02-17）

### 4.1 构建

| 应用 | 结果 | 备注 |
|------|------|------|
| customer-web | ✅ 通过 | 28 个路由 |
| internal-web | ✅ 通过 | 51 个页面/路由 |
| admin-web | ✅ 通过 | 44 个页面/路由 |

### 4.2 Lint

| 应用 | 结果 | 备注 |
|------|------|------|
| 全量 lint | ⚠️ 需交互 | `next lint` 即将弃用，提示迁移至 ESLint CLI |

### 4.3 部署

| 项目 | 状态 |
|------|------|
| pnpm-lock.yaml | ✅ 已同步（含 turbo@^2.3.3） |
| Vercel 构建 | ✅ 预期可成功（build 已通过） |

---

## 五、安全与可靠性审计

依据 `docs/TICKETING_RELIABILITY_SECURITY_AUDIT.md`：

### 5.1 已修复（M1 + M2 + M3）

| 编号 | 项目 | 状态 |
|------|------|------|
| 1 | 退款时 tickets 置为 refunded | ✅ |
| 2 | ticket_types_v2 sold_count + Checkout 库存校验 + Webhook 原子自增 | ✅ |
| 3 | V1 sold_count 原子更新（RPC） | ✅ |
| 4 | order_items 写入 valid_start_at/valid_end_at 快照 | ✅ |
| 5 | Checkout 幂等键 | ✅ |
| 6 | internal-web redeem 乐观锁 | ✅ |
| 7 | debug complete-order 生产保护 | ✅ |
| 8 | /api/tickets/public rate limit（60/min） | ✅ |
| 10 | Webhook 金额校验 | ✅ |
| 12 | Webhook 可重试错误不标 processed | ✅ |
| 13 | debug complete-order 写 audit_log | ✅ |
| 14 | async_payment 按 version 路由 V2 | ✅ |
| 15 | invite increments 原子化（RPC） | ✅ |

### 5.2 可选 / 未实施

| 编号 | 项目 | 备注 |
|------|------|------|
| 9 | QR 防伪（签名校验） | 可选 |
| 11 | tickets INSERT RLS 收紧 | 可选 |

---

## 六、数据库迁移

### 6.1 票务相关（近期）

| 迁移 | 说明 |
|------|------|
| `20260217100000_atomic_increment_ticket_type_sold.sql` | 原子递增 ticket_types.sold_count + ambassador_invite |
| `20260217110000_add_sold_count_to_ticket_types_v2.sql` | ticket_types_v2.sold_count + increment_ticket_type_v2_sold |
| `20260217120000_rpc_include_sold_count.sql` | RPC 返回 sold_count |

### 6.2 总迁移数

62 个 migration 文件（含根目录与 internal-web 子目录）

---

## 七、已知问题与建议

### 7.1 待办

1. **Lint 迁移**：`next lint` 将在 Next.js 16 移除，建议执行 `npx @next/codemod@canary next-lint-to-eslint-cli .` 迁移。
2. **Vercel 多项目**：需为 customer / internal / admin 分别配置 Root Directory 与环境变量。

### 7.2 环境依赖

- 本地开发需 `pnpm install` 及 `.env.local`（Supabase URL/Key、Stripe Key 等）
- CI 环境需设置 `CI=true` 避免 pnpm 交互式提示

---

## 八、快速命令参考

```bash
# 开发
pnpm run dev:customer   # 3000
pnpm run dev:internal   # 3001
pnpm run dev:admin      # 3002

# 构建
pnpm run build          # 全量
pnpm --filter customer-web build   # 单应用

# Supabase
pnpm run supabase:start
pnpm run supabase:push
pnpm run supabase:reset
```

---

*文档由自检生成，如有变更请同步更新。*
