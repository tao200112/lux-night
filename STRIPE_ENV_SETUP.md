# Stripe 环境变量配置指南

## 环境变量清单

### 必需的环境变量（Stripe 功能启用时）

在 `.env.local` 文件中添加以下变量：

```env
# Stripe Secret Key (服务器端)
# 从 Stripe Dashboard → Developers → API keys → Secret key 获取
STRIPE_SECRET_KEY=sk_test_...

# Stripe Publishable Key (客户端)
# 从 Stripe Dashboard → Developers → API keys → Publishable key 获取
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Stripe Webhook Secret
# 从 Stripe Dashboard → Developers → Webhooks → 选择你的 webhook → Signing secret 获取
STRIPE_WEBHOOK_SECRET=whsec_...

# App URL (用于 Stripe Checkout 回调)
# 本地开发：http://localhost:3000
# 生产环境：https://your-domain.com
APP_URL=http://localhost:3000
```

## 配置步骤

### 1. 获取 Stripe API Keys

1. 访问 [Stripe Dashboard](https://dashboard.stripe.com/)
2. 进入 **Developers** → **API keys**
3. 复制以下密钥：
   - **Secret key** → `STRIPE_SECRET_KEY`
   - **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

**注意**：
- 测试环境使用 `sk_test_...` 和 `pk_test_...`
- 生产环境使用 `sk_live_...` 和 `pk_live_...`

### 2. 配置 Stripe Webhook

1. 在 Stripe Dashboard 中，进入 **Developers** → **Webhooks**
2. 点击 **Add endpoint**
3. 设置 Endpoint URL：
   - 本地开发：使用 Stripe CLI 转发（见下方）
   - 生产环境：`https://your-domain.com/api/stripe/webhook`
4. 选择要监听的事件：
   - `checkout.session.completed` ✅（必需）
5. 复制 **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### 3. 本地开发 Webhook 设置（可选）

使用 Stripe CLI 转发 webhook 到本地：

```bash
# 安装 Stripe CLI
# macOS: brew install stripe/stripe-cli/stripe
# Windows: 从 https://github.com/stripe/stripe-cli/releases 下载

# 登录 Stripe
stripe login

# 转发 webhook 到本地
stripe listen --forward-to localhost:3000/api/stripe/webhook

# 复制输出的 webhook signing secret 到 .env.local
```

### 4. 验证配置

配置完成后，重启开发服务器：

```bash
npm run dev:customer
```

**验证方法**：
1. 打开应用，尝试购买票
2. 如果 Stripe 未配置，会显示明确的错误提示："Stripe payment is not configured"
3. 如果已配置，会跳转到 Stripe Checkout 页面

## 未配置 Stripe 时的行为

如果未配置 Stripe 环境变量：

- ✅ **应用可以正常启动**（不会崩溃）
- ✅ **其他功能正常工作**（浏览活动、查看详情等）
- ✅ **购买按钮会显示明确的错误提示**："Stripe payment is not configured"
- ✅ **API 返回 503 状态码**，错误码：`STRIPE_NOT_CONFIGURED`

## 启用 Stripe 后的流程

1. **用户选择票种和数量**
2. **点击购买** → 调用 `/api/checkout/create-session`
3. **创建订单**（状态：`pending_payment`）
4. **创建 Stripe Checkout Session**
5. **跳转到 Stripe Checkout 页面**
6. **用户完成支付**
7. **Stripe 发送 webhook** → `/api/stripe/webhook`
8. **处理 `checkout.session.completed` 事件**：
   - 更新订单状态为 `paid`
   - 生成 tickets（每张票一个二维码 token）
   - 更新 ticket_types 的 sold_count
   - 更新订单状态为 `fulfilled`

## 故障排查

### 问题：应用启动时报错 "STRIPE_SECRET_KEY is not set"

**原因**：旧代码直接抛出错误  
**解决**：已修复，现在未配置时返回 null，应用可以正常启动

### 问题：购买时提示 "Stripe not configured"

**原因**：环境变量未设置或未生效  
**解决**：
1. 检查 `.env.local` 文件是否存在
2. 确认环境变量名称正确
3. 重启开发服务器

### 问题：Webhook 验证失败

**原因**：`STRIPE_WEBHOOK_SECRET` 不正确  
**解决**：
1. 从 Stripe Dashboard 重新复制 webhook signing secret
2. 确保使用正确的 webhook endpoint URL 对应的 secret

### 问题：支付成功但未生成票

**原因**：Webhook 未正确配置或处理失败  
**解决**：
1. 检查 Stripe Dashboard → Webhooks → 查看事件日志
2. 检查服务器日志，查看 webhook 处理错误
3. 确认数据库连接正常

## 安全注意事项

1. **永远不要**将 `STRIPE_SECRET_KEY` 暴露到客户端代码
2. **永远不要**将密钥提交到 Git（`.env.local` 应在 `.gitignore` 中）
3. **生产环境**使用 `sk_live_...` 和 `pk_live_...`（不是 test keys）
4. **定期轮换** webhook secret（如果怀疑泄露）
