# =========================================================
# PostgreSQL 客户端工具安装助手
# =========================================================

Write-Host "🔍 检查 PostgreSQL 客户端工具..." -ForegroundColor Cyan
Write-Host ""

# 检查是否已安装
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if ($psqlPath) {
    Write-Host "✅ 已找到 psql: $($psqlPath.Source)" -ForegroundColor Green
    Write-Host ""
    Write-Host "版本信息:" -ForegroundColor Yellow
    psql --version
    exit 0
}

Write-Host "❌ 未找到 psql 命令" -ForegroundColor Red
Write-Host ""

# 检查是否有包管理器
$choco = Get-Command choco -ErrorAction SilentlyContinue
$scoop = Get-Command scoop -ErrorAction SilentlyContinue

Write-Host "📦 安装选项:" -ForegroundColor Yellow
Write-Host ""

if ($choco) {
    Write-Host "1. 使用 Chocolatey 安装（推荐）:" -ForegroundColor Green
    Write-Host "   choco install postgresql --params '/Password:postgres'" -ForegroundColor Gray
    Write-Host ""
}

if ($scoop) {
    Write-Host "2. 使用 Scoop 安装:" -ForegroundColor Green
    Write-Host "   scoop install postgresql" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "3. 手动下载安装:" -ForegroundColor Green
Write-Host "   https://www.postgresql.org/download/windows/" -ForegroundColor Gray
Write-Host ""
Write-Host "   安装时选择 'Command Line Tools' 组件" -ForegroundColor Gray
Write-Host ""

Write-Host "4. 使用便携版（无需安装）:" -ForegroundColor Green
Write-Host "   https://www.enterprisedb.com/download-postgresql-binaries" -ForegroundColor Gray
Write-Host "   下载后解压，将 bin 目录添加到 PATH" -ForegroundColor Gray
Write-Host ""

if ($choco) {
    $install = Read-Host "是否使用 Chocolatey 安装? (Y/n)"
    if ($install -ne 'n' -and $install -ne 'N') {
        Write-Host ""
        Write-Host "正在安装..." -ForegroundColor Cyan
        choco install postgresql --params '/Password:postgres' -y
        Write-Host ""
        Write-Host "✅ 安装完成！请重新打开 PowerShell 窗口" -ForegroundColor Green
    }
}
