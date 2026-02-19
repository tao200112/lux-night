# 商家端（internal-web）阶段 1 全盘自检报告

**执行日期**: 2026-02-18  
**规则**: 阶段 1 仅做只读扫盘，禁止修改任何代码

---

## A) 商家端范围清单

### 1. 路由结构（Next.js App Router）

| 类型 | 路径 | 说明 |
|------|------|------|
| **登录/验证** | `/login` | 登录页 |
| | `/auth/callback` | Supabase OAuth 回调 |
| | `/auth/post-login` | 登录后处理 |
| | `/auth/error` | 认证错误 |
| | `/invite` | 邀请码门禁（无 membership 时） |
| | `/join` | 邀请码兑换确认（/join?token=xxx） |
| **Dashboard** | `/dashboard` | 店铺总览 |
| | `/` | 根页（重定向到 dashboard 或 workspace） |
| **Staff** | `/staff` | 员工列表 |
| | `/staff/[memberId]` | 员工详情 |
| **Invites** | `/invites/create` | 生成邀请码 |
| **Events** | `/events` | 活动列表（旧 V1 风格） |
| | `/events-v2` | 活动列表（V2） |
| | `/events-v2/[id]` | 活动详情（周配置） |
| | `/events-v2/[id]/request-change` | 发起活动修改申请 |
| **Requests** | `/requests` | 申请中心（通用 requests 表） |
| | `/requests/new-event` | 新建活动申请 |
| | `/requests/inventory-change` | 库存修改申请 |
| | `/requests/price-change` | 价格修改申请 |
| **Admin（商家端内）** | `/admin/event-change-requests` | 管理员审批活动变更 |
| **其他** | `/settings` | 设置 |
| | `/workspaces` | 工作区选择 |
| | `/scan` | 扫码核销 |
| | `/no-access` | 无权限 |
| | `/onboarding/*` | 入驻流程 |

### 2. Layout / Shell / Container

- **根 Layout**：`app/layout.tsx`  
  - 只包含：`MerchantProvider` + `globals.css`，无统一 Shell/Sidebar/PageContainer
- **无** 统一的 `PageContainer` / `Shell` 组件
- **Admin-web** 有：`AdminSidebar` + `AdminBottomNav` + 响应式 `lg:` 断点
- **Internal-web**：各页面自行用 `max-w-[430px] mx-auto` 或 `max-w-7xl`，风格不统一

---

## B) UI / 响应式统一性检查

### 1) 多套 Layout 并存？

- **不存在** 多套 Layout：只有根 `layout.tsx`
- **问题**：根 Layout 没有提供 Shell（侧边栏/底栏），各页面各自实现 header/nav
- **未包在统一 Shell 下**：所有页面均无统一 Shell，各自实现顶部栏 + 底部栏

### 2) Container 宽度策略（证据：路径 + 行号）

| 页面 | 策略 | 证据 |
|------|------|------|
| `dashboard/page.tsx` | max-w-[430px] | L113 |
| `events/page.tsx` | max-w-[430px] | L106, L342 |
| `events-v2/page.tsx` | max-w-7xl | L58, L83 |
| `events-v2/[id]/page.tsx` | max-w-7xl | L84, L109 |
| `staff/page.tsx` | max-w-[430px] + max-w-md | L112, L129 |
| `invites/create/page.tsx` | max-w-[430px] | L67 |
| `requests/page.tsx` | max-w-[430px] | L108 |
| `requests/inventory-change` | max-w-[430px] | L139 |
| `requests/price-change` | max-w-[430px] | L140 |
| `admin/event-change-requests` | max-w-[430px] | L126, L147 |
| `join/page.tsx` | 无 max-w（全屏） | - |
| `invite/page.tsx` | 无 max-w（全屏） | - |
| `login/page.tsx` | 无 max-w | - |
| `events-v2/[id]/request-change` | 需确认 | - |

**结论**：events-v2 系列用 `max-w-7xl`（桌面宽），其余多为 `max-w-[430px]`（手机宽），导致 Desktop/Web 与 Mobile 表现不一致。

### 3) 组件对齐问题

- **标题字号**：`text-lg` / `text-xl` / `text-2xl` 混用
- **卡片 padding**：`p-4` / `p-6` / `rounded-xl` 与 `rounded-lg` 混用
- **Badge**：部分用 `text-[10px]`，部分用 `text-xs`
- **Bottom Nav**：部分页面有固定底栏（dashboard, events, staff），events-v2 系列无
- **Back 按钮**：`arrow_back` / `arrow_back_ios` / `arrow_back_ios_new` 不统一

