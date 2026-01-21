# =========================================================
# Create Environment Variable Files Script
# 创建环境变量文件脚本
# =========================================================

Write-Host "创建环境变量文件..." -ForegroundColor Green

# Customer Web
$customerEnv = @"
# Customer Web Environment Variables
# 顾客端应用环境变量

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# App Configuration
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Stripe Configuration (可选)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
"@

$customerEnv | Out-File -FilePath "apps\customer-web\.env.local" -Encoding UTF8 -NoNewline
Write-Host "✅ 已创建: apps\customer-web\.env.local" -ForegroundColor Green

# Internal Web
$internalEnv = @"
# Internal Web Environment Variables
# 商家端应用环境变量

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# App Configuration
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3001
NEXT_PUBLIC_SITE_URL=http://localhost:3001
"@

$internalEnv | Out-File -FilePath "apps\internal-web\.env.local" -Encoding UTF8 -NoNewline
Write-Host "✅ 已创建: apps\internal-web\.env.local" -ForegroundColor Green

# Admin Web
$adminEnv = @"
# Admin Web Environment Variables
# 管理员端应用环境变量

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# App Configuration
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3002
NEXT_PUBLIC_SITE_URL=http://localhost:3002
"@

$adminEnv | Out-File -FilePath "apps\admin-web\.env.local" -Encoding UTF8 -NoNewline
Write-Host "✅ 已创建: apps\admin-web\.env.local" -ForegroundColor Green

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ 环境变量文件已创建！" -ForegroundColor Green
Write-Host ""
Write-Host "下一步操作：" -ForegroundColor Yellow
Write-Host "1. 编辑每个 .env.local 文件，填入你的 Supabase 配置"
Write-Host "2. 获取 Supabase 配置："
Write-Host "   - 访问 Supabase Dashboard → Settings → API"
Write-Host "   - 复制 Project URL → NEXT_PUBLIC_SUPABASE_URL"
Write-Host "   - 复制 anon public key → NEXT_PUBLIC_SUPABASE_ANON_KEY"
Write-Host ""
Write-Host "3. 创建 Admin 用户并设置权限（见 SETUP_ENV_AND_ADMIN.md）"
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
