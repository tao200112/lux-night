# 本地部署指南

## 📋 前置要求

1. **Node.js** >= 18.0.0
2. **pnpm** >= 8.0.0 (已自动安装，或运行 `npm install -g pnpm`)
3. **Supabase 项目** (已有或创建新项目)

## 🚀 快速开始

### 1. 安装依赖

```bash
# 在项目根目录
npx -y pnpm@latest install
```

### 2. 配置环境变量

#### Customer Web (apps/customer-web/.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-key (可选)
```

#### Internal Web (apps/internal-web/.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3001
```

### 3. 配置 Supabase Redirect URLs

在 Supabase Dashboard -> Authentication -> URL Configuration 添加：

**本地开发:**
- `http://localhost:3000/auth/callback` (Customer)
- `http://localhost:3001/auth/callback` (Internal)

**生产环境:**
- `https://app.example.com/auth/callback` (Customer)
- `https://internal.example.com/auth/callback` (Internal)

### 4. 启动开发服务器

#### 方式一：分别启动（推荐用于开发）

**终端 1 - Customer Web:**
```bash
pnpm dev:customer
# 或
cd apps/customer-web
pnpm dev
```

**终端 2 - Internal Web:**
```bash
pnpm dev:internal
# 或
cd apps/internal-web
pnpm dev
```

#### 方式二：使用根目录命令

```bash
# 只启动 Customer Web
pnpm dev:customer

# 只启动 Internal Web  
pnpm dev:internal
```

### 5. 访问应用

- **Customer Web**: http://localhost:3000
- **Internal Web**: http://localhost:3001

## 🔧 验证部署

### 1. 验证 Customer Web

1. 访问 http://localhost:3000
2. 点击 "Continue with Google" 或 "Continue with Apple"
3. 完成 OAuth 登录
4. 应该重定向回 Customer Web (http://localhost:3000)

### 2. 验证 Internal Web

1. 访问 http://localhost:3001
2. 点击 "Continue with Google" 或 "Continue with Apple"
3. 完成 OAuth 登录
4. 如果没有 `merchant_members`，应该重定向到 `/invite`
5. 如果有 `merchant_members`，应该根据 role 重定向到 `/dashboard` 或 `/scan`

### 3. 验证 Cookie 隔离

1. 在同一个浏览器中同时打开：
   - http://localhost:3000 (Customer Web)
   - http://localhost:3001 (Internal Web)
2. 分别登录两个应用
3. 验证两个应用的 session 互不影响

## 📝 常见问题

### Q: pnpm 命令未找到

**A:** 使用 `npx -y pnpm@latest` 代替 `pnpm`，或全局安装：
```bash
npm install -g pnpm
```

### Q: 端口已被占用

**A:** 修改 `package.json` 中的端口号，或停止占用端口的进程：
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Q: OAuth 回调失败

**A:** 
1. 检查 Supabase Dashboard 中的 Redirect URLs 配置
2. 检查 `.env.local` 中的 `NEXT_PUBLIC_APP_ORIGIN` 是否正确
3. 确保两个应用的 OAuth 回调 URL 都正确配置

### Q: 类型错误

**A:** 确保已安装所有依赖：
```bash
npx -y pnpm@latest install
```

### Q: Internal Web 一直重定向到 /invite

**A:** 这是正常行为。需要在数据库中为用户创建 `merchant_members` 记录，或使用邀请码。

## 🗄️ 数据库迁移

如果需要运行数据库迁移：

```bash
# 如果使用 Supabase CLI (本地)
npx supabase migration up

# 如果使用远程 Supabase
npx supabase db push
```

## 📦 构建生产版本

```bash
# 构建 Customer Web
pnpm build:customer

# 构建 Internal Web
pnpm build:internal

# 构建所有应用
pnpm build
```

## 🎯 下一步

1. ✅ 配置环境变量
2. ✅ 在 Supabase Dashboard 配置 Redirect URLs
3. ✅ 测试登录流程
4. ✅ 验证 Cookie 隔离
5. ⬜ 测试业务功能
6. ⬜ 部署到生产环境
