# 部署命令

## 🚀 快速部署

### 方式一：使用根目录命令（推荐）

#### 启动 Customer Web (端口 3000)
```cmd
pnpm dev:customer
```

#### 启动 Internal Web (端口 3001)
```cmd
pnpm dev:internal
```

#### 同时启动两个应用（需要两个终端）
```cmd
# 终端 1
pnpm dev:customer

# 终端 2
pnpm dev:internal
```

### 方式二：进入各自目录启动

#### Customer Web
```cmd
cd apps\customer-web
pnpm dev
```

#### Internal Web
```cmd
cd apps\internal-web
pnpm dev
```

## 📦 安装依赖

### 首次部署
```cmd
# 在根目录
pnpm install
```

或使用 npx（如果没有全局安装 pnpm）：
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
# Customer Web
cd apps\customer-web
rmdir /s /q .next

# Internal Web
cd apps\internal-web
rmdir /s /q .next
```

### 清理并重新安装依赖
```cmd
# 在根目录
rmdir /s /q node_modules
rmdir /s /q apps\customer-web\node_modules
rmdir /s /q apps\internal-web\node_modules
pnpm install
```

## 🔍 检查状态

### 检查端口占用
```cmd
# 检查端口 3000
netstat -ano | findstr :3000

# 检查端口 3001
netstat -ano | findstr :3001
```

### 停止占用端口的进程
```cmd
# 替换 <PID> 为实际的进程 ID
taskkill /PID <PID> /F
```

## 📝 环境变量配置

### 检查环境变量文件
```cmd
# Customer Web
type apps\customer-web\.env.local

# Internal Web
type apps\internal-web\.env.local
```

### 创建环境变量文件（如果不存在）
```cmd
# Customer Web
copy apps\customer-web\.env.example apps\customer-web\.env.local

# Internal Web
copy apps\internal-web\.env.example apps\internal-web\.env.local
```

## 🔧 完整部署流程

### 1. 首次部署
```cmd
# 1. 安装依赖
pnpm install

# 2. 配置环境变量（编辑 .env.local 文件）
# - apps\customer-web\.env.local
# - apps\internal-web\.env.local

# 3. 启动开发服务器
# 终端 1
pnpm dev:customer

# 终端 2
pnpm dev:internal
```

### 2. 日常开发
```cmd
# 只需要启动开发服务器
pnpm dev:customer   # 终端 1
pnpm dev:internal   # 终端 2
```

### 3. 生产部署
```cmd
# 1. 构建
pnpm build

# 2. 启动生产服务器
cd apps\customer-web
pnpm start   # 终端 1

cd apps\internal-web
pnpm start   # 终端 2
```

## ⚠️ 常见问题

### pnpm 未找到
```cmd
# 使用 npx 运行
npx -y pnpm@latest dev:customer
npx -y pnpm@latest dev:internal
```

### 端口被占用
```cmd
# 查找占用端口的进程
netstat -ano | findstr :3000
netstat -ano | findstr :3001

# 停止进程（替换 <PID>）
taskkill /PID <PID> /F
```

### 清除缓存后重启
```cmd
# 清理缓存
cd apps\customer-web
rmdir /s /q .next

cd ..\internal-web
rmdir /s /q .next

# 重新启动
cd ..\..
pnpm dev:customer   # 终端 1
pnpm dev:internal   # 终端 2
```
