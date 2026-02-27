# Lux Night 全栈安全与质量审计报告

**审计日期**: 2026-02-26  
**审计范围**: Admin / Internal (Merchant) / Customer 三端口 + Supabase 后端 + 数据库  
**报告版本**: 1.0

---

## 1. Executive Summary

### 1.1 总体健康分：**58/100**

| 维度 | 评分 | 结论 |
|------|------|------|
| 安全 | 45/100 | 存在 2 个 P0、2 个 P1 级漏洞，需立即修复 |
| 可用性 | 75/100 | 三端口核心流程基本闭环，部分边界处理可加强 |
| 数据一致性 | 70/100 | 幂等与事务较完善，存在潜在重复记账风险 |
| 运维可观测性 | 50/100 | 缺少速率限制、部分敏感日志、测试覆盖不足 |

### 1.2 Top 10 风险摘要

| # | 严重度 | 问题 | 影响 |
|---|--------|------|------|
| 1 | **P0** | Customer 端票务 IDOR：任意登录用户可通过 ticket UUID 核销他人票 | 资金/票务可被滥用 |
| 2 | **P0** | `get_user_emails` RPC 无权限校验，任意认证用户可批量拉取 auth.users 邮箱 | 数据泄露、GDPR 风险 |
| 3 | **P1** | `checkin_ticket` RPC 不校验 Staff 权限，仅校验登录 | 与 API 层不一致，易被绕过 |
| 4 | **P1** | Admin 端 API 路由被 middleware 视为公开，依赖每个 handler 单独鉴权 | 漏检即越权 |
| 5 | **P2** | 无速率限制：登录、邀请码、核销、导出接口可被刷 | 可用性/成本风险 |
| 6 | **P2** | 存储桶 event-posters 公开读策略过于宽松 | 潜在敏感文件泄露 |
| 7 | **P2** | 无 E2E/集成测试，关键路径未自动化 | 回归风险高 |
| 8 | **P2** | `profiles.email` 依赖 comment，admin RPC 暴露 auth.users | 双源可能导致混淆 |
| 9 | **P3** | Customer middleware 无路由保护，所有页面均可匿名访问 | 仅前端隐藏，需后端兜底 |
| 10 | **P3** | 部分 RPC 无 GRANT 限制，默认 `PUBLIC` 可执行 | 权限边界不清 |

### 1.3 核心结论

- **可用性**：三端口核心旅程（购票、核销、商户管理、Admin 管理）基本完整，但边界条件（空数据、超时、跨时区）需人工回归。
- **安全**：存在前端判断角色但 RPC/后端未拦截的典型问题（票务 IDOR），以及敏感 RPC 无权限校验。
- **一致性**：Stripe Webhook 有幂等与签名校验；邀请码、票务 sold_count 有并发控制；积分/订单有事务；但 `increment_ambassador_invite_usage` 与 `increment_ticket_type_v2_sold` 需确认在高并发下的原子性。

---

## 2. System Map

### 2.1 端口与路由

| 端口 | 应用 | 默认端口 | 角色 | 关键路由 |
|------|------|----------|------|----------|
| **Customer** | `apps/customer-web` | 3000 | 购票用户 | `/`, `/drops`, `/events-v2/[id]`, `/checkout`, `/orders`, `/wallet`, `/t/[token]`, `/redeem/[token]`, `/profile`, `/login` |
| **Internal** | `apps/internal-web` | 3001 | 商户/Staff | `/dashboard`, `/events`, `/scan`, `/staff`, `/invites/create`, `/requests`, `/settings`, `/login`, `/invite`, `/onboarding/*` |
| **Admin** | `apps/admin-web` | 3002 | 平台管理员 | `/dashboard`, `/merchants`, `/orders`, `/customers`, `/invites`, `/exports`, `/approvals`, `/change-requests`, `/settings`, `/login`, `/no-access` |

### 2.2 关键 API / RPC

