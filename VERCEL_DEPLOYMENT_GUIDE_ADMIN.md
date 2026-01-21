# Vercel 部署指南 - Admin Web

**应用**: `apps/admin-web`  
**端口**: 3002 (本地开发)  
**生产域名**: `https://admin-app.vercel.app` (示例)

---

## 1. 在 Vercel 创建项目

### 步骤 1: 导入项目

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 **Add New** → **Project**
3. 选择你的 GitHub/GitLab/Bitbucket 仓库
4. 选择 **Import**

### 步骤 2: 配置项目设置

**项目名称**: `lux-night-admin-web` (或你喜欢的名称)

**Framework Preset**: `Next.js` (自动检测)

**Root Directory**: `apps/admin-web`

**Build and Output Settings**:
- **Build Command**: `cd ../.. && pnpm --filter admin-web build`
- **Install Command**: `cd ../.. && pnpm install`
- **Output Directory**: `.next` (Next.js 默认)
- **Development Command**: `cd ../.. && pnpm --filter admin-web dev`

**Node.js Version**: `18.x` 或 `20.x` (推荐 20.x)

---

## 2. 环境变量配置

### Production 环境变量

在 Vercel Dashboard → Project Settings → Environment Variables 添加：

```env
# Supabase 配置（必须）
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# App 配置（必须）
NEXT_PUBLIC_APP_ORIGIN=https://admin-app.vercel.app
```

### Preview 环境变量

Preview 环境通常使用相同的环境变量，但 `NEXT_PUBLIC_APP_ORIGIN` 会使用 Vercel 自动生成的预览 URL。

**建议**: 在 Preview 环境变量中设置：
```env
NEXT_PUBLIC_APP_ORIGIN=$VERCEL_URL
```

这样会自动使用 Vercel 生成的预览 URL。

### Development 环境变量

本地开发使用 `.env.local` 文件（不提交到 Git）。

---

## 3. Supabase 配置

### 配置 Redirect URLs

在 Supabase Dashboard → Authentication → URL Configuration:

**Site URL**:
```
https://admin-app.vercel.app
```

**Additional Redirect URLs**:
```
https://admin-app.vercel.app/auth/callback
https://admin-app-*.vercel.app/auth/callback
```

**说明**:
- 第一行是生产环境回调 URL
- 第二行是预览环境回调 URL（通配符匹配所有 preview 分支）

---

## 4. 部署流程

### 首次部署

1. **推送代码到 GitHub**
   ```bash
   git push origin main
   ```

2. **Vercel 自动部署**
   - Vercel 会检测到 push 事件
   - 自动运行构建命令
   - 部署到 Production 环境

3. **验证部署**
   - 访问 `https://admin-app.vercel.app`
   - 测试 OAuth 登录流程
   - 验证 Admin 权限检查
   - 验证 API routes 正常工作

### Preview 部署

每次推送到非 `main` 分支时，Vercel 会自动创建 Preview 部署：

```bash
git checkout -b feature/new-feature
git push origin feature/new-feature
```

Vercel 会生成类似 `https://admin-app-git-feature-new-feature.vercel.app` 的预览 URL。

---

## 5. 域名配置（可选）

### 添加自定义域名

1. 在 Vercel Dashboard → Project Settings → Domains
2. 点击 **Add Domain**
3. 输入你的域名（例如: `admin.example.com`）
4. 按照提示配置 DNS 记录

### 更新环境变量

添加自定义域名后，更新 `NEXT_PUBLIC_APP_ORIGIN`:
```env
NEXT_PUBLIC_APP_ORIGIN=https://admin.example.com
```

### 更新 Supabase Redirect URLs

在 Supabase Dashboard 添加新的 redirect URL:
```
https://admin.example.com/auth/callback
```

---

## 6. 验证清单

### 部署后验证

- [ ] 应用可以正常访问
- [ ] OAuth 登录流程正常（Google/Apple）
- [ ] 登录后可以正常重定向回应用
- [ ] Admin 权限检查正常（非 admin 用户被重定向到 `/no-access`）
- [ ] API routes 正常工作（`/api/me`, `/api/admin/*`, 等）
- [ ] 静态资源正常加载（CSS, JS, 图片）
- [ ] Cookie 正常设置和读取

### 测试 OAuth 流程

1. 访问 `https://admin-app.vercel.app/login`
2. 点击 "Continue with Google" 或 "Continue with Apple"
3. 完成 OAuth 登录
4. 应该重定向回 `https://admin-app.vercel.app`
5. 验证用户已登录（检查 Cookie 和 session）

### 测试 Admin 权限

1. 使用非 admin 用户登录
2. 应该被重定向到 `/no-access` 页面
3. 使用 admin 用户登录（`profiles.is_admin = true`）
4. 应该可以正常访问管理功能

---

## 7. 故障排查

### 构建失败

**问题**: `pnpm: command not found`

**解决**: 在 Vercel Project Settings → General → Install Command 设置为:
```bash
npm install -g pnpm && cd ../.. && pnpm install
```

---

### OAuth 回调失败

**问题**: 登录后重定向到错误页面

