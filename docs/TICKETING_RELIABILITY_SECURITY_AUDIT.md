# 票务系统可靠性与安全体检报告

**审计日期**：2026-02-17  
**技术栈**：Next.js (App Router) + Supabase + Stripe  
**范围**：订单/票务/支付/核销/RLS/Webhook  

**M1 修复完成**：2026-02-17  
- ✅ #1 退款时 tickets 置为 refunded  
- ✅ #6 internal-web redeem 乐观锁  
- ✅ #10 Webhook 金额校验  
- ✅ #14 async_payment 按 version 路由 V2  
- ✅ #7 debug complete-order 生产保护  

**M2 修复完成**：2026-02-17  
- ✅ #4 order_items 写入 valid_start_at/valid_end_at 快照  
- ✅ #5 Checkout 幂等键  
- ✅ #3 V1 sold_count 原子更新（RPC）  
- ✅ #12 Webhook 可重试错误不标 processed  
- ✅ #15 invite increments 原子化（RPC）  

**M3 修复完成**：2026-02-17  
- ✅ #2 ticket_types_v2 增加 sold_count + Checkout 库存校验 + Webhook 原子自增  
- ✅ #13 debug complete-order 写 audit_log  
- ✅ #8 /api/tickets/public rate limit（60/min per IP）

---

## 一、架构快速识别

### 1.1 Next.js 路由结构

| 路径 | 用途 |
|------|------|
| `apps/customer-web/app/api/public/checkout-v2/route.ts` | 主 Checkout 创建 Stripe Session (V2) |
| `apps/customer-web/app/api/checkout/create-session/route.ts` | 旧版 Checkout (Legacy) |
| `apps/customer-web/app/api/stripe/webhook/route.ts` | Stripe Webhook 处理 |
| `apps/customer-web/app/api/tickets/public/route.ts` | 公开查票（按 token） |
| `apps/customer-web/app/api/tickets/redeem/route.ts` | 核销（customer-web） |
| `apps/internal-web/app/api/tickets/redeem/route.ts` | 核销（internal-web） |
| `apps/admin-web/app/api/admin/debug/complete-order/route.ts` | 手动完成订单（调试） |

### 1.2 Supabase Schema / RLS

| 表 | RLS | 关键 Policy |
|----|-----|-------------|
| `orders` | ✅ | `orders_read_own`, `orders_insert_own`, `orders_update_own` |
| `order_items` | ✅ | `order_items_read_own_order`, `order_items_insert_own_order` |
| `tickets` | ✅ | `tickets_read_own`, `tickets_insert_system`, `tickets_update_system` (admin/venue) |
| `ticket_types_v2` | ✅ | admin/internal/customer select |
| `stripe_webhook_events` | ✅ | service_role insert/update, admin read |
| `ticket_types` (Legacy) | ✅ | 有 sold_count |

**RLS 文件**：`supabase/migrations/002_rls.sql`, `034_event_week_ticketing_v2.sql`

### 1.3 Stripe 集成点

| 文件 | 功能 |
|------|------|
| `apps/customer-web/app/api/stripe/webhook/route.ts` | checkout.session.completed, payment_intent.*, charge.refunded |
| `apps/customer-web/app/api/public/checkout-v2/route.ts` | 创建 Checkout Session |
| `apps/admin-web/lib/stripe/event-week-sync.ts` | 同步 ticket_types_v2 → Stripe Price |
| `lib/stripe/server.ts` | Stripe 客户端 |

### 1.4 Webhook 处理

- **幂等**：`stripe_webhook_events` 表 + `event_id` UNIQUE，`recordWebhookEvent()` 检查已处理
- **顺序**：先查 tickets 是否存在 (order_id)，存在则跳过
- **重试**：失败返回 500，Stripe 会重试

### 1.5 订单 / 票 / 验票逻辑

