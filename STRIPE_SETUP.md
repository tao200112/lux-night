# Stripe 配置完整指南

## 📋 目录

1. [环境变量配置](#环境变量配置)
2. [Stripe Dashboard 配置](#stripe-dashboard-配置)
3. [Webhook 端点配置](#webhook-端点配置)
4. [本地开发测试](#本地开发测试)
5. [代码检查清单](#代码检查清单)

---

## 🔑 环境变量配置

### 1. 创建 `.env.local` 文件

在项目根目录创建 `.env.local` 文件（如果还没有）：

```env
# ========================================
# Stripe 配置
# ========================================

# Stripe 发布密钥（前端使用）
# 格式: pk_test_... 或 pk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here

# Stripe 密钥（服务器端使用，保密）
# 格式: sk_test_... 或 sk_live_...
STRIPE_SECRET_KEY=sk_test_your_secret_key_here

# Stripe Webhook 签名密钥（用于验证 webhook 请求）
# 格式: whsec_... （测试环境）或 whsec_... （生产环境）
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### 2. 获取 Stripe API 密钥

#### 步骤 1: 登录 Stripe Dashboard

访问 [https://dashboard.stripe.com](https://dashboard.stripe.com)

#### 步骤 2: 切换到测试模式（开发环境）

点击右上角的 **"Test mode"** 切换按钮（确保显示 **Test mode**）

#### 步骤 3: 获取 API 密钥

1. 进入 **Developers** → **API keys**
2. 复制以下密钥：
   - **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - **Secret key** → `STRIPE_SECRET_KEY`（点击 **Reveal test key** 查看）

#### 步骤 4: 验证密钥格式

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` 应该以 `pk_test_` 开头（测试模式）
- `STRIPE_SECRET_KEY` 应该以 `sk_test_` 开头（测试模式）

---

## 🌐 Stripe Dashboard 配置

### 1. 配置 Webhook 端点

#### 生产环境配置

1. 进入 **Developers** → **Webhooks**
2. 点击 **Add endpoint**
3. 输入 **Endpoint URL**：
   ```
   https://your-domain.com/api/stripe/webhook
   ```
   替换 `your-domain.com` 为你的实际域名
4. 选择要监听的事件，至少选择：
   - ✅ `checkout.session.completed`（必需）
5. 点击 **Add endpoint**
6. 复制 **Signing secret** → `STRIPE_WEBHOOK_SECRET`
   - 格式：`whsec_...`
   - ⚠️ **注意**：这个密钥只会显示一次，请立即保存

#### 本地开发配置（使用 Stripe CLI）

见下方 [本地开发测试](#本地开发测试) 部分

---

## 🔗 Webhook 端点配置

### Webhook URL 格式

```
生产环境: https://your-domain.com/api/stripe/webhook
本地开发: http://localhost:3000/api/stripe/webhook (使用 Stripe CLI 转发)
```

### 当前代码实现检查

✅ **已实现的功能**：

1. **签名验证**：使用 `stripe.webhooks.constructEvent()` 验证请求签名
2. **事件处理**：处理 `checkout.session.completed` 事件
3. **幂等性**：检查订单状态，防止重复处理
4. **订单更新**：将订单状态从 `pending_payment` 更新为 `paid`
5. **票务生成**：为每个订单项生成票务（tickets）
6. **库存更新**：更新票务类型的 `sold_count`
7. **错误处理**：包含回滚逻辑

### Webhook 代码位置

- **文件**: `app/api/stripe/webhook/route.ts`
- **端点**: `/api/stripe/webhook`
- **方法**: `POST`

---

## 🧪 本地开发测试

### 方法 1: 使用 Stripe CLI（推荐）

#### 步骤 1: 安装 Stripe CLI

**Windows:**
```powershell
# 方法 1: 使用 Scoop
scoop install stripe

# 方法 2: 从 GitHub 下载
# 访问 https://github.com/stripe/stripe-cli/releases
# 下载最新版本的 .exe 文件
```

**macOS:**
```bash
brew install stripe/stripe-cli/stripe
```

**Linux:**
```bash
# 从 GitHub 下载或使用包管理器
```

#### 步骤 2: 登录 Stripe

```bash
stripe login
```

这会打开浏览器让你授权 CLI 访问你的 Stripe 账户。

#### 步骤 3: 启动本地服务器

在一个终端窗口运行：

```bash
npm run dev
```

#### 步骤 4: 转发 Webhook 到本地服务器

在另一个终端窗口运行：

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

#### 步骤 5: 复制 Webhook Signing Secret

`stripe listen` 命令会输出类似以下的内容：

```
> Ready! Your webhook signing secret is whsec_xxxxx
```

**复制这个 `whsec_xxxxx` 到 `.env.local` 的 `STRIPE_WEBHOOK_SECRET`**

#### 步骤 6: 触发测试 Webhook（可选）

```bash
# 触发 checkout.session.completed 事件
stripe trigger checkout.session.completed
```

### 方法 2: 使用 ngrok（不推荐，但可选）

1. 安装 [ngrok](https://ngrok.com/download)
2. 启动本地服务器：`npm run dev`
3. 在另一个终端运行：`ngrok http 3000`
4. 复制 ngrok 提供的 URL（例如：`https://xxxx.ngrok.io`）
5. 在 Stripe Dashboard → Webhooks → Add endpoint
6. 输入：`https://xxxx.ngrok.io/api/stripe/webhook`
7. 复制 Signing secret 到 `.env.local`

---

## ✅ 代码检查清单

### 1. 环境变量验证

确保以下文件已正确配置：

- ✅ `.env.local` 包含所有 Stripe 相关变量
- ✅ `STRIPE_SECRET_KEY` 格式正确（`sk_test_...` 或 `sk_live_...`）
- ✅ `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` 格式正确（`pk_test_...` 或 `pk_live_...`）
- ✅ `STRIPE_WEBHOOK_SECRET` 格式正确（`whsec_...`）

### 2. Webhook 路由验证

检查 `app/api/stripe/webhook/route.ts`：

- ✅ 使用 `req.text()` 获取原始 body（不是 `req.json()`）
- ✅ 验证 `stripe-signature` header
- ✅ 使用 `stripe.webhooks.constructEvent()` 验证签名
- ✅ 处理 `checkout.session.completed` 事件
- ✅ 使用 `client_reference_id` 获取 `order_id`
- ✅ 实现幂等性检查（防止重复处理）
- ✅ 包含错误处理和回滚逻辑

### 3. Checkout Session 创建验证

检查 `app/api/checkout/create-session/route.ts`：

- ✅ 设置 `client_reference_id: order.id`
- ✅ 设置 `metadata.order_id` 和 `metadata.user_id`
- ✅ `success_url` 和 `cancel_url` 正确配置
- ✅ 使用 `price_cents`（分）而不是 `price`（元）

### 4. 数据库验证

确保数据库表结构正确：

- ✅ `orders` 表有 `stripe_checkout_session_id` 字段
- ✅ `orders` 表有 `status` 字段（值为 `pending_payment`, `paid`, `fulfilled`）
- ✅ `tickets` 表结构正确（`qr_seed`, `status`, `redeem_limit` 等）
- ✅ `ticket_types` 表有 `sold_count` 和 `inventory_limit` 字段

---

## 🔍 测试流程

### 1. 测试 Checkout Session 创建

1. 登录应用
2. 选择区域
3. 浏览活动并选择票务
4. 点击 "Checkout"
5. 检查控制台是否显示 `sessionId`
6. 检查数据库 `orders` 表，确认：
   - 订单已创建（`status = 'pending_payment'`）
   - `stripe_checkout_session_id` 已设置

### 2. 测试 Webhook 处理

1. 使用 Stripe 测试卡完成支付：
   - **卡号**: `4242 4242 4242 4242`
   - **过期日期**: 任何未来日期（例如：`12/34`）
   - **CVC**: 任意 3 位数（例如：`123`）
   - **邮编**: 任意 5 位数（例如：`12345`）

2. 支付完成后，检查：

   **Stripe Dashboard:**
   - Webhooks → 查看 webhook 事件日志
   - 确认 `checkout.session.completed` 事件已触发
   - 查看事件详情，确认状态为 `succeeded`

   **应用日志（如果使用 Stripe CLI）:**
   ```bash
   # 查看实时 webhook 事件
   stripe listen --forward-to localhost:3000/api/stripe/webhook --print-json
   ```

   **数据库检查:**
   - `orders` 表：`status` 应该是 `fulfilled`
   - `tickets` 表：应该有为该订单生成的票务记录
   - `ticket_types` 表：`sold_count` 应该已增加

### 3. 测试幂等性

1. 手动触发 webhook 事件（使用 Stripe CLI）：
   ```bash
   stripe trigger checkout.session.completed
   ```
2. 再次触发同一事件
3. 检查日志，应该看到 "Order already processed" 消息
4. 确认数据库没有被重复更新

---

## ⚠️ 常见问题

### 问题 1: Webhook 签名验证失败

**错误信息**:
```
Webhook signature verification failed: ...
```

**解决方案**:
- 确认 `STRIPE_WEBHOOK_SECRET` 正确（从 Stripe Dashboard 或 `stripe listen` 复制）
- 确认使用的是最新的 Signing secret（如果更新了 webhook 端点，需要获取新的 secret）
- 确认代码使用 `req.text()` 而不是 `req.json()` 获取 body

### 问题 2: 订单状态未更新

**检查清单**:
- ✅ Webhook 端点 URL 正确
- ✅ 事件 `checkout.session.completed` 已选中
- ✅ `client_reference_id` 在创建 session 时已设置
- ✅ 数据库连接正常（使用 `SUPABASE_SERVICE_ROLE_KEY`）

### 问题 3: 票务未生成

**检查清单**:
- ✅ 订单状态已更新为 `paid`
- ✅ `order_items` 表有数据
- ✅ `ticket_types` 表数据正确
- ✅ `events` 表有对应的 `venue_id`
- ✅ 检查服务器日志（查看是否有错误信息）

### 问题 4: 本地开发 Webhook 无法接收

**解决方案**:
- 使用 Stripe CLI：`stripe listen --forward-to localhost:3000/api/stripe/webhook`
- 确认本地服务器正在运行（`npm run dev`）
- 确认端口号正确（默认 3000）

---

## 📝 生产环境部署检查

### 部署前检查清单

- [ ] 切换到 **Live mode** 获取生产密钥
- [ ] 更新 `.env.local`（或生产环境变量）中的密钥：
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → `pk_live_...`
  - `STRIPE_SECRET_KEY` → `sk_live_...`
- [ ] 在 Stripe Dashboard → Webhooks 创建生产环境的 webhook 端点
- [ ] 复制生产环境的 `STRIPE_WEBHOOK_SECRET` → `whsec_...`
- [ ] 测试生产环境的支付流程
- [ ] 监控 Stripe Dashboard → Webhooks → 事件日志

### 生产环境 Webhook URL

```
https://your-production-domain.com/api/stripe/webhook
```

---

## 📚 相关文档

- [Stripe API 文档](https://stripe.com/docs/api)
- [Stripe Webhooks 文档](https://stripe.com/docs/webhooks)
- [Stripe CLI 文档](https://stripe.com/docs/stripe-cli)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)

---

## 🔄 当前 Webhook 实现说明

### 已处理的事件

- ✅ `checkout.session.completed` - 支付完成后生成票务

### 可能需要添加的事件（可选）

如果需要更完善的错误处理，可以考虑添加：

- `payment_intent.payment_failed` - 支付失败时更新订单状态
- `checkout.session.async_payment_succeeded` - 异步支付成功
- `checkout.session.async_payment_failed` - 异步支付失败

这些事件可以在未来需要时添加，当前实现已满足基本需求。
