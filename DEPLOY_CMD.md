# CMD 部署命令（Windows 命令提示符）

## 🚀 快速启动
cd Desktop/lux-night

### 启动 Customer Web (端口 3000)
```cmd
pnpm dev:customer
```

### 启动 Internal Web (端口 3001)
```cmd
pnpm dev:internal
```

### 如果 pnpm 未安装，使用：
```cmd
npx -y pnpm@latest dev:customer
npx -y pnpm@latest dev:internal
```

## 📦 安装依赖

```cmd
pnpm install
```

或使用 npx：
```cmd
npx -y pnpm@latest install
```

## 🔨 构建生产版本

### 构建 Customer Web
```cmd
pnpm build:customer
```

### 构建 Internal Web
```cmd
pnpm build:internal
```

### 构建所有应用
```cmd
pnpm build
```

## 🏃 启动生产服务器

### Customer Web
```cmd
cd apps\customer-web
pnpm start
```

### Internal Web
```cmd
cd apps\internal-web
pnpm start
```

## 🧹 清理缓存

### 清理 Next.js 构建缓存
```cmd
rmdir /s /q apps\customer-web\.next
rmdir /s /q apps\internal-web\.next
```

### 清理并重新安装依赖
```cmd
rmdir /s /q node_modules
rmdir /s /q apps\customer-web\node_modules
rmdir /s /q apps\internal-web\node_modules
pnpm install
```

## 🔍 检查端口占用

### 检查端口 3000
```cmd
netstat -ano | findstr :3000
```

### 检查端口 3001
```cmd
netstat -ano | findstr :3001
```

### 停止占用端口的进程
```cmd
taskkill /PID <PID> /F
```

## 📝 环境变量

### 查看环境变量文件
```cmd
type apps\customer-web\.env.local
type apps\internal-web\.env.local
```

### 复制环境变量模板
```cmd
copy apps\customer-web\.env.example apps\customer-web\.env.local
copy apps\internal-web\.env.example apps\internal-web\.env.local
```

## 🔧 完整部署流程

### 1. 首次部署
```cmd
REM 1. 安装依赖
pnpm install

REM 2. 配置环境变量（手动编辑 .env.local 文件）
REM - apps\customer-web\.env.local
REM - apps\internal-web\.env.local

REM 3. 启动开发服务器（需要两个 CMD 窗口）
REM 窗口 1
pnpm dev:customer

REM 窗口 2
pnpm dev:internal
```

### 2. 日常开发
```cmd
REM 只需要启动开发服务器（需要两个 CMD 窗口）
REM 窗口 1
pnpm dev:customer

REM 窗口 2
pnpm dev:internal
```

### 3. 生产部署
```cmd
REM 1. 构建
pnpm build

REM 2. 启动生产服务器（需要两个 CMD 窗口）
REM 窗口 1
cd apps\customer-web
pnpm start

REM 窗口 2
cd apps\internal-web
pnpm start
```

## ⚠️ 常用命令

### 进入项目目录
```cmd
cd C:\Users\yesod\Desktop\lux-night
```

### 检查 Node.js 版本
```cmd
node --version
```

### 检查 pnpm 版本
```cmd
pnpm --version
```

### 如果没有 pnpm，使用 npx
```cmd
npx -y pnpm@latest --version
```

## 📍 访问地址

- Customer Web: http://localhost:3000
- Internal Web: http://localhost:3001