- **订单状态**：`created` → `pending_payment` → `paid` → `fulfilled`（或 `expired` / `refunded`）
- **票生成**：Webhook `checkout.session.completed` 中插入 tickets
- **验票**：`/api/tickets/redeem` 按 `public_token` 查找，校验 valid_start_at/valid_end_at、redeem_limit、status

---

## 二、Top 15 风险（按严重度）

### 1. 支付与票务一致性：退款后票未作废

| 项目 | 内容 |
|------|------|
| **现状证据** | `apps/customer-web/app/api/stripe/webhook/route.ts` L1066-1091 `handleChargeRefunded()` 仅更新 `orders.status = 'refunded'`，**未更新 tickets.status** |
| **影响** | 退款后票仍为 `active`，可能被核销入场 |
| **修复方案** | 在 `handleChargeRefunded` 中：根据 order_id 将对应 tickets 的 status 更新为 `refunded` |
| **预估范围** | 小 |

---

### 2. V2 无库存约束，存在超卖风险

| 项目 | 内容 |
|------|------|
| **现状证据** | `supabase/migrations/034_event_week_ticketing_v2.sql`：`ticket_types_v2` 无 `sold_count`；`apps/customer-web/app/api/public/checkout-v2/route.ts` 无 inventory 检查；Webhook V2 注释 "v2 doesn't track sold_count" (L421-422) |
| **影响** | 限量票种可无限售出 |
| **修复方案** | ① 为 `ticket_types_v2` 增加 `sold_count` 列；② Checkout 时用 `COUNT(tickets)` 或 `sold_count` 校验库存；③ Webhook 中原子递增 sold_count |
| **预估范围** | 大 |

---

### 3. V1 sold_count 非原子更新，可能超卖

| 项目 | 内容 |
|------|------|
| **现状证据** | `apps/customer-web/app/api/stripe/webhook/route.ts` L860-898：先 `SELECT sold_count` 再 `UPDATE sold_count = old + quantity`，非原子 |
| **影响** | 并发 Webhook 导致 sold_count 偏小，超卖 |
| **修复方案** | 使用 `UPDATE ticket_types SET sold_count = sold_count + $quantity WHERE id = $id AND (inventory_limit IS NULL OR sold_count + $quantity <= inventory_limit) RETURNING *` 或等价 RPC |
| **预估范围** | 中 |

---

### 4. order_items 未写入 validity 快照，Webhook 依赖动态计算

| 项目 | 内容 |
|------|------|
| **现状证据** | `checkout-v2` L256-271：order_items 只写 `event_week_day_id`，**未写 valid_start_at/valid_end_at**；Webhook L298-344 在无快照时调用 `calculate_day_validity_window` RPC |
| **影响** | 活动配置在 Checkout 与 Webhook 之间变更时，票的有效期可能不一致 |
| **修复方案** | ① 在 week API 返回的 days 中已有 valid_start_at/valid_end_at；② 前端传给 checkout-v2；③ checkout-v2 写入 order_items.valid_start_at, valid_end_at |
| **预估范围** | 中 |

---

### 5. Checkout 订单创建无幂等键，易重复下单

| 项目 | 内容 |
|------|------|
| **现状证据** | `checkout-v2` L218：`orderIdempotencyKey = \`${user.id}-${eventId}-${Date.now()}\``，每次不同；`001_schema.sql` L277 有 `uq_orders_idempotency` 但 key 从不重复 |
| **影响** | 用户快速多次点击可产生多笔订单、多次跳转 Stripe |
| **修复方案** | 使用前端生成的幂等键（如 UUID）或「user+event+当前 session/时间窗口」在 DB 做唯一约束，重复请求返回已有 order |
| **预估范围** | 中 |

---

### 6. 核销 update 竞态：internal-web 未用乐观锁