### 4) 统一规范提案（不改代码）

| 项目 | 建议值 |
|------|--------|
| Desktop 断点 | `lg: 1024px`（与 admin-web 一致） |
| 默认 PageContainer | `max-w-6xl mx-auto px-4 md:px-6` |
| Mobile 特例 | `max-w-[430px]` 仅在移动优先页使用，且通过 `lg:` 覆盖为 `max-w-6xl` |
| 表格/列表 overflow | `overflow-x-auto` + `min-w-0` |
| FullBleed 特例 | 如 join/login/invite 需显式 `FullBleed=true` |

---

## C) 稳定性与报错清零

### 1) 404 Failed to load resource

**可能来源**（代码与文档证据）：

| 类型 | 具体 URL/触发 | 根因 |
|------|---------------|------|
| API 返回 HTML 404 | 部分 API 路由未正确注册或返回 404 HTML | `FIX_API_404.md` 已记录：API 返回 `<!DOCTYPE` 时前端解析 JSON 失败 |
| 路由不存在 | `/api/admin/event-change-requests/[id]/approve` 等 | 需确认路由文件存在且导出正确 |
| 静态资源 | `fonts.googleapis.com` / `Material+Symbols` | 网络或 CSP 可能导致 404 |
| 表不存在 | `event_change_requests` | 见下文 |

**关键发现**：`event_change_requests` 表已在 `20260127210000_drop_legacy_tables.sql` 中被 `DROP`。以下 API 仍查询/写入该表，会导致 500 或关系不存在错误：

- `app/api/merchant/event-change-requests/route.ts` L233, L270 等：`from('event_change_requests')`
- `app/api/admin/event-change-requests/route.ts` L57：`from('event_change_requests')`
- `app/api/admin/event-change-requests/[id]/approve/route.ts`
- `app/api/admin/event-change-requests/[id]/reject/route.ts`

当前有效表为 `merchant_change_requests`（migration 034）。

### 2) Cannot read properties of undefined (reading 'name')

**定位**：`apps/internal-web/app/events-v2/page.tsx` 第 127 行

```tsx
<span className="text-xs text-gray-500">{event.merchant.name}</span>
```

**根因**：

- `/api/events-v2` 使用 Supabase 查询：`merchants!inner(id, name)`
- PostgREST 返回的 FK 字段名为表名 `merchants`，不是 `merchant`
- 因此 `event.merchant` 为 `undefined`，访问 `event.merchant.name` 会报错

**证据**：`app/api/events-v2/route.ts` L28-34：

```ts
.select(`
  *,
  merchants!inner (
    id,
    name
  )
`)
```

**修复方向（仅方案，不改代码）**：

1. **防御性渲染**：`{(event.merchants || event.merchant)?.name ?? 'Unknown'}`
2. **数据修复**：API 返回前将 `merchants` 映射为 `merchant`，或前端统一使用 `event.merchants?.name`

---

## D) 关键业务链路自检

### 1) 登录 / 权限

| 项目 | 结论 | 证据 |
|------|------|------|
| 如何判定 merchant？ | 通过 `merchant_members` 表 + `get_my_workspaces` RPC | `lib/internal/auth.ts` L50-58, `api/me/route.ts` |
| 验证码绑定落库 | 邀请码兑换后插入 `merchant_members`，无单独 `otp_verified_at` | `api/invites/redeem` 调用 RPC |
| 前端限制 | Middleware 检查 `merchant_members`，无 membership 重定向 `/invite` | `middleware.ts` L162-234 |
| 后端限制 | API 使用 `requireInternalAuth` + `getActiveWorkspace`，按 `merchant_id` 过滤 | 各 API 如 `api/merchant/staff`, `api/dashboard` |
| 越权风险 | workspace 来自 cookie/session，若篡改 `merchant_id` 需校验 | 需确认 workspace 选择接口校验 membership |

**权限链路**：`Auth (Supabase session)` → `merchant_members (user_id)` → `getActiveWorkspace (profiles.default_merchant_id)` → 各 API 使用 `workspace.merchantId` 过滤。

### 2) Dashboard 总览真实数据