| 类型 | 路径/名称 | 说明 | 鉴权 |
|------|-----------|------|------|
| API | `POST /api/stripe/webhook` (customer-web) | Stripe Webhook | 签名校验 ✅ |
| API | `POST /api/tickets/redeem` (customer-web) | 按 token 核销（Staff） | Staff/Admin ✅ |
| API | `POST /api/tickets/[id]/redeem` (customer-web) | 按 ticket ID 核销 | **仅登录** ❌ P0 |
| API | `POST /api/tickets/redeem` (internal-web) | 按 token 核销 | Staff/Admin ✅ |
| API | `GET/POST /api/admin/exports` | 导出任务 | is_admin ✅ |
| API | `GET /api/admin/orders` | 订单列表+用户邮箱 | requireAdmin ✅ |
| RPC | `redeem_invite(p_token)` | 邀请码兑换 | auth.uid() ✅ |
| RPC | `create_staff_invite(...)` | 创建员工邀请 | auth.uid() + merchant role ✅ |
| RPC | `checkin_ticket(p_ticket_id, ...)` | 票务核销 | **仅 auth.uid()** ❌ P1 |
| RPC | `get_user_emails(p_user_ids)` | 拉取 auth.users 邮箱 | **无** ❌ P0 |
| RPC | `increment_ticket_type_v2_sold` | 原子更新 sold_count | 内部使用 |
| RPC | `increment_ambassador_invite_usage` | 大使邀请使用计数 | 内部使用 |

### 2.3 数据库表（核心）

| 表 | RLS | 说明 |
|----|-----|------|
| `profiles` | ✅ | 本人读写 |
| `merchants` | ✅ | 成员/Admin |
| `venues` | ✅ | 成员/Admin |
| `merchant_members` | ✅ | 本人/商户 |
| `invites` | ✅ | 商户成员 |
| `admin_users` | ✅ | Admin |
| `events` / `events_v2` | ✅ | 公开读 / 商户写 |
| `ticket_types` / `ticket_types_v2` | ✅ | 公开读 / 商户写 |
| `orders` | ✅ | 本人 / Admin |
| `order_items` | ✅ | 跟随 order |
| `tickets` | ✅ | 本人 / Admin / 场地 Staff |
| `checkins` | ✅ | Staff |
| `stripe_webhook_events` | ✅ | Admin / Service |
| `audit_logs` | ✅ | Admin |
| `export_tasks` | ✅ | Admin |

### 2.4 存储桶

| Bucket | 用途 | 策略 |
|--------|------|------|
| `event-posters` | 活动海报 | Admin/Merchant 上传；**Public 可读**（潜在 P2） |

### 2.5 第三方服务

- **Supabase**: Auth, DB, Storage, Realtime
- **Stripe**: 支付、Webhook（`checkout.session.completed`, `charge.refunded` 等）
- **Google Places API**（Admin 使用）

---

## 3. Findings（按模块）

### A. 三端口功能与权限边界

#### F-A1 【P0】Customer 端票务 IDOR：任意登录用户可核销他人票

| 属性 | 内容 |
|------|------|
| 影响面 | 用户/资金/票务 |
| 复现步骤 | 1. 以任意用户登录 customer-web；2. 调用 `POST /api/tickets/[id]/redeem`，`id` 为他人 ticket UUID；3. 票被核销 |
| 证据 | `apps/customer-web/app/api/tickets/[id]/redeem/route.ts` 第 21-28 行：仅检查 `user` 存在后直接调用 `checkin_ticket`，未校验 ticket 归属或 Staff 权限 |

```typescript
// apps/customer-web/app/api/tickets/[id]/redeem/route.ts
const { data: result, error: rpcError } = await supabase.rpc('checkin_ticket', {
  p_ticket_id: ticketId,  // 任意 ticket UUID
  p_action: 'ENTRY',
  ...
});
```

- **修复建议**：
  1. **立即**：删除或下线 `POST /api/tickets/[id]/redeem`（当前 redeem 流程使用 `/api/tickets/redeem` + token）。
  2. 若必须保留：在 API 层校验 `ticket.user_id === auth.uid()`（仅允许本人核销自己的票），或改为 Staff-only 并复用 internal-web 的权限逻辑。
- **预估工作量**：S (≤2h)

#### F-A2 【P0】`get_user_emails` RPC 无权限校验

| 属性 | 内容 |
|------|------|
| 影响面 | 数据/合规 |
| 复现步骤 | 使用 Supabase 客户端 `supabase.rpc('get_user_emails', { p_user_ids: [uuid1, uuid2, ...] })`，可批量获取 auth.users 邮箱 |
| 证据 | `supabase/migrations/20260218000000_admin_get_user_emails_rpc.sql`：函数无 `is_admin()` 等校验，且无 `REVOKE`/`GRANT` 限制 |

- **修复建议**：在 RPC 内部增加 `IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;`，并 `REVOKE ... FROM public; GRANT EXECUTE ... TO authenticated;`（需配合仅 Admin 调用的包装逻辑，或通过 PostgREST 角色限制）。
- **预估工作量**：S

