# Monorepo 迁移完成

## ✅ 已完成的工作

### 1. 文件迁移
- ✅ Customer Web 核心文件已迁移到 `apps/customer-web/`
- ✅ Internal Web 核心文件已迁移到 `apps/internal-web/`
- ✅ 共享文件已迁移到 `packages/shared/`
- ✅ 依赖已安装

### 2. 项目结构
```
lux-night/
├── apps/
│   ├── customer-web/     # 顾客端应用
│   │   ├── app/          # Next.js App Router
│   │   ├── lib/          # 应用特定逻辑
│   │   └── components/   # UI 组件
│   └── internal-web/     # 商家端应用
│       ├── app/          # Next.js App Router
│       ├── lib/          # 应用特定逻辑
│       └── middleware.ts # 路由保护
├── packages/
│   └── shared/           # 共享代码
│       └── src/
│           ├── supabase/ # Supabase 客户端（支持 cookie 隔离）
│           ├── types.ts  # 共享类型
│           └── constants.ts # 共享常量
└── package.json          # 根 package.json（workspace 配置）
```

### 3. 关键配置

#### Cookie 隔离
- Customer Web 使用 `sb-customer-*` cookie 前缀
- Internal Web 使用 `sb-internal-*` cookie 前缀
- 两个应用可以在同一浏览器中同时使用，不会互相影响

#### OAuth 回调
- Customer Web: `http://localhost:3000/auth/callback`
- Internal Web: `http://localhost:3001/auth/callback`

#### 运行命令
```bash
# 启动顾客端（端口 3000）
pnpm dev:customer

# 启动商家端（端口 3001）
pnpm dev:internal

# 同时启动两个应用（需要分别开两个终端）
```

## ⚠️ 待修复的问题

### 1. Import 路径修复
需要将以下路径从旧结构迁移到新结构：

#### Customer Web
- `@/lib/data/profile` → 可能需要改为使用 `@lux-night/shared/data/profile`
- `@/lib/data/regions` → 可能需要改为使用 `@lux-night/shared/data/regions`
- 其他 `@/lib/` 引用需要检查是否指向正确的路径

#### Internal Web
- `@/lib/internal/*` → 应该已经正确，但需要验证
- `@/lib/data/internal/*` → 应该已经正确，但需要验证

### 2. 环境变量配置
每个应用需要独立的 `.env.local`：

#### Customer Web (`.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_key
```

#### Internal Web (`.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3001
```

### 3. Supabase Redirect URLs 配置
在 Supabase Dashboard -> Authentication -> URL Configuration 添加：

**本地开发:**
- `http://localhost:3000/auth/callback`
- `http://localhost:3001/auth/callback`

**生产环境:**
- `https://app.example.com/auth/callback` (Customer)
- `https://internal.example.com/auth/callback` (Internal)

## 🔧 修复步骤

### 1. 批量修复 Import 路径
使用代码编辑器全局搜索替换：
- 搜索: `from '@/lib/data/profile'`
- 替换: `from '@lux-night/shared/data/profile'` (如果在 shared 中)
- 或者保留 `from '@/lib/data/profile'` (如果文件已经迁移到应用内)

### 2. 测试启动
```bash
# 测试 Customer Web
cd apps/customer-web
pnpm dev

# 测试 Internal Web
cd apps/internal-web
pnpm dev
```

### 3. 验证功能
- [ ] Customer Web 登录功能
- [ ] Internal Web 登录功能
- [ ] OAuth 回调正确重定向
- [ ] Cookie 隔离（两个应用同时使用）
- [ ] Internal Web Invite Gate（无 merchant_members 时跳转到 /invite）

## 📝 注意事项

1. **共享代码**: `packages/shared` 中的代码可以被两个应用使用，但每个应用的特定逻辑应该在各自的 `lib/` 目录中

2. **Middleware**: Internal Web 的 `middleware.ts` 实现了 Invite Gate，确保无 `merchant_members` 的用户无法访问内部功能

3. **类型定义**: 共享类型在 `packages/shared/src/types.ts`，两个应用都可以导入使用

4. **Supabase 客户端**: 使用 `packages/shared` 中的客户端，通过 `appType` 参数区分不同应用的 cookie 前缀

## 🚀 下一步

1. 修复所有 import 路径错误
2. 配置环境变量
3. 在 Supabase Dashboard 配置 Redirect URLs
4. 测试登录和回调流程
5. 验证两个应用的功能是否正常
