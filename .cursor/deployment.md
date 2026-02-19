# Lux Night 部署说明

Vercel + Supabase 部署规范与流程。

---

## 一、Vercel 部署说明

### 项目结构

本 monorepo 包含多应用：

- `apps/customer-web` - 客户端（主站）
- `apps/internal-web` - 内部运营
- `apps/admin-web` - 管理后台

### 部署方式

**方式一：Vercel 根目录配置**

在 Vercel 项目中设置 Root Directory 为对应 app，例如：

- 项目 `lux-night-customer` → Root: `apps/customer-web`
- 项目 `lux-night-internal` → Root: `apps/internal-web`
- 项目 `lux-night-admin` → Root: `apps/admin-web`

**方式二：CLI 部署**

```bash
# 预览部署
vercel apps/customer-web -y

# 生产部署（显式请求时）
vercel apps/customer-web --prod -y
```

**Build 命令**（通常自动识别）：

- `pnpm run build` 或 `pnpm build`
- 若需指定 workspace：`pnpm --filter customer-web build`

**Output Directory**：`apps/<app>/.next`（Next.js 默认）

---

## 二、环境变量规范

### 命名约定

- 使用 `UPPER_SNAKE_CASE`
- 生产：`NEXT_PUBLIC_*` 用于客户端
- 服务端：不带 `NEXT_PUBLIC_` 的变量不暴露给前端

### 必须变量（示例）

| 变量名 | 用途 | 预发/生产 |
|--------|------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | 区分 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名 Key | 区分 |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端 Supabase 调用 | 仅服务端，不暴露 |
| `STRIPE_SECRET_KEY` | Stripe 服务端 | 区分 |
| `STRIPE_WEBHOOK_SECRET` | Webhook 验证 | 区分 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 前端 Stripe | 区分 |

### 环境区分

- **Preview**：使用 Vercel Preview 环境变量，或 `*.preview.*` 配置
- **Production**：使用 Production 环境变量
- 建议：Preview 使用测试用 Supabase 项目 / Stripe 测试模式

---

## 三、生产与预发区分

| 项目 | 环境 | Supabase | Stripe |
|------|------|----------|--------|
| 预发 | Preview | 开发/测试项目 | 测试模式 |
| 生产 | Production | 生产项目 | Live 模式 |

- 预发部署：每次 PR 或 push 到非 main 分支
- 生产部署：merge 到 main 或手动触发

---

## 四、自动回滚策略建议

### 1. Vercel 原生能力

- **Instant Rollback**：在 Vercel 控制台选择前一版本，一键回滚
- 建议在重要发布后保留最近 3–5 个 Production 部署

### 2. Git 回滚

```bash
git revert <bad-commit>
git push origin main
```

Vercel 会基于新 commit 自动部署，达到回滚效果。

### 3. 部署前检查

- 预发环境完整走一遍关键流程
- 检查 Vercel 部署日志无报错
- 数据库迁移在可逆的前提下执行

### 4. 迁移回滚

- Supabase 迁移尽量设计为可逆（提供 down 或回滚脚本）
- 重大 schema 变更前做好备份或快照

---

## 五、部署检查清单

- [ ] 环境变量已在 Vercel 正确配置（含 Preview/Production）
- [ ] Build 命令与 Output 目录正确
- [ ] 预发部署已验证
- [ ] 数据库迁移已执行（如需要）
- [ ] Stripe Webhook 指向正确环境
- [ ] 已知如何通过 Vercel 控制台进行 Instant Rollback