#### F-A3 【P1】Admin API 依赖各 handler 鉴权，middleware 将 `/api/` 视为公开

| 属性 | 内容 |
|------|------|
| 影响面 | 可用性/安全 |
| 证据 | `apps/admin-web/middleware.ts` 第 17-21 行：`pathname.startsWith('/api/')` 视为 public，直接放行 |

- **修复建议**：将 `/api/admin/*` 加入保护路径，或统一在 API 层使用 `requireAdmin` 封装，并做审计确保无遗漏。
- **预估工作量**：M

#### F-A4 【P2】Internal 端 Staff 路由仅靠 middleware 重定向

| 属性 | 内容 |
|------|------|
| 影响面 | 权限 |
| 证据 | Staff 访问 `/settings` 等会被 middleware 重定向到 `/scan`，但若直接调用内部 API（如 merchant 相关接口），需确保每个 API 都校验 `has_merchant_role` |
| 修复建议 | 审计所有 `/api/merchant/*` 等接口，确保后端校验 role；增加 E2E 测试 Staff 访问管理接口返回 403。 |
| 预估工作量 | M |

---

### B. 前端审计

#### F-B1 【P2】Customer middleware 无路由保护

| 属性 | 内容 |
|------|------|
| 影响面 | 体验/一致性 |
| 证据 | `apps/customer-web/middleware.ts`：仅刷新 session，不区分公开/需登录路由 |
| 修复建议 | 对 `/wallet`, `/orders`, `/profile` 等需登录页面做 redirect，或由页面内校验后跳转；确保后端 API 对所有敏感操作都有 auth 校验。 |
| 预估工作量 | S |

#### F-B2 【P3】`dangerouslySetInnerHTML` 仅来自框架/静态内容

| 属性 | 内容 |
|------|------|
| 证据 | grep 显示主要出现在 `.next` 构建产物（Next 内置 404 样式），未见用户可控富文本直接渲染 |
| 建议 | 若后续引入 UGC/富文本，必须做 CSP、sanitize、非 `dangerouslySetInnerHTML` 渲染。 |
| 预估工作量 | N/A |

#### F-B3 【P2】依赖安全

| 属性 | 内容 |
|------|------|
| 证据 | `package.json` 使用 `next@^15.1.4`, `@supabase/supabase-js@^2.90.1`, `stripe@^17.7.0` 等 |
| 建议 | 运行 `pnpm audit` / `npm audit`，定期更新并修复已知漏洞。 |
| 预估工作量 | S |

---

### C. 后端审计

#### F-C1 【P1】`checkin_ticket` RPC 不校验 Staff 权限

| 属性 | 内容 |
|------|------|
| 影响面 | 权限/数据 |
| 证据 | `supabase/migrations/003_rpc.sql` 第 425-433 行：仅检查 `auth.uid()` 非空，未校验 `is_admin()` 或 `venue_id = ANY(my_venue_ids())` |

- **修复建议**：在 RPC 中增加 Staff 校验，例如：
  ```sql
  IF NOT (public.is_admin() OR v_ticket.venue_id = ANY(public.my_venue_ids())) THEN
    RETURN jsonb_build_object('ok', false, 'result', 'NOT_ALLOWED', 'message', '...');
  END IF;
  ```
- **预估工作量**：S

#### F-C2 【P2】无速率限制

| 属性 | 内容 |
|------|------|
| 影响面 | 可用性/成本 |
| 建议 | 对以下接口增加速率限制（如 Upstash Redis / Vercel KV）：登录、邀请码验证、核销、导出、`redeem_invite` 调用。 |
| 预估工作量 | M |

#### F-C3 【P2】Stripe Webhook 签名与幂等

| 属性 | 内容 |
|------|------|
| 结论 | ✅ 已使用 `constructEvent` 校验签名；`stripe_webhook_events` 做幂等；有 event_id 去重 |
| 建议 | 确保 `STRIPE_WEBHOOK_SECRET` 与 Stripe Dashboard 一致，生产禁用测试密钥。 |
| 预估工作量 | N/A |

---

### D. 数据库与 RLS

#### F-D1 【P2】`get_user_emails` 未限制执行角色

| 属性 | 内容 |
|------|------|
| 建议 | 在 migration 中增加 `REVOKE ALL ON FUNCTION public.get_user_emails(uuid[]) FROM public;` 并仅对 service_role 或通过自定义 role 授权。若需 authenticated 调用，必须在 RPC 内部校验 `is_admin()`。 |
| 预估工作量 | S |

