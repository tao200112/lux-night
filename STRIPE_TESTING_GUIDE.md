# Stripe 支付测试指南

## 📋 测试前准备

### 1. 环境检查

- [ ] Stripe 测试账号已配置
- [ ] 环境变量已设置（`.env.local` 或 Vercel）
- [ ] 数据库 migration 已运行（`stripe_webhook_events` 表）
- [ ] 本地开发服务器正在运行（如本地测试）
- [ ] Stripe CLI 正在运行（如本地测试）

### 2. 数据库 Migration

运行以下命令应用 migration：

```bash
# 本地 Supabase
cd supabase
supabase db push

# 或直接执行 SQL
psql -h localhost -p 54322 -U postgres -d postgres -f migrations/20260124000000_add_stripe_webhook_events.sql
```

---

## 🧪 端到端测试流程

### 测试 1: 创建 Checkout Session

#### 步骤

1. **登录应用**（customer-web）
2. **选择区域**（如果未选择）
3. **浏览活动**，选择一个已发布的活动
4. **选择票种和数量**
5. **点击 "Checkout" 或 "Buy Tickets"**

#### 预期结果

- ✅ API 返回 `{ success: true, data: { sessionId: "cs_..." } }`
- ✅ 自动跳转到 Stripe Checkout 页面
- ✅ 数据库 `orders` 表创建新记录：
  - `status = 'pending_payment'`
  - `stripe_checkout_session_id = 'cs_...'`
  - `amount_cents` 正确计算

#### 验证 SQL

```sql
SELECT 
  id, 
  status, 
  amount_cents, 
  stripe_checkout_session_id,
  created_at
FROM orders 
ORDER BY created_at DESC 
LIMIT 1;
```

---

### 测试 2: 完成支付（使用测试卡）

#### 步骤

1. **在 Stripe Checkout 页面**输入测试卡信息：
   - **卡号**: `4242 4242 4242 4242`
   - **过期日期**: `12/34`（任何未来日期）
   - **CVC**: `123`（任意 3 位数）
   - **邮编**: `12345`（任意 5 位数）
2. **点击 "Pay"**
3. **等待支付完成并重定向**

#### 预期结果

- ✅ 支付成功，重定向到 `/wallet?session_id=cs_...`
- ✅ Webhook 事件被触发（`checkout.session.completed`）
- ✅ 数据库更新：
  - `orders.status = 'fulfilled'`
  - `orders.stripe_payment_intent_id` 已设置
  - `orders.stripe_customer_id` 已设置（如果有）
  - `tickets` 表生成对应数量的票务记录
  - `ticket_types.sold_count` 已更新

#### 验证 SQL

```sql
-- 检查订单状态
SELECT 
  id, 
  status, 
  stripe_checkout_session_id,
  stripe_payment_intent_id,
  stripe_customer_id
FROM orders 
WHERE id = '<order_id>';

-- 检查生成的票务
SELECT 
  id, 
  order_id, 
  ticket_type_id, 
  status,
  qr_seed
FROM tickets 
WHERE order_id = '<order_id>';

-- 检查库存更新
SELECT 
  id, 
  name, 
  sold_count, 
  inventory_limit
FROM ticket_types 
WHERE id IN (
  SELECT ticket_type_id 
  FROM order_items 
  WHERE order_id = '<order_id>'
);
```

---

### 测试 3: Webhook 事件记录和幂等性

#### 步骤

1. **完成一次支付**（测试 2）
2. **在 Stripe Dashboard** → **Webhooks** → **Recent events**
3. **找到 `checkout.session.completed` 事件**
4. **点击 "Send test webhook"**（重放事件）

#### 预期结果

- ✅ Webhook 被接收
- ✅ 事件记录到 `stripe_webhook_events` 表
- ✅ 幂等性检查生效：返回 `{ received: true, message: 'Already processed' }`
- ✅ 订单状态**不会**重复更新
- ✅ 票务**不会**重复生成

#### 验证 SQL

