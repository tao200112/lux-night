# =========================================================
# 本地数据库查询工具
# 使用 psql 直接连接 Supabase PostgreSQL 数据库
# =========================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$Password,
    
    [Parameter(Mandatory=$false)]
    [string]$Query = "tables"  # tables, structure, fks, stats, all
)

# 数据库连接信息
$host = "db.hbbhtmvcqpdybclbdtot.supabase.co"
$port = "5432"
$database = "postgres"
$user = "postgres"

# 如果没有提供密码，尝试从环境变量读取
if (-not $Password) {
    $Password = $env:PGPASSWORD
    if (-not $Password) {
        Write-Host "❌ 错误: 请提供数据库密码" -ForegroundColor Red
        Write-Host ""
        Write-Host "使用方法:" -ForegroundColor Yellow
        Write-Host "  .\scripts\query_db_local.ps1 -Password 'your-password'" -ForegroundColor Gray
        Write-Host "  或设置环境变量: `$env:PGPASSWORD = 'your-password'" -ForegroundColor Gray
        Write-Host ""
        Write-Host "查询选项:" -ForegroundColor Yellow
        Write-Host "  -Query tables    # 查看所有表" -ForegroundColor Gray
        Write-Host "  -Query structure # 查看表结构" -ForegroundColor Gray
        Write-Host "  -Query fks       # 查看外键" -ForegroundColor Gray
        Write-Host "  -Query stats     # 查看统计信息" -ForegroundColor Gray
        Write-Host "  -Query all       # 查看所有信息" -ForegroundColor Gray
        exit 1
    }
}

# 检查 psql 是否可用
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host "❌ 错误: 未找到 psql 命令" -ForegroundColor Red
    Write-Host ""
    Write-Host "请安装 PostgreSQL 客户端工具:" -ForegroundColor Yellow
    Write-Host "  1. 下载: https://www.postgresql.org/download/windows/" -ForegroundColor Gray
    Write-Host "  2. 或使用 Chocolatey: choco install postgresql" -ForegroundColor Gray
    Write-Host "  3. 或使用 Scoop: scoop install postgresql" -ForegroundColor Gray
    Write-Host ""
    Write-Host "安装后，确保 psql 在 PATH 中" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ 找到 psql: $($psqlPath.Source)" -ForegroundColor Green
Write-Host ""

# 设置密码环境变量
$env:PGPASSWORD = $Password

# 构建连接字符串
$connectionString = "host=$host port=$port dbname=$database user=$user"

# 定义查询函数
function Invoke-PostgresQuery {
    param(
        [string]$Query,
        [string]$Title
    )
    
    Write-Host "=" * 80 -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "=" * 80 -ForegroundColor Cyan
    Write-Host ""
    
    try {
        psql -h $host -p $port -U $user -d $database -c $Query
        Write-Host ""
    } catch {
        Write-Host "❌ 查询失败: $_" -ForegroundColor Red
        Write-Host ""
    }
}

# 根据查询类型执行
switch ($Query.ToLower()) {
    "tables" {
        Invoke-PostgresQuery -Query "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" -Title "📋 所有表列表"
    }
    
    "structure" {
        Write-Host "=" * 80 -ForegroundColor Cyan
        Write-Host "  📊 表结构信息（前10个表）" -ForegroundColor Cyan
        Write-Host "=" * 80 -ForegroundColor Cyan
        Write-Host ""
        
        $tables = psql -h $host -p $port -U $user -d $database -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LIMIT 10;"
        
        foreach ($table in $tables) {
            $table = $table.Trim()
            if ($table) {
                Write-Host "📋 表: $table" -ForegroundColor Yellow
                psql -h $host -p $port -U $user -d $database -c "\d+ $table"
                Write-Host ""
            }
        }
    }
    
    "fks" {
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
        Invoke-PostgresQuery -Query $query -Title "🔗 外键约束"
    }
    
    "stats" {
        $query = @"
SELECT
    tablename AS "表名",
    pg_size_pretty(pg_total_relation_size('public.' || tablename)) AS "总大小",
    pg_size_pretty(pg_relation_size('public.' || tablename)) AS "表大小"
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.' || tablename) DESC;
"@
        Invoke-PostgresQuery -Query $query -Title "📊 表统计信息（大小）"
        
        $query2 = @"
SELECT 'profiles' AS "表名", COUNT(*) AS "行数" FROM public.profiles
UNION ALL SELECT 'regions', COUNT(*) FROM public.regions
UNION ALL SELECT 'merchants', COUNT(*) FROM public.merchants
UNION ALL SELECT 'venues', COUNT(*) FROM public.venues
UNION ALL SELECT 'merchant_members', COUNT(*) FROM public.merchant_members
UNION ALL SELECT 'admin_users', COUNT(*) FROM public.admin_users
UNION ALL SELECT 'events', COUNT(*) FROM public.events
UNION ALL SELECT 'ticket_types', COUNT(*) FROM public.ticket_types
UNION ALL SELECT 'orders', COUNT(*) FROM public.orders
UNION ALL SELECT 'tickets', COUNT(*) FROM public.tickets
ORDER BY "表名";
"@
        Invoke-PostgresQuery -Query $query2 -Title "📊 表行数统计"
    }
    
    "all" {
        Invoke-PostgresQuery -Query "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" -Title "📋 所有表列表"
        
        Write-Host ""
        Write-Host "=" * 80 -ForegroundColor Cyan
        Write-Host "  📊 表结构信息（前5个表）" -ForegroundColor Cyan
        Write-Host "=" * 80 -ForegroundColor Cyan
        Write-Host ""
        
        $tables = psql -h $host -p $port -U $user -d $database -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LIMIT 5;"
        
        foreach ($table in $tables) {
            $table = $table.Trim()
            if ($table) {
                Write-Host "📋 表: $table" -ForegroundColor Yellow
                psql -h $host -p $port -U $user -d $database -c "\d $table"
                Write-Host ""
            }
        }
        
        $query = @"
SELECT
    tc.table_name || '.' || kcu.column_name AS "表.列",
    ccu.table_name || '.' || ccu.column_name AS "引用表.列"
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY tc.table_name
LIMIT 20;
"@
        Invoke-PostgresQuery -Query $query -Title "🔗 外键约束（前20个）"
        
        $query2 = @"
SELECT
    tablename AS "表名",
    pg_size_pretty(pg_total_relation_size('public.' || tablename)) AS "大小"
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.' || tablename) DESC;
"@
        Invoke-PostgresQuery -Query $query2 -Title "📊 表大小统计"
    }
    
    default {
        Write-Host "❌ 未知查询类型: $Query" -ForegroundColor Red
        Write-Host ""
        Write-Host "可用选项: tables, structure, fks, stats, all" -ForegroundColor Yellow
    }
}

Write-Host "✅ 查询完成!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 提示: 要查看特定表的结构，运行:" -ForegroundColor Yellow
Write-Host "   psql -h $host -p $port -U $user -d $database -c `"\d+ 表名`"" -ForegroundColor Gray
Write-Host ""
Write-Host "💡 要进入交互式模式，运行:" -ForegroundColor Yellow
Write-Host "   psql -h $host -p $port -U $user -d $database" -ForegroundColor Gray
