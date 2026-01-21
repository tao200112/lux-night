# PowerShell 脚本：查询 Supabase 数据库结构
# 使用方法：
#   1. 设置 $DATABASE_URL 变量
#   2. 运行: .\scripts\query_db_structure.ps1

param(
    [string]$DatabaseUrl = $env:DATABASE_URL
)

if (-not $DatabaseUrl) {
    Write-Host "❌ 错误: 请设置 DATABASE_URL 环境变量或使用 -DatabaseUrl 参数" -ForegroundColor Red
    Write-Host "   例如: `$env:DATABASE_URL='postgresql://postgres:[PASSWORD]@db.hbbhtmvcqpdybclbdtot.supabase.co:5432/postgres'" -ForegroundColor Yellow
    exit 1
}

Write-Host "🔍 正在连接数据库..." -ForegroundColor Cyan

# 解析连接字符串
$parsed = [System.Uri]$DatabaseUrl
$host = $parsed.Host
$port = $parsed.Port
$database = $parsed.AbsolutePath.TrimStart('/')
$user = $parsed.UserInfo.Split(':')[0]
$password = $parsed.UserInfo.Split(':')[1]

# 构建连接字符串（用于 psql）
$psqlConnectionString = "host=$host port=$port dbname=$database user=$user password=$password"

Write-Host "✅ 数据库连接信息已解析" -ForegroundColor Green
Write-Host "   主机: $host" -ForegroundColor Gray
Write-Host "   端口: $port" -ForegroundColor Gray
Write-Host "   数据库: $database" -ForegroundColor Gray
Write-Host "   用户: $user" -ForegroundColor Gray
Write-Host ""

# 检查 psql 是否可用
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host "⚠️  警告: 未找到 psql 命令" -ForegroundColor Yellow
    Write-Host "   请安装 PostgreSQL 客户端工具，或使用 Python 脚本" -ForegroundColor Yellow
    Write-Host "   运行: python scripts/query_db_structure.py" -ForegroundColor Yellow
    exit 1
}

Write-Host "📊 查询数据库结构..." -ForegroundColor Cyan
Write-Host ""

# 查询所有表
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "1. 所有表列表" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
$query1 = @"
SELECT 
    schemaname AS schema,
    tablename AS table_name,
    tableowner AS owner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
"@

$env:PGPASSWORD = $password
psql -h $host -p $port -U $user -d $database -c $query1

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "2. 表列信息（前10个表）" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
$query2 = @"
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable,
    c.column_default
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position
LIMIT 100;
"@

psql -h $host -p $port -U $user -d $database -c $query2

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "3. 外键约束" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
$query3 = @"
SELECT
    tc.table_name AS "表名",
    kcu.column_name AS "列名",
    ccu.table_name AS "引用表",
    ccu.column_name AS "引用列"
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;
"@

psql -h $host -p $port -U $user -d $database -c $query3

Write-Host ""
Write-Host "✅ 查询完成!" -ForegroundColor Green
