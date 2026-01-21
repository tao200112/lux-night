# 快速修复端口 3002 占用问题

## ✅ 已执行的修复步骤

1. ✅ **终止占用端口的进程** (PID: 24204)
2. ✅ **清理 .next 目录**（解决权限问题）
3. ✅ **准备重新启动服务器**

## 🚀 下一步操作

### 方法 1: 使用 pnpm 命令（推荐）

```cmd
cd C:\Users\yesod\Desktop\lux-night
npx -y pnpm@latest dev:admin
```

### 方法 2: 直接启动

```cmd
cd C:\Users\yesod\Desktop\lux-night\apps\admin-web
npx next dev -p 3002
```

## 🔍 验证

启动后，访问 http://localhost:3002/login 应该能看到登录页面。

## 📋 如果问题仍然存在

### 检查端口是否已释放

```powershell
netstat -ano | findstr :3002
```

如果没有输出，说明端口已释放。

### 手动终止所有 Node.js 进程（如果必要）

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

**注意**：这会终止所有 Node.js 进程，包括其他正在运行的应用。

### 清理并重新启动

```powershell
# 清理 .next 目录
cd C:\Users\yesod\Desktop\lux-night\apps\admin-web
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue

# 重新启动
cd C:\Users\yesod\Desktop\lux-night
npx -y pnpm@latest dev:admin
```

## ✅ 预期结果

修复后，应该能够：
- ✅ 正常启动服务器（无端口占用错误）
- ✅ 正常访问登录页面（无 500 错误）
- ✅ 正常使用 Admin Portal 功能
