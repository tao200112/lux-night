# Stripe 支付集成现状盘点

## 📊 现状总览

**支付发生端口**: `customer-web`  
**主要域名/路由**: `apps/customer-web/app/api/checkout/create-session`  
**Webhook 路由**: `apps/customer-web/app/api/stripe/webhook/route.ts`

---

## 🔍 现有 Stripe 集成点

| 文件路径 | 用途 | 状态 |
|---------|------|------|
| `apps/customer-web/lib/stripe/server.ts` | Stripe 服务端客户端初始化 | ✅ 已实现 |
| `apps/customer-web/lib/stripe/client.ts` | Stripe 客户端 SDK 初始化 | ✅ 已实现 |
| `apps/customer-web/app/api/checkout/create-session/route.ts` | 创建 Stripe Checkout Session | ✅ 已实现 |
| `apps/customer-web/app/api/stripe/webhook/route.ts` | Webhook 事件处理 | ⚠️ 需改进 |
| `apps/customer-web/app/checkout/page.tsx` | 前端支付页面 | ✅ 已实现 |

---

## 💳 当前支付流程

### ✅ 已存在的流程

1. **创建订单** → `POST /api/checkout/create-session`
   - 验证用户登录
   - 验证区域和活动
   - 验证库存
   - 创建 `orders` 记录（status: `pending_payment`）
   - 创建 `order_items` 记录
   - 创建 Stripe Checkout Session
   - 更新订单的 `stripe_checkout_session_id`

2. **用户支付** → Stripe Checkout 页面
   - 使用 Stripe 测试卡完成支付
   - 支付成功后重定向到 `/wallet?session_id={CHECKOUT_SESSION_ID}`

3. **Webhook 处理** → `POST /api/stripe/webhook`
   - ✅ 验证签名（使用 `stripe.webhooks.constructEvent()`）
   - ✅ 处理 `checkout.session.completed` 事件
   - ✅ 幂等性检查（基于订单状态）
   - ✅ 更新订单状态为 `paid` → `fulfilled`
   - ✅ 生成 tickets
   - ✅ 更新 `ticket_types.sold_count`

### ⚠️ 需要改进的点

1. **幂等性不够完善**
   - 当前仅基于订单状态检查，未记录 webhook event.id
   - 如果同一个 event.id 重放，可能重复处理

2. **缺少事件记录表**
   - 无法追踪 webhook 事件处理历史
   - 无法调试失败的事件

3. **缺少更多事件处理**
   - 仅处理 `checkout.session.completed`
   - 缺少 `payment_intent.succeeded`、`payment_intent.payment_failed`、`charge.refunded` 等

4. **缺少 Stripe 字段记录**
   - 订单表缺少 `stripe_payment_intent_id`、`stripe_customer_id` 等字段的自动更新
   - 缺少 `customer_email`、`amount_received` 等字段

5. **环境区分不够明确**
   - Webhook secret 需要区分 test/live
   - URL 需要区分本地/预览/生产

---

## 🗄️ Supabase 数据表结构

### ✅ 已存在的表

#### `orders` 表
```sql
CREATE TABLE public.orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  region_id UUID,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,  -- 已存在但未自动更新
  stripe_customer_id TEXT,         -- 已存在但未自动更新
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

#### `order_items` 表
```sql
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL,
  event_id UUID NOT NULL,
  ticket_type_id UUID NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  created_at TIMESTAMPTZ NOT NULL
);
```

#### `tickets` 表
```sql
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL,
  user_id UUID NOT NULL,
  event_id UUID NOT NULL,
  venue_id UUID NOT NULL,
  ticket_type_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  redeem_limit INTEGER NOT NULL DEFAULT 1,
  redeemed_count INTEGER NOT NULL DEFAULT 0,
  qr_seed TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

### ❌ 需要新增的表

#### `stripe_webhook_events` 表（用于幂等性）
```sql
CREATE TABLE public.stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,  -- Stripe event.id
  event_type TEXT NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  order_id UUID REFERENCES public.orders(id),
  error_message TEXT,
  raw_event JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 🔐 环境变量现状

### 当前使用的环境变量

| 变量名 | 用途 | 位置 |
|--------|------|------|
| `STRIPE_SECRET_KEY` | Stripe 服务端密钥 | `apps/customer-web/lib/stripe/server.ts` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe 客户端密钥 | `apps/customer-web/lib/stripe/client.ts` |
| `STRIPE_WEBHOOK_SECRET` | Webhook 签名验证 | `apps/customer-web/app/api/stripe/webhook/route.ts` |

### ⚠️ 问题

1. **缺少环境区分**
   - 没有 `STRIPE_WEBHOOK_SECRET_TEST` vs `STRIPE_WEBHOOK_SECRET_LIVE`
   - 没有根据 Stripe key 类型自动选择

2. **缺少 URL 配置**
   - success_url 和 cancel_url 硬编码在代码中
   - 应该从环境变量读取

---

## 📝 Webhook 事件订阅现状

### ✅ 当前处理的事件

- `checkout.session.completed` - 支付完成

### ❌ 未处理但应该处理的事件

- `payment_intent.succeeded` - 支付成功（冗余校验）
- `payment_intent.payment_failed` - 支付失败
- `checkout.session.async_payment_succeeded` - 异步支付成功
- `checkout.session.async_payment_failed` - 异步支付失败
- `charge.refunded` - 退款

---

## 🐛 已知问题

1. **Webhook 幂等性不完善**
   - 仅基于订单状态，未记录 event.id
   - 同一 event.id 重放可能重复处理

2. **缺少事件追踪**
   - 无法查看 webhook 事件处理历史
   - 调试困难

3. **缺少失败处理**
   - 支付失败时订单状态不会更新
   - 退款时订单状态不会更新

4. **环境配置不清晰**
   - 本地/测试/生产环境 webhook secret 混用
   - URL 硬编码

---

## ✅ 已实现的功能

1. ✅ Stripe Checkout Session 创建
2. ✅ Webhook 签名验证
3. ✅ 订单状态更新（paid → fulfilled）
4. ✅ 票务生成
5. ✅ 库存更新（sold_count）
6. ✅ 错误处理和回滚

---

## 📋 下一步改进计划

1. **添加 `stripe_webhook_events` 表**（SQL migration）
2. **改进 webhook handler**（事件记录、完善幂等性）
3. **添加更多事件处理**（payment_intent、refund 等）
4. **改进环境配置**（区分 test/live、本地/生产）
5. **添加订单字段自动更新**（payment_intent_id、customer_id 等）
6. **完善日志和错误追踪**