**检查**:
1. Supabase Redirect URLs 是否包含正确的 URL
2. `NEXT_PUBLIC_APP_ORIGIN` 环境变量是否正确
3. Vercel 部署日志中是否有错误

**解决**: 确保 Supabase Dashboard 中的 Redirect URLs 包含:
- 生产 URL: `https://admin-app.vercel.app/auth/callback`
- 预览 URL: `https://admin-app-*.vercel.app/auth/callback`

---

### Admin 权限检查失败

**问题**: Admin 用户无法访问管理功能，或非 admin 用户可以访问

**检查**:
1. Middleware 是否正确执行（检查 Vercel Function Logs）
2. `profiles.is_admin` 字段是否存在
3. `SUPABASE_SERVICE_ROLE_KEY` 是否设置（用于 middleware 查询）
4. RLS 策略是否允许查询（如果使用 anon key）

**解决**: 
- 查看 Vercel Dashboard → Deployments → 选择部署 → Functions → 查看 middleware 日志
- 确保 `SUPABASE_SERVICE_ROLE_KEY` 已正确配置
- 确保数据库迁移已正确执行（`profiles` 表存在 `is_admin` 字段）

---

### Middleware 性能问题

**问题**: 页面加载缓慢，或 middleware 超时

**检查**:
1. Middleware 是否在 Edge Runtime 中执行（应该很快）
2. 是否在 middleware 中进行了大量数据库查询
3. Vercel Function Logs 中是否有超时错误

**解决**: 
- 确保 middleware 中的 Supabase 查询是高效的（使用索引）
- 考虑使用缓存（如果适用）
- 如果使用 service role key，确保查询是必要的

---

### 环境变量未生效

**问题**: 环境变量在代码中返回 `undefined`

**检查**:
1. 环境变量是否以 `NEXT_PUBLIC_*` 开头（客户端使用）
2. 是否在正确的环境（Production/Preview/Development）中设置
3. 是否重新部署了应用（环境变量更改后需要重新部署）

**解决**: 
- 客户端使用的环境变量必须以 `NEXT_PUBLIC_*` 开头
- 更改环境变量后，在 Vercel Dashboard 手动触发重新部署

---

### API Routes 返回 500 错误

**问题**: API routes 在生产环境返回 500 错误

**检查**:
1. Vercel Function Logs 中查看错误详情
2. 检查服务端环境变量（`SUPABASE_SERVICE_ROLE_KEY`）是否设置
3. 检查 Supabase 连接是否正常

**解决**: 
- 查看 Vercel Dashboard → Deployments → 选择部署 → Functions → 查看日志
- 确保所有服务端环境变量都已正确配置

---

## 8. 监控和维护

### Vercel Analytics

在 Vercel Dashboard → Project Settings → Analytics 启用:
- **Web Analytics**: 跟踪页面访问
- **Speed Insights**: 性能监控

### 日志查看

- **Function Logs**: Vercel Dashboard → Deployments → 选择部署 → Functions
- **Build Logs**: Vercel Dashboard → Deployments → 选择部署 → Build Logs

### 回滚部署

如果新部署有问题，可以回滚到之前的版本:
1. Vercel Dashboard → Deployments
2. 找到之前的成功部署
3. 点击 **...** → **Promote to Production**

---

## 9. 安全建议

### Admin 访问控制

- ✅ 使用 middleware 检查 admin 权限（已实现）
- ✅ 使用 RLS 策略保护数据库（即使使用 service role key）
- ✅ 限制 admin 功能的 API routes 访问
- ✅ 定期审计 admin 用户列表

### 环境变量安全

- ✅ 不要在前端代码中使用 `SUPABASE_SERVICE_ROLE_KEY`
- ✅ 使用 Vercel Environment Variables（不要提交到 Git）
- ✅ 区分 Production、Preview、Development 环境

### 其他安全措施

- ✅ 使用 HTTPS（Vercel 自动启用）
- ✅ 启用 Vercel Security Headers
- ✅ 定期更新依赖包

---

## 10. 最佳实践

### 环境变量管理

- ✅ 使用 Vercel Environment Variables（不要提交到 Git）
- ✅ 区分 Production、Preview、Development 环境
- ✅ 使用 `NEXT_PUBLIC_*` 前缀标记客户端可访问的变量

### 性能优化

- ✅ 使用 Next.js Image 组件优化图片
- ✅ 启用 Vercel Edge Caching
- ✅ 优化 middleware 查询（使用索引，避免全表扫描）
- ✅ 使用 `output: 'standalone'` 减小部署大小（可选）

### 代码质量

- ✅ 使用 TypeScript 严格模式
- ✅ 添加错误处理和日志记录
- ✅ 定期进行代码审查

---

**相关文档**:
- [Vercel 部署指南 - Customer Web](./VERCEL_DEPLOYMENT_GUIDE_CUSTOMER.md)
- [Vercel 部署指南 - Internal Web](./VERCEL_DEPLOYMENT_GUIDE_INTERNAL.md)
- [Vercel 部署审计报告](./VERCEL_DEPLOYMENT_AUDIT.md)
- [Vercel 部署修复计划](./VERCEL_DEPLOYMENT_FIXES.md)
