# Supabase CLI 配置指南

## ✅ 已完成的配置

- ✅ Supabase CLI 已初始化（使用 npx）
- ✅ `supabase/config.toml` 配置文件已创建
- ✅ `package.json` 已添加 Supabase 命令脚本
- ✅ `.gitignore` 已更新（忽略 `.supabase` 目录）

## 🚀 使用方式

### 方式 1：链接到远程 Supabase 项目（推荐，无需 Docker）

如果你已经有远程 Supabase 项目，可以直接链接：

```bash
# 1. 登录 Supabase
npx supabase login

# 2. 链接到你的项目（需要 Project Reference ID）
npx supabase link --project-ref <your-project-ref>

# 获取 Project Reference ID：
# - 在 Supabase Dashboard 中，进入 Settings → General
# - 复制 "Reference ID"
```

链接后，你可以：

```bash
# 推送本地迁移到远程
npm run supabase:push

# 从远程拉取数据库结构
npm run supabase:pull

# 查看迁移状态
npx supabase migration list
```

### 方式 2：本地开发（需要 Docker Desktop）

#### 步骤 1：安装 Docker Desktop

1. 下载 Docker Desktop for Windows: https://www.docker.com/products/docker-desktop
2. 安装并启动 Docker Desktop
3. 确保 Docker 正在运行（系统托盘图标）

#### 步骤 2：启动本地 Supabase

```bash
# 启动本地 Supabase（首次会下载 Docker 镜像，需要几分钟）
npm run supabase:start

# 启动后会显示：
# - API URL: http://127.0.0.1:54321
# - GraphQL URL: http://127.0.0.1:54321/graphql/v1
# - DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
# - Studio URL: http://127.0.0.1:54323
# - anon key: <your-anon-key>
# - service_role key: <your-service-role-key>
```

#### 步骤 3：配置环境变量（本地开发）

创建或更新 `.env.local`：

```env
# 本地 Supabase（从 supabase start 输出中复制）
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<从启动输出中复制>
SUPABASE_SERVICE_ROLE_KEY=<从启动输出中复制>

# Stripe（测试环境）
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

#### 步骤 4：应用数据库迁移

```bash
# 重置数据库并应用所有迁移
npm run supabase:reset

# 或者只推送迁移（不重置数据）
npm run supabase:push
```

#### 步骤 5：启动 Next.js 开发服务器

```bash
npm run dev
```

访问：
- Next.js 应用: http://localhost:3000
- Supabase Studio: http://127.0.0.1:54323

## 📋 常用命令

```bash
# 查看 Supabase 状态
npm run supabase:status

# 停止本地 Supabase
npm run supabase:stop

# 重置数据库（删除所有数据并重新运行迁移）
npm run supabase:reset

# 推送迁移到远程
npm run supabase:push

# 从远程拉取数据库结构
npm run supabase:pull
```

## 🔧 故障排查

### 问题 1: Docker 未运行

**错误信息**: `error during connect: in the default daemon configuration on Windows`

**解决方案**:
1. 确保 Docker Desktop 已安装并正在运行
2. 检查系统托盘是否有 Docker 图标
3. 如果 Docker Desktop 未运行，启动它

### 问题 2: 端口被占用

**错误信息**: `port is already allocated`

**解决方案**:
- 修改 `supabase/config.toml` 中的端口配置
- 或停止占用端口的其他服务

### 问题 3: 迁移失败

**解决方案**:
```bash
# 查看迁移状态
npx supabase migration list

# 手动修复迁移后，重置数据库
npm run supabase:reset
```

## 🎯 推荐工作流

### 开发新功能时：

1. **创建新迁移**:
   ```bash
   npx supabase migration new <migration_name>
   ```
   这会在 `supabase/migrations/` 下创建新的 SQL 文件

2. **编辑迁移文件**:
   在生成的文件中编写 SQL

3. **测试迁移**:
   ```bash
   npm run supabase:reset  # 本地测试
   ```

4. **推送到远程**:
   ```bash
   npm run supabase:push  # 推送到远程项目
   ```

### 同步远程更改时：

```bash
# 从远程拉取最新的数据库结构
npm run supabase:pull

# 这会生成新的迁移文件，反映远程的更改
```

## 📝 注意事项

1. **不要直接修改数据库结构**：始终通过迁移文件来修改
2. **迁移文件顺序很重要**：文件名中的数字前缀决定了执行顺序
3. **`.supabase` 目录**：包含本地开发数据，已在 `.gitignore` 中忽略
4. **环境变量**：本地开发和远程项目使用不同的环境变量

## 🔗 相关资源

- [Supabase CLI 文档](https://supabase.com/docs/guides/cli)
- [本地开发指南](https://supabase.com/docs/guides/cli/local-development)
- [迁移管理](https://supabase.com/docs/guides/cli/managing-environments)
