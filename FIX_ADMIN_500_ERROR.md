# 修复 Admin Portal 500 错误

## ❌ 问题

访问 `http://localhost:3002/login` 时出现 500 Internal Server Error。

## 🔍 原因

**Admin Web 应用缺少 `.env.local` 文件**，导致 `process.env.NEXT_PUBLIC_SUPABASE_URL` 和 `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` 为 `undefined`。

当 middleware 或服务器端代码尝试使用这些环境变量创建 Supabase 客户端时，会抛出错误，导致 500 错误。

## ✅ 解决方案

### 步骤 1: 创建 `.env.local` 文件

已为 `apps/admin-web/.env.local` 创建文件，包含以下内容：

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://hbbhtmvcqpdybclbdtot.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmh0bXZjcXBkeWJjbGJkdG90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MDI4MjEsImV4cCI6MjA4NDE3ODgyMX0.JqJh-K_Qu21LLprbuHjp9OU-k-TbyMEZ0w0S284q1m8

# App Configuration
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3002
NEXT_PUBLIC_SITE_URL=http://localhost:3002
```

### 步骤 2: 重启开发服务器

**重要**：修改 `.env.local` 文件后，必须重启开发服务器才能使环境变量生效。

```cmd
# 停止当前服务器（Ctrl+C）

# 重新启动 Admin Web
cd C:\Users\yesod\Desktop\lux-night
npx -y pnpm@latest dev:admin
```

或者在项目根目录：

```cmd
cd apps\admin-web
npx next dev -p 3002
```

## 🔍 验证

1. **检查环境变量文件**
   - 确认 `apps/admin-web/.env.local` 文件存在
   - 确认文件内容包含 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`

2. **检查服务器日志**
   重启后，服务器应该正常启动，没有关于环境变量的错误。

3. **访问登录页面**
   - 访问 http://localhost:3002/login
   - 应该看到登录表单，而不是 500 错误

## 📋 常见问题

### Q: 环境变量已设置，但仍然出现 500 错误？

**A**: 请确保：
1. `.env.local` 文件在 `apps/admin-web/` 目录下（不是根目录）
2. 文件名称正确：`.env.local`（不是 `.env` 或 `.env.example`）
3. 已重启开发服务器
4. 环境变量名称以 `NEXT_PUBLIC_` 开头（客户端可访问）

### Q: 如何检查环境变量是否正确加载？

**A**: 在 Next.js 应用中，`NEXT_PUBLIC_*` 环境变量会在构建时注入。如果服务器端代码需要访问，确保变量名以 `NEXT_PUBLIC_` 开头。

### Q: 为什么需要在 `apps/admin-web/` 目录下创建 `.env.local`？

**A**: Next.js 应用会在其自己的目录中查找 `.env.local` 文件。虽然根目录的 `.env.local` 可能被某些工具使用，但 Next.js 应用需要在自己的目录中有环境变量文件。

## ✅ 修复后的状态

修复后，Admin Portal 应该能够：
- ✅ 正常加载登录页面（无 500 错误）
- ✅ 成功连接到 Supabase
- ✅ 正常执行认证流程
- ✅ 正确设置和读取 session cookie

## 📝 相关文件

- `apps/admin-web/.env.local` - 环境变量文件（已创建）
- `apps/admin-web/middleware.ts` - 使用环境变量的中间件
- `packages/shared/src/supabase/server.ts` - 使用环境变量的服务器端客户端
- `packages/shared/src/supabase/client.ts` - 使用环境变量的客户端客户端

## 🎯 总结

500 错误已修复。原因是缺少 `apps/admin-web/.env.local` 文件。已创建该文件并配置了必要的环境变量。请重启开发服务器以使更改生效。