| 指标 | 数据来源 | 过滤条件 | 问题 |
|------|----------|----------|------|
| 售票数量 | `orders` 表，`paidOrders.length` | `event_id IN merchant events`, `status='paid'` | 以订单数为准，非 ticket 数；`totalTickets` 近似 |
| 总金额 | `amount_cents` 求和 / 100 | `status='paid'` | 已剔除 refunded；`revenue.thisWeek` 为净收入 |
| 与 Admin 一致性 | - | - | 需对照 admin dashboard 口径 |
| tonightEvents | `event_week_days` + `event_weeks` | 当天 dow + `status='active'` | `sold` 用订单数，`total: 100` 为写死；`venue` 为 `'Main Venue'` 占位 |
| 周同比等 | `+12%` / `+5%` 等 | - | **硬编码**，非真实计算 |

**证据**：`lib/data/internal/dashboard.ts` L60-98, L124-144。

### 3) 员工邀请码

| 项目 | 结论 | 证据 |
|------|------|------|
| 生成 | RPC `create_staff_invite` | `api/invites/create/route.ts` L92 |
| 绑定 merchant | `p_merchant_id` | 同上 |
| 过期 | `p_expires_days`（默认 30） | 同上 |
| 一次性 | `p_max_uses`，用 `used_count` 控制 | RPC 逻辑 |
| 兑换后 | 插入 `merchant_members`，角色由 `p_intended_role` 决定 | `api/invites/redeem` |

### 4) 员工信息编辑（名字）

| 项目 | 结论 | 证据 |
|------|------|------|
| staff 表 | `merchant_members` 无 `display_name`；名字来自 `profiles.display_name` | `api/merchant/staff/route.ts` L186-188 |
| 是否可更新 | 当前 `PATCH /api/staff/[memberId]` 仅支持 `isActive` | `api/staff/[memberId]/route.ts` L20-27 |
| 编辑入口 | `/staff/[memberId]` 有 edit 图标按钮，**无 onClick** | `staff/[memberId]/page.tsx` L167 |

**缺口**：员工名字编辑未实现（既无 API 也无 UI 逻辑）。

### 5) 活动信息查看

| 项目 | 结论 | 证据 |
|------|------|------|
| 可见 events | 按 `workspace.merchantId` 过滤 | `api/events-v2/route.ts` L36 |
| event week 渲染 | `day.tickets.map` 使用 `ticket.name` | `events-v2/[id]/page.tsx` L172-178 |
| undefined 风险 | RPC `rpc_get_or_create_event_week` 返回 `days[].tickets`，若缺 `name` 会异常 | 需确认 RPC 返回结构 |

### 6) Request Changes 全链路

| 环节 | 表/字段 | 说明 |
|------|---------|------|
| 商家提交（周配置） | `merchant_change_requests` | `/api/events-v2/[id]/change-requests` POST，写入 `target_week_start_date`, `payload`, `status='pending'` |
| 商家提交（价/库存） | `event_change_requests`（已删除） | `/api/merchant/event-change-requests` 写入该表，**表不存在** |
| Admin 审批 | `event_change_requests`（已删除） | internal-web `/api/admin/event-change-requests` 查询该表，**会失败** |
| Admin 正确实现 | `merchant_change_requests` | admin-web `/api/admin/change-requests` 使用正确表 |
| 状态回流 | - | 商家端需从 `merchant_change_requests` 读取 `status`；`/api/merchant/event-change-requests` GET 当前查 `event_change_requests`，会失败 |

**状态机**：`pending` → `approved` | `rejected` | `cancelled`

** merchant_change_requests 字段**：`id`, `merchant_id`, `event_id`, `target_week_start_date`, `payload`, `note`, `status`, `reviewed_by_admin`, `reviewed_at`, `review_note`, `created_at`, `updated_at`。**无** `request_type`, `payload_json`, `submitted_by` 等 `event_change_requests` 风格字段。

---

## E) 输出格式（阶段 1 结论）

### 1) Findings 汇总

#### UI / 响应式（按严重度）

| 严重度 | 问题 |
|--------|------|
| 高 | 无统一 Shell/PageContainer，各页面布局不一致 |
| 高 | events-v2 用 `max-w-7xl`，其他用 `max-w-[430px]`，桌面/手机不一致 |
| 中 | 标题、卡片、Badge 的 spacing/typography 不统一 |
| 中 | events-v2 系列缺少底部导航 |

#### 404 问题

| 类型 | 具体 | 根因 |
|------|------|------|
| 表不存在 | `event_change_requests` | Migration 027 已 DROP，多处 API 仍使用 |
| API 返回 HTML | 邀请码等接口 | 历史问题，见 `FIX_API_404.md`；修改 API 后需重启 dev |

