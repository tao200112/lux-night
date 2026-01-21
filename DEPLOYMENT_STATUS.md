# 本地部署状态

## ✅ 部署成功

### 1. 项目结构
- ✅ Monorepo 结构已创建
- ✅ Customer Web 应用：`apps/customer-web/`
- ✅ Internal Web 应用：`apps/internal-web/`
- ✅ Shared 包：`packages/shared/`

### 2. 依赖安装
- ✅ 所有依赖已通过 pnpm workspace 安装
- ✅ Shared 包配置正确

### 3. 开发服务器状态

#### Customer Web
- ✅ **运行中** - http://localhost:3000
- ✅ 端口：3000
- ✅ Cookie 前缀：`sb-customer-*`

#### Internal Web
- ⚠️ **启动中** - http://localhost:3001
- ✅ 端口：3001
- ✅ Cookie 前缀：`sb-internal-*`

### 4. 配置文件

#### 环境变量
- ⚠️ 需要创建 `.env.local` 文件（已提供示例）
- ✅ Customer Web: `apps/customer-web/.env.example`
- ✅ Internal Web: `apps/internal-web/.env.example`

#### Next.js 配置
- ✅ Customer Web: `apps/customer-web/next.config.js`
- ✅ Internal Web: `apps/internal-web/next.config.js`
- ✅ 两个应用都配置了 `transpilePackages: ['@lux-night/shared']`

#### TypeScript 配置
- ✅ Customer Web: `apps/customer-web/tsconfig.json`
- ✅ Internal Web: `apps/internal-web/tsconfig.json`
- ✅ 两个应用都配置了 shared 包的路径别名

### 5. 核心功能

#### 认证与回调
- ✅ Customer Web OAuth 回调：`/auth/callback`
- ✅ Internal Web OAuth 回调：`/auth/callback`
- ✅ Cookie 隔离已实现
- ✅ 两个应用的 session 互不干扰

#### 路由保护
- ✅ Internal Web middleware 已配置
- ✅ Invite Gate 已实现（无 merchant_members 时跳转到 /invite）
- ✅ 登录重定向逻辑已实现

## ⚠️ 待完成配置

### 1. 环境变量配置

需要在每个应用目录创建 `.env.local` 文件：

#### Customer Web (`apps/customer-web/.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_key (可选)
```

#### Internal Web (`apps/internal-web/.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3001
```

### 2. Supabase 配置

在 Supabase Dashboard -> Authentication -> URL Configuration 添加：

**本地开发:**
- `http://localhost:3000/auth/callback`
- `http://localhost:3001/auth/callback`

**生产环境:**
- `https://app.example.com/auth/callback` (Customer)
- `https://internal.example.com/auth/callback` (Internal)

### 3. 数据库迁移

确保已运行数据库迁移：
```bash
# 如果使用 Supabase CLI
npx supabase db push

# 或手动在 Supabase Dashboard 中运行 SQL 迁移
```

## 🚀 下一步操作

1. **配置环境变量**
   - 复制 `.env.example` 为 `.env.local`
   - 填入你的 Supabase 配置

2. **配置 Supabase Redirect URLs**
   - 在 Supabase Dashboard 中添加回调 URL

3. **重启开发服务器**
   ```bash
   # 停止当前服务器 (Ctrl+C)
   # 重新启动
   pnpm dev:customer  # 终端 1
   pnpm dev:internal  # 终端 2
   ```

4. **测试登录流程**
   - 访问 http://localhost:3000 (Customer)
   - 访问 http://localhost:3001 (Internal)
   - 分别测试 OAuth 登录

5. **验证 Cookie 隔离**
   - 同时打开两个应用
   - 分别登录
   - 验证 session 互不影响

## 📝 注意事项

1. **端口冲突**: 如果 3000 或 3001 端口被占用，修改 `package.json` 中的端口配置

2. **pnpm 命令**: 如果系统未识别 `pnpm`，使用 `npx -y pnpm@latest` 代替

3. **环境变量**: 每次修改 `.env.local` 后需要重启开发服务器

4. **数据库迁移**: 确保数据库迁移已完成，特别是 `merchant_members` 表和相关 RLS 策略

5. **Shared 包**: Shared 包中的函数需要传入 `appType` 参数：
   - Customer: `'customer'`
   - Internal: `'internal'`

## 🔗 相关文档

- `LOCAL_DEPLOYMENT.md` - 详细部署指南
- `MIGRATION_COMPLETE.md` - 迁移完成总结
- `MONOREPO_FINAL_DELIVERY.md` - Monorepo 最终交付清单