#### F-D2 【P1】`checkins_insert_staff` 与 `checkin_ticket` 行为不一致

| 属性 | 内容 |
|------|------|
| 说明 | RLS 要求 `actor_venue_id = ANY(my_venue_ids())`，但 `checkin_ticket` 为 SECURITY DEFINER， bypass RLS；RPC 未做等效校验 |
| 修复建议 | 在 `checkin_ticket` 内加入与 RLS 等效的 venue 权限校验。 |
| 预估工作量 | S |

#### F-D3 【P3】部分表索引

| 属性 | 内容 |
|------|------|
| 建议 | 对 `checkins(ticket_id)`, `tickets(order_id)`, `order_items(order_id)`, `orders(merchant_id)`, `orders(created_at)` 等高频查询确认有索引；可用 `EXPLAIN ANALYZE` 验证。 |
| 预估工作量 | S |

---

### E. 业务功能完备性

#### F-E1 【P2】导出任务未实现异步执行

| 属性 | 内容 |
|------|------|
| 证据 | `apps/admin-web/app/api/admin/exports/route.ts` 第 143 行：`// TODO: 异步处理导出任务`，当前仅创建记录 |
| 修复建议 | 使用 Supabase Edge Function、Inngest、或队列实现异步导出，避免长时间阻塞请求。 |
| 预估工作量 | L |

#### F-E2 【P2】时间窗口与时区

| 属性 | 内容 |
|------|------|
| 证据 | `REDEEM_EARLY_MINUTES` / `REDEEM_LATE_MINUTES` 已用于核销窗口；`event_weeks.timezone` 用于 V2 票务 |
| 建议 | 确保活动创建、核销、报表统一使用 UTC 存储与正确时区展示；对跨日窗口（如 2pm-2am）做回归测试。 |
| 预估工作量 | M |

---

### F. 测试与质量

#### F-F1 【P2】缺少 E2E 与集成测试

| 属性 | 内容 |
|------|------|
| 建议测试矩阵 | 见下方「建议测试矩阵」。 |
| 预估工作量 | L |

**建议测试矩阵（节选）**：

| 端口 | 用例 | 预期 |
|------|------|------|
| Customer | 匿名访问 /drops | 200 |
| Customer | 未登录访问 /wallet | redirect 或 403 |
| Customer | 登录用户购票流程 | 订单 + 票生成 |
| Customer | POST /api/tickets/[id]/redeem 他人票 | 403（修复后） |
| Internal | Staff 访问 /settings | redirect /scan |
| Internal | Owner 创建邀请码 | 200 |
| Internal | Staff 核销本商户票 | 200 |
| Admin | 非 Admin 访问 /dashboard | redirect /no-access |
| Admin | Admin 导出列表 | 200 |

#### F-F2 【P3】关键 RPC 缺单元测试

| 建议 | 对 `redeem_invite`, `checkin_ticket`, `increment_ticket_type_v2_sold` 做 SQL/PLpgSQL 或 Supabase 本地测试。 |
| 预估工作量 | M |

---

### G. 运维与安全配置

#### F-G1 【P2】存储桶 event-posters 公开读

| 属性 | 内容 |
|------|------|
| 证据 | `supabase/migrations/013_create_event_posters_storage.sql`：`Public can read event posters` |
| 建议 | 确认无敏感文件；路径严格限制为 `merchants/{merchant_id}/events/{event_id}/*`；考虑使用 signed URL 替代公开读。 |
| 预估工作量 | S |

#### F-G2 【P3】开发环境日志

| 属性 | 内容 |
|------|------|
| 证据 | Admin middleware 等有 `NODE_ENV === 'development'` 的 `console.log` |
| 建议 | 生产环境关闭或改为结构化日志（如 Pino），避免敏感信息进入日志。 |
| 预估工作量 | S |

#### F-G3 【P2】环境变量与密钥

| 属性 | 内容 |
|------|------|
| 结论 | `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` 仅在服务端使用，未发现暴露到客户端。 |
| 建议 | 使用 Vercel/Supabase 等托管环境变量，禁止提交 `.env`。 |
| 预估工作量 | N/A |

---

## 4. Risk Matrix

