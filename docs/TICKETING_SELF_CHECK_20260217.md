# 票务系统大范围自检报告

**日期**：2026-02-17  
**范围**：M1/M2/M3 全部修复项 + 闭环验证

---

## 一、数据库迁移状态

| Migration | 状态 | 说明 |
|-----------|------|------|
| 20260217100000_atomic_increment_ticket_type_sold | ✅ 已推送 | ticket_types 存在时创建 increment；ambassador_invites increment |
| 20260217110000_add_sold_count_to_ticket_types_v2 | ✅ 已推送 | ticket_types_v2.sold_count + increment_ticket_type_v2_sold RPC |
| 20260217120000_rpc_include_sold_count | ✅ 已推送 | RPC 返回 sold_count 供前端展示剩余库存 |

---

## 二、功能闭环验证

### 2.1 下单 → 支付 → 出票

```
用户选票(events-v2) → 校验剩余量(sold_count)
  → checkout-v2(库存校验 + 幂等键 + order_items.valid_*)
  → Stripe Checkout
  → Webhook checkout.session.completed
  → 生成 tickets + 原子自增 sold_count + invite 原子自增
  → order fulfilled
```

- ✅ 前端：`remaining = inventory_limit - sold_count` 控制 + 按钮
- ✅ checkout-v2：`sold_count` 校验，不足返回 INSUFFICIENT_INVENTORY
- ✅ Webhook：insert tickets → increment_ticket_type_v2_sold
- ✅ order_items：valid_start_at/valid_end_at 快照写入

### 2.2 退款

```
Stripe charge.refunded
  → handleChargeRefunded
  → orders.status = 'refunded'
  → tickets.status = 'refunded' (where order_id, status in active/issued)
```

- ✅ 退款后票不可核销

### 2.3 核销

- ✅ customer-web / internal-web：乐观锁 `.eq('status','active')`
- ✅ 幂等：已核销返回 alreadyRedeemed

### 2.4 其他

- ✅ 幂等键：前端传 idempotencyKey，重复请求返回已有 session
- ✅ Webhook 金额校验：session vs order
- ✅ async_payment 按 version 路由 V2
- ✅ debug complete-order：生产保护 + audit_log + sold_count 自增
- ✅ /api/tickets/public：60/min per IP rate limit

---

## 三、已知限制

1. **ticket_types (Legacy)**：远程库无此表，`increment_ticket_type_sold` 未创建；V1 流程若存在会跳过 sold_count 更新
2. **Rate limit**：内存实现，多实例不共享；生产可升级 Upstash/Redis
3. **Webhook audit**：log_audit 需 auth.uid()，webhook 无用户上下文，未写入 audit_log；stripe_webhook_events 已记录

---

## 四、修改文件清单

- `apps/customer-web/app/api/stripe/webhook/route.ts`
- `apps/customer-web/app/api/public/checkout-v2/route.ts`
- `apps/customer-web/app/api/tickets/public/route.ts`
- `apps/customer-web/app/events-v2/[id]/page.tsx`
- `apps/customer-web/app/checkout/page.tsx`
- `apps/internal-web/app/api/tickets/redeem/route.ts`
- `apps/admin-web/app/api/admin/debug/complete-order/route.ts`
- `supabase/migrations/20260217100000_*.sql`
- `supabase/migrations/20260217110000_*.sql`
- `supabase/migrations/20260217120000_*.sql`
- `docs/TICKETING_RELIABILITY_SECURITY_AUDIT.md`
- `docs/TICKETING_SELF_CHECK_20260217.md`