```sql
-- 检查 webhook 事件记录
SELECT 
  event_id, 
  event_type, 
  processed, 
  processed_at,
  order_id,
  error_message
FROM stripe_webhook_events 
WHERE event_id = '<stripe_event_id>';

-- 确认订单状态未重复更新（应该只有一次 fulfilled）
SELECT 
  id, 
  status, 
  updated_at
FROM orders 
WHERE id = '<order_id>';
```

---

### 测试 4: 支付失败处理

#### 步骤

1. **创建 Checkout Session**（测试 1）
2. **在 Stripe Checkout 页面**使用失败测试卡：
   - **卡号**: `4000 0000 0000 0002`（支付失败）
   - **过期日期**: `12/34`
   - **CVC**: `123`
   - **邮编**: `12345`
3. **尝试支付**

#### 预期结果

- ✅ 支付失败，显示错误信息
- ✅ 可以取消并返回活动页面
- ✅ 订单状态保持 `pending_payment`（不会更新为 `paid`）
- ✅ 不会生成票务

#### 验证 SQL

```sql
SELECT 
  id, 
  status, 
  stripe_checkout_session_id
FROM orders 
WHERE id = '<order_id>';
-- status 应该是 'pending_payment'
```

---

### 测试 5: 支付失败 Webhook（可选）

#### 步骤

1. **在 Stripe Dashboard** → **Webhooks** → **Send test webhook**
2. **选择事件**: `payment_intent.payment_failed`
3. **发送测试 webhook**

#### 预期结果

- ✅ Webhook 被接收和处理
- ✅ 订单状态更新为 `expired`（如果状态是 `pending_payment`）
- ✅ 事件记录到 `stripe_webhook_events` 表

#### 验证 SQL

```sql
SELECT 
  id, status 
FROM orders 
WHERE stripe_payment_intent_id = '<payment_intent_id>';
-- status 应该是 'expired'
```

---

### 测试 6: 退款处理（可选）

#### 步骤

1. **完成一次支付**（测试 2）
2. **在 Stripe Dashboard** → **Payments** → 找到支付记录
3. **点击 "Refund"**
4. **确认退款**

#### 预期结果

- ✅ `charge.refunded` 事件被触发
- ✅ Webhook 处理事件
- ✅ 订单状态更新为 `refunded`
- ✅ 事件记录到 `stripe_webhook_events` 表

#### 验证 SQL

```sql
SELECT 
  id, 
  status 
FROM orders 
WHERE stripe_payment_intent_id = '<payment_intent_id>';
-- status 应该是 'refunded'
```

---

## 🔍 调试和排错

### 查看 Webhook 事件日志

#### Stripe Dashboard

1. 进入 **Developers** → **Webhooks**
2. 点击你的 webhook 端点
3. 查看 **Recent events** 列表
4. 点击事件查看详情（请求/响应）

#### 应用日志

**本地开发**：
```bash
# 查看终端输出
# 应该看到类似：
[STRIPE WEBHOOK] Received event: checkout.session.completed (evt_xxx)
[STRIPE WEBHOOK] Successfully processed checkout.session.completed (evt_xxx) in 123ms
```

**Vercel**：
1. 进入 Vercel Dashboard → **Deployments**
2. 点击最新部署
3. 查看 **Functions** → **Logs**

#### 数据库日志

```sql
-- 查看所有 webhook 事件
SELECT 
  event_id, 
  event_type, 
  processed, 
  processed_at,
  order_id,
  error_message,
  created_at
FROM stripe_webhook_events 
ORDER BY created_at DESC 
LIMIT 20;

-- 查看失败的事件
SELECT 
  event_id, 
  event_type, 
  error_message,
  raw_event->>'data' as event_data
FROM stripe_webhook_events 
WHERE processed = false 
  OR error_message IS NOT NULL
ORDER BY created_at DESC;
```

---

### 常见问题排查

#### 问题 1: Webhook 未收到

