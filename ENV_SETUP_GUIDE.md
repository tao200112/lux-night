# 环境变量配置指南

## ✅ 已创建环境变量文件

已为你创建了以下环境变量模板文件：

1. `apps/customer-web/.env.local`
2. `apps/internal-web/.env.local`

## 🔧 配置步骤

### 1. 获取 Supabase 配置

#### 方式一：从 Supabase Dashboard 获取（推荐）

1. 访问 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **Settings** → **API**
4. 复制以下值：
   - **Project URL** → 用于 `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → 用于 `NEXT_PUBLIC_SUPABASE_ANON_KEY`

#### 方式二：使用本地 Supabase（如果有）

如果你使用本地 Supabase CLI，运行：
```bash
npx supabase status
```

会显示：
- API URL: `http://127.0.0.1:54321` → 用于 `NEXT_PUBLIC_SUPABASE_URL`
- anon key: `<key>` → 用于 `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. 编辑环境变量文件

#### Customer Web (`apps/customer-web/.env.local`)

打开文件并填入实际值：
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# App Configuration
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000

# Stripe Configuration (可选)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

#### Internal Web (`apps/internal-web/.env.local`)

打开文件并填入实际值：
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# App Configuration
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3001
```

### 3. 配置 Supabase Redirect URLs

在 Supabase Dashboard → Authentication → URL Configuration 添加：

**Additional Redirect URLs:**
```
http://localhost:3000/auth/callback
http://localhost:3001/auth/callback
```

**生产环境（可选）:**
```
https://app.example.com/auth/callback
https://internal.example.com/auth/callback
```

### 4. 重启开发服务器

配置环境变量后，需要重启开发服务器：

```bash
# 停止当前服务器 (Ctrl+C)

# 启动 Customer Web (端口 3000)
pnpm dev:customer

# 启动 Internal Web (端口 3001) - 需要另一个终端
pnpm dev:internal
```

## 🚀 快速部署命令

配置完环境变量后，运行：

```bash
# 启动 Customer Web
cd apps/customer-web
pnpm dev

# 启动 Internal Web (另一个终端)
cd apps/internal-web
pnpm dev
```

或使用根目录命令：

```bash
# 启动 Customer Web
pnpm dev:customer

# 启动 Internal Web (另一个终端)
pnpm dev:internal
```

## ✅ 验证配置

### 1. 检查环境变量

确保 `.env.local` 文件存在且已填入实际值：
```bash
# Windows PowerShell
Get-Content apps\customer-web\.env.local
Get-Content apps\internal-web\.env.local
```

### 2. 测试启动

启动开发服务器后，访问：
- Customer Web: http://localhost:3000
- Internal Web: http://localhost:3001

### 3. 测试登录

1. 访问 http://localhost:3000
2. 点击 "Continue with Google"
3. 完成 OAuth 登录
4. 应该重定向回 Customer Web

## ⚠️ 常见问题

### Q: 环境变量未生效

**A:** 
1. 确保 `.env.local` 文件在正确的目录（`apps/customer-web/` 或 `apps/internal-web/`）
2. 重启开发服务器
3. 检查变量名是否正确（必须以 `NEXT_PUBLIC_` 开头才能在客户端使用）

### Q: OAuth 回调失败

**A:**
1. 检查 Supabase Dashboard 中的 Redirect URLs 配置
2. 确保 `NEXT_PUBLIC_APP_ORIGIN` 与你的实际 URL 一致
3. 确保回调 URL 格式正确：`{ORIGIN}/auth/callback`

### Q: 端口被占用

**A:**
```bash
# Windows - 查看端口占用
netstat -ano | findstr :3000
netstat -ano | findstr :3001

# 停止进程
taskkill /PID <PID> /F
```

## 📝 下一步

1. ✅ 创建 `.env.local` 文件
2. ⬜ 填入实际的 Supabase 配置
3. ⬜ 配置 Supabase Redirect URLs
4. ⬜ 启动开发服务器
5. ⬜ 测试登录流程