| 严重度 / 概率 | 高 | 中 | 低 |
|---------------|----|----|-----|
| **严重** | F-A1 票务 IDOR, F-A2 get_user_emails | F-C1 checkin 权限 | - |
| **高** | F-A3 Admin API 保护 | F-A4 Staff API 校验, F-D2 RLS/RPC 一致性 | F-E1 导出异步 |
| **中** | F-B1 Customer 路由, F-B3 依赖 | F-C2 速率限制, F-D1 RPC GRANT | F-E2 时区 |
| **低** | F-F1 测试覆盖 | F-G1 存储桶, F-G2 日志 | F-B2 XSS, F-D3 索引 |

---

## 5. Remediation Plan

### 5.1 本周必须完成（P0）

| 序号 | 项目 | 负责人建议 | 工作量 |
|------|------|------------|--------|
| 1 | 下线或修复 `POST /api/tickets/[id]/redeem`（F-A1） | 后端 | S |
| 2 | `get_user_emails` RPC 增加 `is_admin()` 校验 + GRANT 限制（F-A2） | DB | S |

### 5.2 本月完成（P1）

| 序号 | 项目 | 负责人建议 | 工作量 |
|------|------|------------|--------|
| 3 | `checkin_ticket` RPC 增加 Staff/venue 权限校验（F-C1/F-D2） | DB | S |
| 4 | Admin `/api/admin/*` 统一保护或 requireAdmin 审计（F-A3） | 前端+后端 | M |

### 5.3 可延期（P2/P3）

| 序号 | 项目 | 负责人建议 | 工作量 |
|------|------|------------|--------|
| 5 | 登录/核销/导出 等接口速率限制（F-C2） | 后端 | M |
| 6 | Customer 需登录路由保护（F-B1） | 前端 | S |
| 7 | 导出任务异步执行（F-E1） | 后端 | L |
| 8 | E2E 关键路径测试（F-F1） | QA | L |
| 9 | event-posters 存储策略收紧（F-G1） | DB | S |
| 10 | `pnpm audit` 修复 + 依赖升级（F-B3） | 全栈 | S |

---

## 6. Verification Checklist

### 6.1 票务 IDOR 修复验证

```bash
# 1. 确认 /api/tickets/[id]/redeem 已移除或加校验
curl -X POST https://<customer-host>/api/tickets/<other-user-ticket-uuid>/redeem \
  -H "Cookie: sb-..." \
  # 预期：404（若删除）或 403（若加校验）
```

### 6.2 get_user_emails 修复验证

```sql
-- 以非 Admin 的 authenticated 角色调用
SELECT * FROM get_user_emails(ARRAY['<some-user-uuid>']::uuid[]);
-- 预期：ERROR 或 0 行
```

### 6.3 checkin_ticket 修复验证

```sql
-- 以非 Staff 用户调用
SELECT checkin_ticket('<ticket-uuid>'::uuid, 'ENTRY');
-- 预期：{"ok": false, "result": "NOT_ALLOWED", ...}
```

### 6.4 手动回归

- [ ] Admin：非 Admin 账号访问 /dashboard → 跳转 /no-access  
- [ ] Internal：Staff 访问 /settings → 跳转 /scan  
- [ ] Customer：登录用户购票 → 订单 + 票生成 → 核销（仅 token 方式）  
- [ ] Stripe Webhook：测试环境触发 `checkout.session.completed` → 订单 fulfilled，票生成  

### 6.5 自动化（建议）

```bash
pnpm audit
pnpm build
# 后续：pnpm test / pnpm test:e2e
```

---

## 7. 附录：关键文件索引

| 类别 | 路径 |
|------|------|
| Admin middleware | `apps/admin-web/middleware.ts` |
| Internal middleware | `apps/internal-web/middleware.ts` |
| Customer middleware | `apps/customer-web/middleware.ts` |
| 票务核销 API (token) | `apps/customer-web/app/api/tickets/redeem/route.ts` |
| 票务核销 API (id) ⚠️ | `apps/customer-web/app/api/tickets/[id]/redeem/route.ts` |
| Stripe Webhook | `apps/customer-web/app/api/stripe/webhook/route.ts` |
| RPC: checkin_ticket | `supabase/migrations/003_rpc.sql` |
| RPC: get_user_emails | `supabase/migrations/20260218000000_admin_get_user_emails_rpc.sql` |
| RLS 主策略 | `supabase/migrations/002_rls.sql` |
| 存储桶策略 | `supabase/migrations/013_create_event_posters_storage.sql` |

---

*报告结束。所有结论均基于代码库扫描，修复实施前建议在测试环境验证。*
