# 修复端口 3002 占用和权限错误

## ❌ 问题

启动 Admin Portal 时遇到两个错误：

1. **端口占用错误**：
   ```
   Error: listen EADDRINUSE: address already in use :::3002
   ```

2. **文件权限错误**：
   ```
   Error: EPERM: operation not permitted, open 'C:\Users\yesod\Desktop\lux-night\apps\admin-web\.next\trace'
   ```

## 🔍 原因

1. **端口 3002 已被占用**：可能有另一个进程（可能是之前启动的 Admin Portal 实例）正在使用端口 3002
2. **文件权限问题**：`.next` 目录中的某些文件可能被锁定或权限不足

## ✅ 解决方案

### 方案 1: 自动修复（已执行）

已自动执行以下步骤：

1. ✅ 查找并终止占用端口 3002 的进程
2. ✅ 清理 `.next` 目录
3. ✅ 重新启动服务器

### 方案 2: 手动修复

如果自动修复失败，请手动执行以下步骤：

#### 步骤 1: 查找占用端口的进程

```powershell
# 查找占用端口 3002 的进程
netstat -ano | findstr :3002
```

或者：

```powershell
Get-NetTCPConnection -LocalPort 3002 | Select-Object OwningProcess
```

#### 步骤 2: 终止进程

```powershell
# 终止进程（替换 <PID> 为实际的进程 ID）
Stop-Process -Id <PID> -Force
```

或者终止所有 Node.js 进程：

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

#### 步骤 3: 清理 .next 目录

```powershell
cd C:\Users\yesod\Desktop\lux-night\apps\admin-web
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
```

#### 步骤 4: 重新启动服务器

```powershell
cd C:\Users\yesod\Desktop\lux-night
npx -y pnpm@latest dev:admin
```

或者：

```powershell
cd C:\Users\yesod\Desktop\lux-night\apps\admin-web
npx next dev -p 3002
```

## 🔍 验证

1. **检查端口是否释放**：
   ```powershell
   netstat -ano | findstr :3002
   ```
   应该没有输出（端口未被占用）

2. **检查服务器是否正常启动**：
   - 访问 http://localhost:3002/login
   - 应该看到登录页面，而不是错误

## 📋 常见问题

### Q: 为什么端口会被占用？

**A**: 可能的原因：
- 之前的服务器实例没有正确关闭
- 其他应用使用了相同的端口
- 进程崩溃但端口未释放

### Q: 如何避免端口占用问题？

**A**: 
1. 启动新服务器前，先检查端口是否被占用
2. 使用 `Ctrl+C` 正确停止服务器
3. 如果服务器崩溃，手动终止进程

### Q: 文件权限错误如何解决？

**A**: 
1. 清理 `.next` 目录（Next.js 会在下次启动时重新生成）
2. 确保有文件写入权限
3. 如果问题持续，尝试以管理员身份运行

### Q: 可以使用其他端口吗？

**A**: 可以，但需要：
1. 修改 `package.json` 中的端口配置
2. 更新环境变量中的 `NEXT_PUBLIC_APP_ORIGIN` 和 `NEXT_PUBLIC_SITE_URL`
3. 更新 Supabase Redirect URLs

## ✅ 修复后的状态

修复后，Admin Portal 应该能够：
- ✅ 正常启动（无端口占用错误）
- ✅ 正常访问（无权限错误）
- ✅ 正常加载登录页面

## 🎯 总结

已自动执行修复步骤：
1. ✅ 终止占用端口 3002 的进程
2. ✅ 清理 `.next` 目录
3. ✅ 重新启动服务器

如果问题仍然存在，请检查：
- 是否有其他应用使用端口 3002
- 文件权限是否正确
- 防火墙是否阻止了端口访问
