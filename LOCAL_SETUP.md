# 本地部署指南

## 🚀 快速开始

### 步骤 1: 安装依赖

如果还没有安装依赖，运行：

```bash
npm install
```

### 步骤 2: 配置环境变量

创建 `.env.local` 文件（从 `.env.example` 复制）：

```bash
# Windows PowerShell
Copy-Item .env.example .env.local

# 或者手动创建 .env.local 文件
```

然后在 `.env.local` 中填入你的实际配置：

```env
# Supabase 配置（从 Supabase Dashboard → Settings → API 获取）
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Stripe 配置（从 Stripe Dashboard → Developers → API keys 获取）
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**重要提示：**
- `SUPABASE_SERVICE_ROLE_KEY` 用于 webhook 和后台操作（**不要暴露到前端**）
- `STRIPE_WEBHOOK_SECRET` 需要先在 Stripe Dashboard 中创建 Webhook 端点
- 所有 `NEXT_PUBLIC_*` 变量会在前端代码中暴露，确保使用测试密钥

### 步骤 3: 运行数据库迁移

在运行应用之前，确保已经运行了数据库迁移（见 `MIGRATION_INSTRUCTIONS.md`）：

1. 打开 Supabase Dashboard → SQL Editor
2. 按顺序运行三个迁移文件：
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_policies.sql`
   - `supabase/migrations/003_rpc_functions.sql`

### 步骤 4: 启动开发服务器

```bash
npm run dev
```

应用将在 `http://localhost:3000` 启动。

---

## 📝 环境变量获取指南

### Supabase 配置

1. 访问 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **Settings** → **API**
4. 复制以下值：
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`（⚠️ 保密）

### Stripe 配置

1. 访问 [Stripe Dashboard](https://dashboard.stripe.com)
2. 切换到 **Test mode**（开发环境）
3. 进入 **Developers** → **API keys**
4. 复制以下值：
   - **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - **Secret key** → `STRIPE_SECRET_KEY`

### Stripe Webhook 配置

1. 在 Stripe Dashboard → **Developers** → **Webhooks**
2. 点击 **Add endpoint**
3. 输入你的 webhook URL：
   - 本地开发：使用 [Stripe CLI](https://stripe.com/docs/stripe-cli) 转发
   - 生产环境：`https://your-domain.com/api/stripe/webhook`
4. 选择事件：`checkout.session.completed`
5. 复制 **Signing secret** → `STRIPE_WEBHOOK_SECRET`

#### 本地测试 Webhook（使用 Stripe CLI）

```bash
# 安装 Stripe CLI（如果还没有）
# Windows: 从 https://github.com/stripe/stripe-cli/releases 下载

# 登录 Stripe
stripe login

# 转发 webhook 到本地服务器
stripe listen --forward-to localhost:3000/api/stripe/webhook

# 复制输出的 webhook signing secret 到 .env.local
```

---

## ✅ 验证部署

### 1. 检查应用是否启动

打开浏览器访问 `http://localhost:3000`，应该能看到应用首页。

### 2. 测试 API 路由

- **健康检查**: `http://localhost:3000/api/regions` （应该返回区域列表或错误）

### 3. 检查控制台

打开浏览器开发者工具（F12），检查：
- 是否有错误信息
- 网络请求是否成功

### 4. 测试数据库连接

1. 尝试注册/登录（如果已实现）
2. 检查 Supabase Dashboard → **Table Editor**，确认数据是否正确写入

---

## 🔧 常见问题

### 问题 1: 端口 3000 已被占用

```bash
# 使用其他端口启动
npm run dev -- -p 3001
```

### 问题 2: 环境变量未生效

- 确保文件名为 `.env.local`（不是 `.env.local.txt`）
- 重启开发服务器（`Ctrl+C` 然后重新运行 `npm run dev`）
- 检查变量名是否正确（注意大小写）

### 问题 3: Supabase 连接失败

- 检查 `NEXT_PUBLIC_SUPABASE_URL` 是否正确
- 检查 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 是否正确
- 检查 Supabase 项目是否已激活
- 检查网络连接

### 问题 4: Stripe 错误

- 确保使用的是 **Test mode** 的密钥（不是 Live mode）
- 检查 `STRIPE_SECRET_KEY` 格式（应以 `sk_test_` 开头）
- 检查 `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` 格式（应以 `pk_test_` 开头）

### 问题 5: TypeScript 错误

```bash
# 重新生成类型定义
npm run build
```

---

## 📦 生产环境部署

### 构建生产版本

```bash
# 构建
npm run build

# 启动生产服务器
npm start
```

### 环境变量配置

在生产环境（Vercel、Netlify 等）中：

1. 进入项目设置 → **Environment Variables**
2. 添加所有 `.env.local` 中的变量
3. 确保 `NEXT_PUBLIC_*` 变量已添加到构建环境

---

## 🎯 下一步

1. ✅ 配置环境变量
2. ✅ 运行数据库迁移
3. ✅ 启动开发服务器
4. 📝 测试核心功能：
   - 区域选择
   - 活动浏览
   - 票务购买流程
   - 票务兑换

---

## 📚 相关文档

- [Next.js 文档](https://nextjs.org/docs)
- [Supabase 文档](https://supabase.com/docs)
- [Stripe 文档](https://stripe.com/docs)
- [迁移指南](./MIGRATION_INSTRUCTIONS.md)