| 项目 | 内容 |
|------|------|
| **现状证据** | `customer-web` redeem L195：`.eq('status','active')` 乐观锁；`internal-web` redeem L132-144：`.eq('id', ticket.id)` 无 status 条件 |
| **影响** | 同一票被并发核销时，internal 可能重复计入 redeemed_count |
| **修复方案** | internal-web 的 update 增加 `.eq('status','active')` 或在 WHERE 中加入 `redeemed_count < redeem_limit` |
| **预估范围** | 小 |

---

### 7. Debug 接口可绕过支付完成订单

| 项目 | 内容 |
|------|------|
| **现状证据** | `apps/admin-web/app/api/admin/debug/complete-order/route.ts`：Admin 可直接为 pending 订单生成票并设为 fulfilled，无需支付 |
| **影响** | 若路由泄露或被滥用，可免费出票 |
| **修复方案** | ① 生产环境禁用或加 IP/权限限制；② 仅允许在明确 debug 模式下使用；③ 写 audit_log |
| **预估范围** | 小 |

---

### 8. /api/tickets/public 无认证与限流

| 项目 | 内容 |
|------|------|
| **现状证据** | `apps/customer-web/app/api/tickets/public/route.ts`：无 auth，按 `token` 查询；token 为 40 字符 hex，枚举不可行，但接口可被暴力试探 |
| **影响** | 可被滥用做枚举/爬虫，增加 DB 负载 |
| **修复方案** | ① 加 rate limit（如 60/min per IP）；② 考虑短期 signed token 代替长期 public_token |
| **预估范围** | 小 |

---

### 9. QR/Token 无防伪校验

| 项目 | 内容 |
|------|------|
| **现状证据** | `tickets` 有 `qr_seed` 和 `public_token`；核销和公开查询均只用 `public_token`；`qr_seed` 仅在部分 UI 生成 QR，未参与服务端校验 |
| **影响** | 若有人获取 public_token（截图/泄露），可伪造二维码入场；qr_seed 未用于服务端验证，防伪不足 |
| **修复方案** | ① 核销时可增加签名校验（如 HMAC(qr_seed, timestamp)）；② 或保持 public_token 足够随机（当前 40 字符已较安全）并加强传输安全 |
| **预估范围** | 中 |

---

### 10. 支付与订单金额未校验

| 项目 | 内容 |
|------|------|
| **现状证据** | Webhook 未比对 `session.amount_total` 与 `orders.amount_cents`；Checkout 用 `ticketType.stripe_price_id` 计价，若 Stripe 价格被改则可能不一致 |
| **影响** | 价格配置错误时，可能出现金额与订单不符 |
| **修复方案** | Webhook 中校验 `session.amount_total` 与 order 的 amount_cents（允许小误差） |
| **预估范围** | 小 |

---

### 11. RLS：tickets 的 INSERT policy 允许用户插入

| 项目 | 内容 |
|------|------|
| **现状证据** | `002_rls.sql` L511-515：`tickets_insert_system` 的 WITH CHECK 为 `user_id = auth.uid() OR public.is_admin()` |
| **影响** | 理论上用户可插入 ticket（若通过 anon/authenticated 直接访问 Supabase），但实际票由 Webhook 用 service_role 插入，RLS 不影响 |
| **修复方案** | 收紧为仅 service_role 或通过 RPC 插入；或确认客户端从不直接写 tickets |
| **预估范围** | 小 |

---

### 12. Webhook 错误处理：部分失败仍标记 processed

| 项目 | 内容 |
|------|------|
| **现状证据** | `webhook/route.ts` L1048-1063：catch 中 `markEventProcessed(event.id, orderId, error.message)`，将失败事件标记为已处理 |
| **影响** | Stripe 不再重试，需人工介入修复 |
| **修复方案** | 仅对「已知可安全跳过」的错误标记 processed；对需重试的保持未处理，返回 500 |
| **预估范围** | 中 |

---

### 13. 订单/票务操作无审计

