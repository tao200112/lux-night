# Stripe Webhook 配置攻略（完整版）

## 📋 目录

1. [Stripe Dashboard 配置](#stripe-dashboard-配置)
2. [环境变量配置](#环境变量配置)
3. [本地开发 Webhook 转发](#本地开发-webhook-转发)
4. [Vercel 环境配置](#vercel-环境配置)
5. [常见问题排查](#常见问题排查)

---

## 🎯 Stripe Dashboard 配置

### 步骤 1: 获取 API Keys

1. 登录 [Stripe Dashboard](https://dashboard.stripe.com/)
2. 切换到 **Test mode**（开发环境）或 **Live mode**（生产环境）
3. 进入 **Developers** → **API keys**
4. 复制以下密钥：
   - **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - **Secret key** → `STRIPE_SECRET_KEY`（点击 "Reveal test key" 查看）

**密钥格式验证**：
- 测试环境：`pk_test_...` / `sk_test_...`
- 生产环境：`pk_live_...` / `sk_live_...`

---

### 步骤 2: 配置 Webhook 端点（生产环境）

#### 2.1 创建 Webhook 端点

1. 进入 **Developers** → **Webhooks**
2. 点击 **Add endpoint**
3. 输入 **Endpoint URL**：
   ```
   https://your-production-domain.com/api/stripe/webhook
   ```
   **注意**：替换 `your-production-domain.com` 为你的实际域名（例如：`customer.lux-night.com`）

#### 2.2 选择要监听的事件

**必需事件**（必须选择）：
- ✅ `checkout.session.completed` - 支付完成

**推荐事件**（建议选择）：
- ✅ `payment_intent.succeeded` - 支付成功（冗余校验）
- ✅ `payment_intent.payment_failed` - 支付失败
- ✅ `checkout.session.async_payment_succeeded` - 异步支付成功
- ✅ `checkout.session.async_payment_failed` - 异步支付失败
- ✅ `charge.refunded` - 退款

**事件选择方法**：
1. 在 "Select events to listen to" 部分
2. 选择 **"Select events"**（不要选择 "Send all events"）
3. 搜索并勾选上述事件
4. 点击 **Add endpoint**

#### 2.3 获取 Webhook Signing Secret

1. 创建端点后，点击端点名称进入详情页
2. 在 **Signing secret** 部分，点击 **"Reveal"**
3. 复制 `whsec_...` 开头的密钥
4. **⚠️ 重要**：这个密钥只会显示一次，请立即保存到环境变量

**⚠️ 注意**：
- 测试环境和生产环境需要**分别创建** webhook 端点
- 每个端点有**独立的** signing secret
- 不要混用测试和生产环境的 secret

---

### 步骤 3: 配置 Webhook 端点（测试环境）

如果需要在测试环境（Vercel Preview）配置：

1. 在 Stripe Dashboard 切换到 **Test mode**
2. 重复步骤 2.1-2.3
3. 使用预览环境的 URL（例如：`https://customer-web-git-main-yourteam.vercel.app/api/stripe/webhook`）
4. 获取测试环境的 `STRIPE_WEBHOOK_SECRET`

---

## 🔑 环境变量配置

### 本地开发环境（`.env.local`）

在 `apps/customer-web/.env.local` 文件中添加：

```env
# ========================================
# Stripe 配置（测试环境）
# ========================================

# Stripe 发布密钥（客户端）
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Stripe 密钥（服务端）
STRIPE_SECRET_KEY=sk_test_...

# Stripe Webhook Secret（本地开发使用 Stripe CLI 生成的）
# 见下方"本地开发 Webhook 转发"部分
STRIPE_WEBHOOK_SECRET=whsec_...

# 应用 URL（用于 Stripe Checkout 回调）
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Vercel 环境变量配置

#### 测试环境（Preview/Development）

在 Vercel Dashboard → Project → Settings → Environment Variables：

| 变量名 | 值 | 环境 |
|--------|-----|------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | Preview, Development |
| `STRIPE_SECRET_KEY` | `sk_test_...` | Preview, Development |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...`（测试环境 webhook secret） | Preview, Development |
| `NEXT_PUBLIC_APP_URL` | `https://your-preview-domain.vercel.app` | Preview, Development |

#### 生产环境（Production）

| 变量名 | 值 | 环境 |
|--------|-----|------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | Production |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Production |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...`（生产环境 webhook secret） | Production |
| `NEXT_PUBLIC_APP_URL` | `https://your-production-domain.com` | Production |

**⚠️ 重要**：
- 测试环境和生产环境使用**不同的** webhook secret
- 确保每个环境的 `STRIPE_WEBHOOK_SECRET` 对应正确的 webhook 端点

---

## 🛠️ 本地开发 Webhook 转发

### 方法 1: 使用 Stripe CLI（推荐）

#### 步骤 1: 安装 Stripe CLI

**Windows**:
```powershell
# 使用 Scoop
scoop install stripe

# 或从 GitHub 下载
# 访问 https://github.com/stripe/stripe-cli/releases
# 下载最新版本的 .exe 文件
```

**macOS**:
```bash
brew install stripe/stripe-cli/stripe
```

**Linux**:
```bash
# 从 GitHub 下载或使用包管理器
wget https://github.com/stripe/stripe-cli/releases/latest/download/stripe_*_linux_x86_64.tar.gz
tar -xzf stripe_*_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin/
```

#### 步骤 2: 登录 Stripe

```bash
stripe login
```

这会打开浏览器让你授权 CLI 访问你的 Stripe 账户。

#### 步骤 3: 启动本地开发服务器

在一个终端窗口运行：

```bash
cd apps/customer-web
npm run dev
# 或
pnpm dev
```

#### 步骤 4: 转发 Webhook 到本地服务器

在**另一个终端窗口**运行：

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

**输出示例**：
```
> Ready! Your webhook signing secret is whsec_xxxxx (^C to quit)
```

#### 步骤 5: 复制 Webhook Signing Secret

复制输出的 `whsec_xxxxx` 到 `.env.local` 的 `STRIPE_WEBHOOK_SECRET`：

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

#### 步骤 6: 重启开发服务器

```bash
# 停止当前服务器（Ctrl+C）
# 重新启动
npm run dev
```

#### 步骤 7: 测试 Webhook（可选）

```bash
# 触发测试事件
stripe trigger checkout.session.completed
```

---

### 方法 2: 使用 ngrok（不推荐，但可选）

1. 安装 [ngrok](https://ngrok.com/download)
2. 启动本地服务器：`npm run dev`
3. 在另一个终端运行：`ngrok http 3000`
4. 复制 ngrok 提供的 URL（例如：`https://xxxx.ngrok.io`）
5. 在 Stripe Dashboard → Webhooks → Add endpoint
6. 输入：`https://xxxx.ngrok.io/api/stripe/webhook`
7. 复制 Signing secret 到 `.env.local`

**⚠️ 注意**：ngrok 免费版每次重启 URL 会变化，需要重新配置。

---

## ☁️ Vercel 环境配置

### 配置步骤

1. **登录 Vercel Dashboard**
   - 访问 [https://vercel.com](https://vercel.com)
   - 选择你的项目

2. **添加环境变量**
   - 进入 **Settings** → **Environment Variables**
   - 按照上方"环境变量配置"表格添加所有变量
   - **重要**：为每个变量选择正确的环境（Preview/Production）

3. **配置 Webhook 端点**
   - 获取 Vercel 部署的 URL
   - 在 Stripe Dashboard 创建对应的 webhook 端点
   - 复制 signing secret 到 Vercel 环境变量

4. **重新部署**
   - 环境变量更新后，需要重新部署才能生效
   - 在 **Deployments** 页面，点击 **Redeploy**

---

## 🐛 常见问题排查

### 问题 1: Webhook 签名验证失败

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

### 问题 2: Webhook 未收到事件

**检查清单**：
1. ✅ Webhook 端点 URL 正确（在 Stripe Dashboard 确认）
2. ✅ 事件已选中（在 Stripe Dashboard → Webhooks → 端点详情 → Events）
3. ✅ 服务器正在运行（本地开发）或已部署（生产环境）
4. ✅ 网络连接正常（防火墙未阻止）

**调试方法**：
1. 在 Stripe Dashboard → Webhooks → 端点详情 → **Recent events** 查看事件日志
2. 查看事件详情，确认状态（succeeded/failed）
3. 如果失败，查看错误信息

---

### 问题 3: 订单状态未更新

**检查清单**：
1. ✅ Webhook 事件已成功处理（在 Stripe Dashboard 确认）
2. ✅ `client_reference_id` 在创建 session 时已设置（等于 `order.id`）
3. ✅ 数据库连接正常（使用 `SUPABASE_SERVICE_ROLE_KEY`）
4. ✅ 订单 ID 存在（在 Supabase 查询 `orders` 表）

**调试方法**：
1. 查看服务器日志（Vercel Logs 或本地终端）
2. 在 Supabase 查询订单状态：
   ```sql
   SELECT id, status, stripe_checkout_session_id 
   FROM orders 
   WHERE id = '<order_id>';
   ```

---

### 问题 4: 本地开发 Webhook 无法接收

**解决方案**：
1. 确认 Stripe CLI 正在运行：`stripe listen --forward-to localhost:3000/api/stripe/webhook`
2. 确认本地服务器正在运行：`npm run dev`
3. 确认端口号正确（默认 3000）
4. 确认 `.env.local` 中的 `STRIPE_WEBHOOK_SECRET` 来自 `stripe listen` 的输出

---

### 问题 5: 环境变量未生效

**解决方案**：
1. 确认环境变量文件路径正确（`apps/customer-web/.env.local`）
2. 确认变量名拼写正确（大小写敏感）
3. 重启开发服务器（环境变量更改后需要重启）
4. 在 Vercel：确认环境变量已保存并重新部署

---

### 问题 6: 测试卡支付失败

**Stripe 测试卡号**：
- **成功支付**：`4242 4242 4242 4242`
- **需要 3D Secure**：`4000 0025 0000 3155`
- **支付失败**：`4000 0000 0000 0002`
- **过期日期**：任何未来日期（例如：`12/34`）
- **CVC**：任意 3 位数（例如：`123`）
- **邮编**：任意 5 位数（例如：`12345`）

**更多测试卡**：见 [Stripe 测试卡文档](https://stripe.com/docs/testing)

---

## ✅ 配置完成检查清单

### 本地开发环境
- [ ] Stripe CLI 已安装并登录
- [ ] `.env.local` 文件已创建并配置所有变量
- [ ] `stripe listen` 正在运行
- [ ] 本地开发服务器正在运行
- [ ] 测试支付流程成功

### Vercel 环境
- [ ] 所有环境变量已添加到 Vercel
- [ ] 环境变量已选择正确的环境（Preview/Production）
- [ ] Webhook 端点已在 Stripe Dashboard 创建
- [ ] Webhook signing secret 已添加到 Vercel 环境变量
- [ ] 项目已重新部署
- [ ] 测试支付流程成功

---

## 📚 相关资源

- [Stripe API 文档](https://stripe.com/docs/api)
- [Stripe Webhooks 文档](https://stripe.com/docs/webhooks)
- [Stripe CLI 文档](https://stripe.com/docs/stripe-cli)
- [Stripe 测试卡](https://stripe.com/docs/testing)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
