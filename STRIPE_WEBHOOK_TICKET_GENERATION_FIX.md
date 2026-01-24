# Stripe Webhook 票生成修复报告

## 问题描述
- **症状**: Stripe 支付完成后未生成票
- **错误**: Vercel 日志显示 `POST /api/stripe/webhook` 返回 500
- **影响**: 用户支付成功但无法获得票，订单状态未更新为 `fulfilled`

## 修复内容

### 1. 增强结构化日志
在所有关键步骤添加了结构化日志，包含：
- `debugId`: 每个请求的唯一标识符
- `step`: 当前执行步骤
- `eventId`, `eventType`: Stripe 事件信息
- `sessionId`, `paymentIntentId`: 支付会话信息
- `orderId`, `userId`, `eventId`: 订单和用户信息
- `ticketTypeIds`, `quantities`: 票类型和数量
- `error`, `stack`: 错误信息和堆栈跟踪

### 2. 修复幂等性
- **问题**: 如果 `event_id` 已存在但插入时发生 unique constraint 冲突，会抛出错误
- **修复**: 
  - 在 `recordWebhookEvent` 中捕获 unique constraint 错误（code `23505`）
  - 如果冲突，重新查询已存在的记录并返回
  - 如果 `processed=true`，直接返回 200（已处理）
  - 确保同一事件不会重复处理

### 3. 增强错误处理
- 所有错误都包含完整的 `stack` 跟踪
- 每个错误步骤都有独立的日志记录
- 错误信息包含 Supabase 错误代码、详情和提示
- 失败时返回 500 触发 Stripe 重试，但幂等性确保不会重复处理

### 4. 改进票生成逻辑
- **顺序执行**:
  1. 更新订单状态为 `paid`（记录 Stripe payment_intent_id 和 customer_id）
  2. 获取订单项（order_items）
  3. 对每个订单项：
     - 获取票类型信息
     - 验证库存可用性
     - 获取活动信息（venue_id）
     - 生成票对象
     - **更新票类型 sold_count**（在插入票之前）
  4. 批量插入所有票
  5. 更新订单状态为 `fulfilled`
- **错误追踪**: 每步都有独立的日志和错误处理

### 5. 验证 Service Role Client
- 确认所有数据库写入操作使用 `supabaseAdmin`（service role client）
- 添加环境变量检查：如果 `SUPABASE_SERVICE_ROLE_KEY` 不存在，返回 500
- 所有操作绕过 RLS（Row Level Security）

### 6. 增强 Checkout Session Metadata
- 添加 `quantities` 字段到 metadata（格式：`ticketTypeId:quantity,ticketTypeId:quantity`）
- 确保 metadata 包含：
  - `order_id`: 订单 ID
  - `user_id`: 用户 ID
  - `event_id`: 活动 ID
  - `ticket_type_ids`: 票类型 ID 列表（逗号分隔）
  - `quantities`: 数量映射（格式：`ticketTypeId:quantity`）

## 修改的文件

### 1. `apps/customer-web/app/api/stripe/webhook/route.ts`
**主要改动**:
- 增强 `recordWebhookEvent` 函数：处理 unique constraint 冲突
- 增强 `handleCheckoutSessionCompleted` 函数：添加详细日志和错误处理
- 增强主 `POST` handler：添加结构化日志和错误追踪
- 改进票生成流程：按顺序执行，每步都有日志

**关键代码片段**:
```typescript
// 幂等性修复：处理 unique constraint 冲突
if (insertError) {
  if (insertError.code === '23505' || insertError.message?.includes('duplicate key')) {
    // 重新查询已存在的记录
    const { data: existingEventAfterRace } = await supabaseAdmin
      .from('stripe_webhook_events')
      .select('id, processed')
      .eq('event_id', eventId)
      .maybeSingle();
    // ...
  }
}

// 票生成顺序：先更新 sold_count，再插入票
const { error: updateError } = await supabaseAdmin
  .from('ticket_types')
  .update({
    sold_count: newSoldCount,
    updated_at: new Date().toISOString(),
  })
  .eq('id', orderItem.ticket_type_id);

// 然后插入票
const { data: insertedTickets, error: ticketsError } = await supabaseAdmin
  .from('tickets')
  .insert(tickets)
  .select('id');
```

