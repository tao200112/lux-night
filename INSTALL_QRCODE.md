# 安装 QR Code 依赖（快速修复）

## 问题

项目需要 `qrcode` 包，但 `pnpm` 未安装。

## 解决方案（2 选 1）

### 方案 A：使用 npm（推荐，最快）

```bash
# 1. 进入 internal-web 目录
cd apps/internal-web

# 2. 安装 qrcode 包
npm install qrcode @types/qrcode

# 3. 返回 root 目录
cd ../..
```

### 方案 B：安装 pnpm（与项目配置一致）

```powershell
# 1. 全局安装 pnpm
npm install -g pnpm

# 2. 验证安装
pnpm --version

# 3. 安装所有依赖
pnpm install
```

---

## 验证安装

```bash
cd apps/internal-web
npm list qrcode
# 或
pnpm list qrcode
```

**预期输出**：
```
internal-web@x.x.x
└── qrcode@x.x.x
```

---

## 然后继续

### 方案 1：使用远程 Supabase（推荐，跳过 Docker）

```bash
# 1. 连接到远程项目
npx supabase link --project-ref YOUR_PROJECT_REF

# 2. 推送迁移
npx supabase db push

# 3. 启动服务
cd apps/internal-web
npm run dev
```

### 方案 2：使用本地 Supabase（需要 Docker Desktop）

```bash
# 1. 启动 Docker Desktop（必须先安装并运行）

# 2. 启动本地 Supabase
npx supabase start

# 3. 重置数据库
npx supabase db reset

# 4. 启动服务
cd apps/internal-web
npm run dev
```

---

**状态**: ✅ Ready to Install