| 项目 | 内容 |
|------|------|
| **现状证据** | Webhook 完成订单、生成票、退款更新均无 `log_audit`；debug complete-order 无 audit |
| **影响** | 事后难以追溯支付/出票/退款链路 |
| **修复方案** | 关键操作调用 `log_audit`（order fulfilled, tickets created, refunded） |
| **预估范围** | 中 |

---

### 14. async_payment 仅走 V1 逻辑

| 项目 | 内容 |
|------|------|
| **现状证据** | `webhook/route.ts` L1319-1335：`checkout.session.async_payment_succeeded` 调用 `handleCheckoutSessionCompleted`（V1），未根据 metadata.version 路由 |
| **影响** | 若 V2 使用异步支付方式，会按 V1 逻辑处理，可能数据结构不匹配 |
| **修复方案** | 与 checkout.session.completed 一样，根据 `session.metadata?.version === 'v2'` 路由到 V2 handler |
| **预估范围** | 小 |

---

### 15. Checkout 与 Webhook 间 invite 竞态

| 项目 | 内容 |
|------|------|
| **现状证据** | Checkout 校验 invite 未超限，Webhook 再 `uses_count + 1`；两次请求间可能有其他订单消耗同一 invite |
| **影响** | 可能超过 max_uses |
| **修复方案** | Webhook 中采用 `UPDATE ambassador_invites SET uses_count = uses_count + 1 WHERE id = $id AND (max_uses IS NULL OR uses_count < max_uses) RETURNING *`，更新失败则记录告警 |
| **预估范围** | 小 |

---

## 三、分阶段改造路线

### M1（1–2 天）：关键修复

| 序号 | 任务 | 风险 | 文件 |
|------|------|------|------|
| 1 | 退款时将 tickets 置为 refunded | #1 | `webhook/route.ts` |
| 2 | internal-web redeem 加 status 乐观锁 | #6 | `internal-web/.../tickets/redeem/route.ts` |
| 3 | async_payment 按 version 路由到 V2 | #14 | `webhook/route.ts` |
| 4 | Webhook 金额校验 | #10 | `webhook/route.ts` |
| 5 | 生产环境禁用或保护 debug complete-order | #7 | 配置/中间件 |

---

### M2（3–5 天）：一致性增强

| 序号 | 任务 | 风险 | 文件 |
|------|------|------|------|
| 1 | Checkout 写入 order_items.valid_start_at/valid_end_at | #4 | `checkout-v2`, week API, events 页面 |
| 2 | Checkout 幂等键：前端传 key，DB 去重 | #5 | `checkout-v2`, schema |
| 3 | V1 sold_count 原子更新（RPC 或 raw SQL） | #3 | `webhook/route.ts`, migrations |
| 4 | Webhook 错误处理：可重试的不标记 processed | #12 | `webhook/route.ts` |
| 5 | invite  increments 原子化 | #15 | `webhook/route.ts` |

---

### M3（1–2 周）：库存与审计

| 序号 | 任务 | 风险 | 文件 |
|------|------|------|------|
| 1 | ticket_types_v2 增加 sold_count，Checkout+Webhook 支持 | #2 | migrations, checkout-v2, webhook |
| 2 | 订单/票务/退款关键操作写 audit_log | #13 | webhook, debug |
| 3 | /api/tickets/public rate limit | #8 | middleware 或 API |
| 4 | QR 防伪（可选）：核销校验签名 | #9 | tickets/redeem |
| 5 | tickets INSERT RLS 收紧（可选） | #11 | 002_rls 或新 migration |

---

## 四、快速参考：关键路径

```
用户选票 → checkout-v2 (创建 order + order_items + Stripe Session)
         → Stripe 支付
         → Webhook checkout.session.completed
         → 生成 tickets，更新 order status
         → 用户查看 /api/tickets/public?token=...
         → Staff 核销 /api/tickets/redeem { token }
```

**数据库关键约束**：

- `orders.idempotency_key` UNIQUE (有但未有效利用)
- `stripe_webhook_events.event_id` UNIQUE
- `tickets.public_token` UNIQUE