### 2. `apps/customer-web/app/api/checkout/create-session/route.ts`
**主要改动**:
- 在 Stripe checkout session metadata 中添加 `quantities` 字段

**关键代码片段**:
```typescript
metadata: {
  order_id: order.id,
  user_id: user.id,
  event_id: eventId,
  ticket_type_ids: items.map((item: any) => item.ticketTypeId).join(','),
  quantities: items.map((item: any) => `${item.ticketTypeId}:${item.quantity}`).join(','),
},
```

## 验证步骤

### 1. 在 Stripe Dashboard 重放事件

#### 步骤 1: 登录 Stripe Dashboard
1. 访问 https://dashboard.stripe.com
2. 选择正确的环境（Test 或 Live）

#### 步骤 2: 找到失败的 Webhook 事件
1. 导航到 **Developers** > **Webhooks**
2. 点击你的 webhook endpoint（例如：`https://your-app.vercel.app/api/stripe/webhook`）
3. 在 **Events** 标签页中找到失败的 `checkout.session.completed` 事件
4. 点击事件查看详情

#### 步骤 3: 重放事件
1. 在事件详情页面，点击右上角的 **"Replay event"** 按钮
2. 确认重放（Stripe 会重新发送该事件到你的 webhook endpoint）

#### 步骤 4: 验证修复
1. 查看 Vercel 日志，确认 webhook 返回 200（而不是 500）
2. 检查日志中的结构化输出，确认所有步骤都成功：
   - `event.received`
   - `event.recorded`
   - `order.fetched`
   - `order.updated`
   - `order_items.fetched`
   - `ticket_type.fetched`
   - `ticket_type.updated`
   - `tickets.inserted`
   - `order.fulfilled`
   - `event.processed.success`

#### 步骤 5: 验证数据库
在 Supabase 中验证：
1. **orders** 表：
   - 订单状态应为 `fulfilled`
   - `stripe_payment_intent_id` 和 `stripe_customer_id` 应已填充
2. **tickets** 表：
   - 应该有为该订单创建的新票记录
   - 每张票的 `order_id` 应该匹配订单 ID
   - 每张票的 `status` 应为 `active`
3. **ticket_types** 表：
   - `sold_count` 应该已更新（增加的数量 = 订单中的数量）
4. **stripe_webhook_events** 表：
   - 应该有一条记录对应重放的事件
   - `processed` 应为 `true`
   - `processed_at` 应该有时间戳

### 2. 端到端测试（新支付）

#### 步骤 1: 创建测试支付
1. 在 customer-web 中选择一个活动
2. 选择票类型和数量
3. 点击支付，使用 Stripe 测试卡：
   - 卡号: `4242 4242 4242 4242`
   - 过期日期: 任意未来日期（如 `12/34`）
   - CVC: 任意 3 位数字（如 `123`）
   - 邮编: 任意 5 位数字（如 `12345`）

#### 步骤 2: 完成支付
1. 在 Stripe Checkout 页面完成支付
2. 等待重定向到成功页面

#### 步骤 3: 验证结果
1. 检查 Vercel 日志，确认 webhook 处理成功
2. 在 Supabase 验证：
   - 订单状态为 `fulfilled`
   - 票已生成
   - `sold_count` 已更新

### 3. 幂等性测试

#### 步骤 1: 重放同一个事件多次
1. 在 Stripe Dashboard 找到已成功处理的事件
2. 点击 **"Replay event"** 多次（例如 3 次）

#### 步骤 2: 验证幂等性
1. 检查 Vercel 日志：
   - 第一次重放：应该成功处理
   - 后续重放：应该返回 `Already processed`（200）
2. 检查数据库：
   - 票的数量不应该增加（每张票只创建一次）
   - `sold_count` 不应该重复增加
   - `stripe_webhook_events` 表中应该只有一条记录（`processed=true`）

## 日志示例

