# 快速启动指南（不使用 Docker）

## 问题诊断

你遇到的两个问题：
1. ❌ `pnpm` 未安装
2. ❌ `Docker Desktop` 未运行（本地 Supabase 需要）

## 解决方案

### 方案 A：使用 npm 代替 pnpm（最快）

```bash
# 1. 安装依赖
npm install

# 2. 启动 internal-web（使用 npm）
cd apps/internal-web
npm run dev

# 或者从 root 目录
npm run dev:internal
```

**注意**：如果遇到 `workspace:*` 错误，需要先安装 `qrcode` 包：

```bash
cd apps/internal-web
npm install qrcode @types/qrcode
```

---

### 方案 B：安装 pnpm（推荐，与项目一致）

#### Windows PowerShell（管理员权限）

```powershell
# 方法 1: 使用 npm 安装 pnpm（最简单）
npm install -g pnpm

# 方法 2: 使用 PowerShell 脚本（推荐）
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

#### 验证安装

```bash
pnpm --version
```

#### 然后正常使用

```bash
pnpm install
pnpm dev:internal
```

---

### 方案 C：连接到远程 Supabase（跳过 Docker）

如果你只想测试功能，不想安装 Docker，可以直接推送到远程 Supabase：

#### 1. 连接到远程项目

```bash
# 方法 1: 使用项目引用
npx supabase link --project-ref YOUR_PROJECT_REF

# 方法 2: 使用项目 URL
npx supabase link --project-ref YOUR_PROJECT_ID --password YOUR_DB_PASSWORD
```

**如何获取 PROJECT_REF**：
1. 打开 Supabase Dashboard
2. 进入 Project Settings
3. 复制 "Reference ID"

#### 2. 推送迁移到远程

```bash
npx supabase db push
```

**这将执行**：
- `001_schema.sql`
- `002_rls.sql`
- `003_rpc.sql`
- `004_seed.sql`（生成测试邀请码 1461）

#### 3. 更新环境变量

编辑 `apps/internal-web/.env.local`：

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

#### 4. 启动服务

```bash
npm run dev:internal
# 或
cd apps/internal-web && npm run dev
```

---

## Docker Desktop（如果需要本地开发）

如果你想使用本地 Supabase（完全离线、更快的开发体验）：

### 1. 安装 Docker Desktop

**下载**：https://www.docker.com/products/docker-desktop/

**Windows 要求**：
- Windows 10/11 64-bit
- WSL 2 支持
- 4GB+ RAM

### 2. 启动 Docker Desktop

1. 安装完成后启动 Docker Desktop
2. 等待 Docker 完全启动（系统托盘图标变为绿色）
3. 重启终端

### 3. 然后正常使用

```bash
npx supabase start
npx supabase db reset
npx supabase db push
```

---

## 推荐方案

### 快速测试（推荐）

**使用 npm + 远程 Supabase**：

```bash
# 1. 安装依赖（使用 npm）
npm install

# 2. 安装 qrcode 包（如果 workspace 报错）
cd apps/internal-web
npm install qrcode @types/qrcode
cd ../..

# 3. 连接到远程 Supabase
npx supabase link --project-ref YOUR_PROJECT_REF

# 4. 推送迁移
npx supabase db push

# 5. 更新 .env.local（如果还没配置）
# apps/internal-web/.env.local

# 6. 启动服务
npm run dev:internal
```

### 长期开发（推荐）

**安装 pnpm + Docker Desktop**：

```powershell
# 1. 安装 pnpm
npm install -g pnpm

# 2. 安装并启动 Docker Desktop
# 下载: https://www.docker.com/products/docker-desktop/

# 3. 启动本地 Supabase
npx supabase start

# 4. 重置并应用迁移
npx supabase db reset

# 5. 安装依赖并启动
pnpm install
pnpm dev:internal
```

---

## 验证步骤

### 1. 检查依赖安装

```bash
cd apps/internal-web
npm list qrcode
# 应该看到 qrcode@x.x.x
```

### 2. 检查 Supabase 连接

```bash
# 如果是远程
npx supabase status

# 如果是本地（Docker）
npx supabase status
# 应该看到所有服务运行中
```

### 3. 检查数据库迁移

```bash
# 查询测试邀请码是否存在
npx supabase db execute "SELECT token, merchant_id, intended_role FROM invites WHERE token = '1461';"
```

**预期输出**：
```
token | merchant_id | intended_role
------|-------------|---------------
1461  | [uuid]      | owner
```

### 4. 启动服务并测试

```bash
npm run dev:internal
# 打开 http://localhost:3001
```

---

## 常见问题

### Q1: `npm install` 报错 "Unsupported URL Type workspace:*"
**A**: 这是 monorepo workspace 依赖问题。直接安装缺失的包：

```bash
cd apps/internal-web
npm install qrcode @types/qrcode
```

### Q2: `npx supabase link` 要求密码
**A**: 使用 Database Password（不是 API keys）：
1. Supabase Dashboard → Project Settings → Database
2. 复制 "Database Password"

### Q3: 推送迁移时提示 "policy already exists"
**A**: 迁移已幂等化，但如果仍然报错：
1. 在 Supabase Dashboard SQL Editor 执行：`TRUNCATE supabase_migrations.schema_migrations;`
2. 然后重新 `npx supabase db push`

### Q4: Docker Desktop 启动失败
**A**: 检查：
1. Windows 功能中启用了 "Virtualization" 和 "WSL 2"
2. 已安装并启动 WSL 2
3. Docker Desktop 以管理员权限运行

---

## 下一步

选择你的方案后：
1. ✅ 安装依赖（npm 或 pnpm）
2. ✅ 连接到 Supabase（本地或远程）
3. ✅ 推送迁移（生成测试邀请码 1461）
4. ✅ 启动服务（`npm run dev:internal`）
5. ✅ 测试登录流程（Google + 邀请码 1461）

---

**生成时间**: 2026-01-18  
**状态**: ✅ Ready to Start