#### undefined.name 问题

| 位置 | 根因 |
|------|------|
| `events-v2/page.tsx:127` | API 返回 `event.merchants`，前端使用 `event.merchant.name` |

#### 业务链路缺口

| 模块 | 缺口 |
|------|------|
| 登录/权限 | 逻辑完整，但需确认 workspace 切换时的 membership 校验 |
| Dashboard | 假数据：`+12%` 等硬编码；`tonightEvents.total` 写死 100；`venue` 占位 |
| 邀请码 | 功能完整 |
| 员工编辑 | 无编辑名字的 API 与 UI |
| Request Changes | price/inventory 类请求依赖已删除的 `event_change_requests`；admin 审批在 internal-web 查错表 |

### 2) Root Cause（每项 1–2 句）

- **event.merchant undefined**：Supabase 返回 `merchants`，前端使用 `merchant`，未做兼容。
- **event_change_requests 404/500**：表在 migration 027 中删除，相关 API 未迁移到 `merchant_change_requests`。
- **Dashboard 假数据**：部分指标写死，未接入真实统计与同比计算。
- **员工名字不可编辑**：PATCH staff 仅支持 `isActive`，无 `display_name` 更新逻辑与 UI。

### 3) Fix Plan（只写计划，不改代码）

#### 按模块的文件清单

| 模块 | 待修改文件 |
|------|------------|
| UI 统一 | 新建 `components/MerchantShell.tsx`, `PageContainer.tsx`；`layout.tsx` 或各页引入 |
| 404/表 | `api/merchant/event-change-requests/route.ts`；`api/admin/event-change-requests/route.ts` 及 approve/reject；或统一迁移到 `merchant_change_requests` |
| undefined.name | `app/events-v2/page.tsx` 或 `api/events-v2/route.ts` |
| Dashboard | `lib/data/internal/dashboard.ts`；`app/dashboard/page.tsx`（移除硬编码） |
| 员工编辑 | `api/staff/[memberId]/route.ts`（支持 `displayName`）；`profiles` 或 `merchant_members` 扩展；`staff/[memberId]/page.tsx`（编辑弹窗/表单） |
| Request 迁移 | 将 price/inventory 类请求迁移到 `merchant_change_requests` 或新建统一请求表，并更新前后端 |

#### API / DB / RLS

- 若沿用 `merchant_change_requests`：扩展 `payload` 支持 price/inventory 等类型，或增加 `request_type` 列。
- 员工名字：若更新 `profiles`，需检查 RLS 是否允许 merchant owner/manager 修改他人 `display_name`；否则在 `merchant_members` 增加 `display_name` 覆盖字段。

#### 风险与回滚

- 表结构变更需 migration，并保证向后兼容。
- 修改前备份相关数据；分模块、分 commit 提交，便于回滚。

### 4) Test Plan

#### E2E 手工路径

1. 登录 → 验证无 membership 时跳 `/invite`。
2. 输入邀请码 → 兑换 → 进入 dashboard。
3. Dashboard：检查销售/订单/核销数据与 Admin 或 DB 一致。
4. Staff → 生成邀请码 → 复制 → 新用户兑换加入。
5. Staff 详情 → 编辑名字 → 保存 → 列表中显示新名字。
6. Events-v2 → 活动列表无 `undefined` 报错。
7. 活动详情 → Request Change → 提交 → 状态为 pending。
8. Admin 审批 → 通过/拒绝 → 商家端 Request Center 显示最新状态。

#### 最少自动化测试

- Playwright：登录 → dashboard → staff → invites/create → events-v2 列表。
- Unit：`getDashboardStats` 返回结构；`event.merchants` 映射逻辑。

### 5) Acceptance Criteria

- 商家端各页面在桌面与手机上使用统一 Shell + Container。
- 控制台无报错，Network 无关键 404（尤其 API 与静态资源）。
- 登录与 workspace 权限严格，无法越权访问其他 merchant。
- Dashboard 数据与订单/票务一致，并有明确核对方式。
- 邀请码生成与兑换可用；员工可编辑名字并正确展示。
- Request Changes（周配置 + price/inventory）全链路可创建、审批、状态回显。
- `event.merchant` / `event.merchants` 问题已修复，events-v2 列表可正常渲染。

---

*报告结束。等待「OK，开始修复」后再进入阶段 2。*