### 成功处理的日志
```json
{
  "debugId": "webhook-1234567890-abc123",
  "step": "event.received",
  "eventId": "evt_1234567890",
  "eventType": "checkout.session.completed",
  "livemode": false
}
{
  "debugId": "webhook-1234567890-abc123",
  "step": "event.recorded",
  "eventId": "evt_1234567890",
  "eventRecordId": "uuid-...",
  "alreadyProcessed": false
}
{
  "debugId": "webhook-1234567890-abc123",
  "step": "checkout.session.completed.start",
  "eventId": "cs_1234567890",
  "orderId": "order-uuid",
  "userId": "user-uuid",
  "eventId": "event-uuid",
  "ticketTypeIds": ["ticket-type-uuid-1", "ticket-type-uuid-2"],
  "quantities": ["ticket-type-uuid-1:2", "ticket-type-uuid-2:1"],
  "paymentIntentId": "pi_1234567890"
}
{
  "debugId": "webhook-1234567890-abc123",
  "step": "order.fetched",
  "orderId": "order-uuid",
  "userId": "user-uuid",
  "status": "pending_payment"
}
{
  "debugId": "webhook-1234567890-abc123",
  "step": "order.updated",
  "orderId": "order-uuid",
  "status": "paid"
}
{
  "debugId": "webhook-1234567890-abc123",
  "step": "order_items.fetched",
  "orderId": "order-uuid",
  "itemCount": 2,
  "items": [
    { "id": "item-uuid-1", "ticket_type_id": "ticket-type-uuid-1", "quantity": 2 },
    { "id": "item-uuid-2", "ticket_type_id": "ticket-type-uuid-2", "quantity": 1 }
  ]
}
{
  "debugId": "webhook-1234567890-abc123",
  "step": "tickets.inserted",
  "orderId": "order-uuid",
  "ticketCount": 3,
  "ticketIds": ["ticket-uuid-1", "ticket-uuid-2", "ticket-uuid-3"]
}
{
  "debugId": "webhook-1234567890-abc123",
  "step": "order.fulfilled",
  "orderId": "order-uuid"
}
{
  "debugId": "webhook-1234567890-abc123",
  "step": "event.processed.success",
  "eventId": "evt_1234567890",
  "eventType": "checkout.session.completed",
  "orderId": "order-uuid",
  "duration": 1234
}
```

### 已处理事件的日志（幂等性）
```json
{
  "debugId": "webhook-1234567890-abc123",
  "step": "event.recorded",
  "eventId": "evt_1234567890",
  "eventRecordId": "uuid-...",
  "alreadyProcessed": true
}
{
  "debugId": "webhook-1234567890-abc123",
  "step": "event.already_processed",
  "eventId": "evt_1234567890",
  "eventRecordId": "uuid-..."
}
```

### 错误日志示例
```json
{
  "debugId": "webhook-1234567890-abc123",
  "step": "tickets.insert.error",
  "orderId": "order-uuid",
  "ticketCount": 3,
  "error": "Failed to create tickets: ...",
  "code": "23505",
  "details": "...",
  "hint": "...",
  "stack": "Error: Failed to create tickets: ...\n    at ..."
}
```

## 关键改进点总结

1. **幂等性**: 确保同一事件不会重复处理，即使 Stripe 重试多次
2. **可追踪性**: 每个请求都有唯一的 `debugId`，所有日志都包含 `step` 标识
3. **错误处理**: 所有错误都包含完整的堆栈跟踪和 Supabase 错误详情
4. **执行顺序**: 票生成按正确顺序执行（更新 sold_count → 插入票 → 更新订单状态）
5. **Service Role**: 所有数据库写入都使用 service role client，绕过 RLS
6. **Metadata 完整性**: Checkout session metadata 包含所有必需字段，包括数量映射

## 后续建议

1. **监控**: 设置 Vercel 日志告警，当 webhook 返回 500 时通知团队
2. **重试策略**: 考虑实现自定义重试逻辑（虽然 Stripe 会自动重试）
3. **事务**: 如果 Supabase 支持，考虑使用数据库事务确保原子性
4. **测试**: 添加单元测试和集成测试覆盖票生成流程
