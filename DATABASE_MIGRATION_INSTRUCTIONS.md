# 数据库迁移执行说明

## 迁移文件
`supabase/migrations/034_event_week_ticketing_v2.sql`

## 执行方式

### 方式 1: Supabase Dashboard（推荐）
1. 登录 Supabase Dashboard
2. 进入项目 → SQL Editor
3. 复制 `supabase/migrations/034_event_week_ticketing_v2.sql` 的全部内容
4. 粘贴到 SQL Editor
5. 点击 "Run" 执行

### 方式 2: Supabase CLI
```bash
# 确保已安装 Supabase CLI
npm install -g supabase

# 登录 Supabase
supabase login

# 链接到项目
supabase link --project-ref your-project-ref

# 执行迁移
supabase db push
```

### 方式 3: 手动执行 SQL
如果以上方式都不可用，可以：
1. 打开 Supabase Dashboard → SQL Editor
2. 分段执行迁移文件中的 SQL 语句（按 PART 1, PART 2... 顺序执行）

## 验证迁移
执行后，检查以下表是否创建成功：
- `events_v2`
- `event_weeks`
- `event_week_days`
- `ticket_types_v2`
- `merchant_change_requests`

检查以下函数是否存在：
- `rpc_get_or_create_event_week`
- `calculate_day_validity_window`

## 注意事项
- 迁移是幂等的，可以安全地重复执行
- 不会影响现有的 `events` 和 `ticket_types` 表
- 新表与旧表并行存在，实现平滑过渡
