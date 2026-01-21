# 快速查询数据库结构
# 使用方法：
#   1. 设置密码: $password = "your-password"
#   2. 运行: .\scripts\quick_query.ps1

param(
    [Parameter(Mandatory=$true)]
    [string]$Password
)

$host = "db.hbbhtmvcqpdybclbdtot.supabase.co"
$port = "5432"
$database = "postgres"
$user = "postgres"

# 设置密码环境变量
$env:PGPASSWORD = $Password

Write-Host "🔍 正在查询数据库结构..." -ForegroundColor Cyan
Write-Host ""

# 查询所有表
Write-Host "=" * 80 -ForegroundColor Green
Write-Host "📋 所有表列表" -ForegroundColor Green
Write-Host "=" * 80 -ForegroundColor Green
psql -h $host -p $port -U $user -d $database -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" -A -t

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Green
Write-Host "📊 表统计信息" -ForegroundColor Green
Write-Host "=" * 80 -ForegroundColor Green
$query = @"
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size('public.' || tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.' || tablename) DESC;
"@
psql -h $host -p $port -U $user -d $database -c $query

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Green
Write-Host "🔗 外键约束" -ForegroundColor Green
Write-Host "=" * 80 -ForegroundColor Green
$query = @"
SELECT
    tc.table_name || '.' || kcu.column_name AS "表.列",
    ccu.table_name || '.' || ccu.column_name AS "引用表.列"
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY tc.table_name;
"@
psql -h $host -p $port -U $user -d $database -c $query

Write-Host ""
Write-Host "✅ 查询完成!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 提示: 要查看特定表的结构，运行:" -ForegroundColor Yellow
Write-Host "   psql -h $host -p $port -U $user -d $database -c `"\d+ 表名`"" -ForegroundColor Gray