**检查清单**：
1. ✅ Webhook 端点 URL 正确（Stripe Dashboard）
2. ✅ 服务器正在运行（本地）或已部署（Vercel）
3. ✅ 事件已选中（Stripe Dashboard → Webhooks → 端点详情）
4. ✅ 网络连接正常

**调试方法**：
- 在 Stripe Dashboard 查看事件日志
- 检查服务器日志（Vercel Logs 或本地终端）
- 使用 Stripe CLI 测试：`stripe trigger checkout.session.completed`

---

#### 问题 2: 签名验证失败

**错误信息**：
```
Webhook signature verification failed: ...
```

**可能原因**：
1. `STRIPE_WEBHOOK_SECRET` 不正确
2. 使用了错误的 webhook secret（测试 vs 生产）
3. 代码使用了 `req.json()` 而不是 `req.text()`

**解决方案**：
1. 确认 `STRIPE_WEBHOOK_SECRET` 来自正确的 webhook 端点
2. 确认环境变量已正确设置并重启服务器
3. 确认 webhook route 使用 `req.text()` 获取原始 body

---

#### 问题 3: 订单状态未更新

**检查清单**：
1. ✅ Webhook 事件已成功处理（Stripe Dashboard）
2. ✅ `client_reference_id` 在创建 session 时已设置
3. ✅ 数据库连接正常（使用 `SUPABASE_SERVICE_ROLE_KEY`）
4. ✅ 订单 ID 存在（在 Supabase 查询）

**调试方法**：
1. 查看服务器日志（查找错误信息）
2. 在 Supabase 查询订单状态
3. 检查 `stripe_webhook_events` 表中的错误信息

---

#### 问题 4: 票务未生成

**检查清单**：
1. ✅ 订单状态已更新为 `paid` 或 `fulfilled`
2. ✅ `order_items` 表有数据
3. ✅ `ticket_types` 表数据正确
4. ✅ `events` 表有对应的 `venue_id`

**调试方法**：
1. 查看服务器日志（查找错误信息）
2. 检查 `stripe_webhook_events` 表中的错误信息
3. 在 Supabase 查询相关表数据

---

#### 问题 5: 幂等性测试失败

**检查清单**：
1. ✅ `stripe_webhook_events` 表已创建
2. ✅ 事件记录到表中
3. ✅ `processed` 字段正确更新

**调试方法**：
```sql
-- 检查事件是否重复处理
SELECT 
  event_id, 
  COUNT(*) as count
FROM stripe_webhook_events 
GROUP BY event_id 
HAVING COUNT(*) > 1;
-- 应该返回空（每个 event_id 只应该有一条记录）

-- 检查已处理的事件
SELECT 
  event_id, 
  event_type, 
  processed, 
  processed_at
FROM stripe_webhook_events 
WHERE processed = true 
ORDER BY processed_at DESC 
LIMIT 10;
```

---

## ✅ 测试完成检查清单

### 功能测试
- [ ] 创建 Checkout Session 成功
- [ ] 支付成功（测试卡 `4242 4242 4242 4242`）
- [ ] 订单状态正确更新（`pending_payment` → `paid` → `fulfilled`）
- [ ] 票务正确生成
- [ ] 库存正确更新（`sold_count`）
- [ ] Webhook 事件正确记录
- [ ] 幂等性测试通过（重放事件不重复处理）

### 错误处理测试
- [ ] 支付失败处理正确（订单状态不更新）
- [ ] 支付失败 Webhook 处理正确（订单状态更新为 `expired`）
- [ ] 退款处理正确（订单状态更新为 `refunded`）

### 数据完整性测试
- [ ] `orders` 表字段正确填充（`stripe_payment_intent_id`, `stripe_customer_id` 等）
- [ ] `stripe_webhook_events` 表正确记录所有事件
- [ ] 没有重复的票务生成
- [ ] 没有重复的订单状态更新

---

## 📚 相关资源

- [Stripe 测试卡](https://stripe.com/docs/testing)
- [Stripe Webhooks 文档](https://stripe.com/docs/webhooks)
- [Stripe CLI 文档](https://stripe.com/docs/stripe-cli)
