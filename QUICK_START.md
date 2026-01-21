# 快速启动指南

## ✅ 检查清单

- [ ] Node.js 已安装（v18+）
- [ ] 依赖已安装（`node_modules` 存在）
- [ ] `.env.local` 文件已配置
- [ ] Supabase 数据库迁移已运行
- [ ] Stripe Webhook 已配置（本地开发可选）

---

## 🚀 一键启动

### 1. 安装依赖（如果还没有）

```bash
npm install
```

### 2. 配置环境变量

创建 `.env.local` 文件，填入以下配置：

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=你的_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的_anon_key
SUPABASE_SERVICE_ROLE_KEY=你的_service_role_key

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_你的_key
STRIPE_SECRET_KEY=sk_test_你的_key
STRIPE_WEBHOOK_SECRET=whsec_你的_secret
```

**获取方式：**
- **Supabase**: Dashboard → Settings → API
- **Stripe**: Dashboard → Developers → API keys (Test mode)

### 3. 运行数据库迁移

在 Supabase Dashboard → SQL Editor 中按顺序运行：
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_rls_policies.sql`
3. `supabase/migrations/003_rpc_functions.sql`

### 4. 启动开发服务器

```bash
npm run dev
```

访问：`http://localhost:3000`

---

## 📋 常用命令

```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 启动生产服务器
npm start

# 代码检查
npm run lint
```

---

## ⚠️ 注意事项

1. **环境变量**：`.env.local` 不会被提交到 Git，需要手动创建
2. **数据库迁移**：首次运行必须执行迁移，否则 API 会报错
3. **Stripe Webhook**：本地开发可以使用 Stripe CLI 转发

---

## 🔧 问题排查

### 端口被占用

```bash
npm run dev -- -p 3001
```

### 环境变量未生效

- 检查文件名是否为 `.env.local`
- 重启开发服务器

### 查看详细日志

打开浏览器开发者工具（F12）查看控制台和网络请求。
