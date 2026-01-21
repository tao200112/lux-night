# Internal Web 环境变量配置指南

## 问题诊断

如果看到 DNS 错误 `DNS_PROBE_FINISHED_NXDOMAIN`，并且 URL 中包含 `your-project.supabase.co`，说明环境变量没有正确配置。

## 配置步骤

### 1. 获取 Supabase 配置信息

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **Settings** → **API**
4. 复制以下信息：
   - **Project URL** (格式: `https://xxxxx.supabase.co`)
   - **anon/public key** (格式: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)

### 2. 创建 `.env.local` 文件

在 `apps/internal-web/` 目录下创建 `.env.local` 文件：

```bash
# Windows PowerShell
cd apps\internal-web
New-Item -Path .env.local -ItemType File
```

### 3. 配置环境变量

编辑 `apps/internal-web/.env.local`，填入你的 Supabase 配置：

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Internal App Origin (可选)
# NEXT_PUBLIC_APP_ORIGIN=http://localhost:3001
```

**重要提示**:
- 将 `your-project-ref` 替换为你的实际 Supabase 项目引用 ID
- 将 `your-anon-key-here` 替换为你的实际 anon key
- 不要包含任何引号或空格

### 4. 验证配置

检查 `.env.local` 文件内容：

```bash
# Windows PowerShell
Get-Content apps\internal-web\.env.local
```

确保：
- ✅ URL 格式正确：`https://xxxxx.supabase.co`（没有 `your-project` 占位符）
- ✅ URL 和 Key 都在同一行，没有换行
- ✅ 没有多余的空格或引号

### 5. 重启开发服务器

环境变量更改后，需要重启开发服务器才能生效：

```bash
# 停止当前运行的服务器 (Ctrl+C)
# 然后重新启动
npx -y pnpm@latest dev:internal
```

### 6. 验证环境变量是否加载

在浏览器控制台检查环境变量：

```javascript
console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
```

或者检查网络请求，看 OAuth 请求的 URL 是否正确。

## 常见错误

### 错误 1: DNS_PROBE_FINISHED_NXDOMAIN

**原因**: 环境变量中仍然是占位符 `your-project.supabase.co`

**解决方法**:
1. 检查 `.env.local` 文件中的 `NEXT_PUBLIC_SUPABASE_URL` 是否使用了实际的 Supabase 项目 URL
2. 确保重启了开发服务器
3. 清除浏览器缓存并刷新

### 错误 2: Invalid API key

**原因**: `NEXT_PUBLIC_SUPABASE_ANON_KEY` 配置错误

**解决方法**:
1. 从 Supabase Dashboard 重新复制 anon key
2. 确保没有多余的空格或换行
3. 重启开发服务器

### 错误 3: 环境变量未加载

**原因**: Next.js 没有正确读取 `.env.local` 文件

**解决方法**:
1. 确保文件位于 `apps/internal-web/.env.local`（不是根目录）
2. 确保文件名称正确（`.env.local`，不是 `.env.local.txt`）
3. 重启开发服务器

## 安全检查

⚠️ **重要**: `.env.local` 文件包含敏感信息，请：

1. ✅ 确保 `.env.local` 已添加到 `.gitignore`
2. ✅ 不要将 `.env.local` 提交到 Git 仓库
3. ✅ 不要将 `.env.local` 的内容分享给他人

## 参考文件

- 示例配置文件: `apps/internal-web/.env.example`
- Customer App 配置: `apps/customer-web/.env.example`（如果存在）

## 下一步

配置完环境变量后，请：
1. 重启开发服务器
2. 刷新浏览器页面
3. 再次尝试 Google 登录
4. 检查是否还有 DNS 错误
