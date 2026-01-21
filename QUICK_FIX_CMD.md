# 快速修复命令（CMD）

## ❌ 问题 1: 端口 3001 已被占用

### 步骤 1: 查找占用端口的进程
```cmd
netstat -ano | findstr :3001
```

### 步骤 2: 停止占用端口的进程
```cmd
REM 替换 <PID> 为上面找到的进程 ID
taskkill /PID <PID> /F
```

### 或者停止所有 node 进程（谨慎使用）
```cmd
taskkill /F /IM node.exe
```

## ❌ 问题 2: pnpm 未安装

### 解决方法 1: 使用 npx 运行（推荐）
```cmd
REM 启动 Customer Web
npx -y pnpm@latest dev:customer

REM 启动 Internal Web
npx -y pnpm@latest dev:internal
```

### 解决方法 2: 全局安装 pnpm
```cmd
npm install -g pnpm
```

## ✅ 完整修复步骤

### 1. 停止占用端口的进程
```cmd
REM 查找占用端口 3001 的进程
netstat -ano | findstr :3001

REM 停止进程（替换 <PID> 为实际的进程 ID）
taskkill /PID <PID> /F
```

### 2. 启动应用（使用 npx）
```cmd
REM 窗口 1 - Customer Web
npx -y pnpm@latest dev:customer

REM 窗口 2 - Internal Web
npx -y pnpm@latest dev:internal
```

## 🔍 检查端口占用（两个端口都检查）

```cmd
REM 检查端口 3000
netstat -ano | findstr :3000

REM 检查端口 3001
netstat -ano | findstr :3001
```

## 🛠️ 一键清理并重启（CMD 脚本）

创建文件 `restart.bat`：
```batch
@echo off
echo Stopping existing Node processes...
taskkill /F /IM node.exe 2>nul

echo Waiting 2 seconds...
timeout /t 2 /nobreak >nul

echo Starting Customer Web...
start "Customer Web" cmd /k "cd apps\customer-web && npx -y pnpm@latest dev"

echo Starting Internal Web...
start "Internal Web" cmd /k "cd apps\internal-web && npx -y pnpm@latest dev"

echo Done! Check the two new windows.
pause
```

## 📋 常用 CMD 命令

### 查找所有 Node 进程
```cmd
tasklist | findstr node
```

### 停止所有 Node 进程
```cmd
taskkill /F /IM node.exe
```

### 检查 Node.js 是否安装
```cmd
node --version
```

### 检查 npm 是否安装
```cmd
npm --version
```
