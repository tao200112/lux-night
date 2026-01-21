# Event 页面调试指南

## 需要提供的信息

为了诊断 event 页面无法加载的问题，请提供以下信息：

### 1. 浏览器控制台信息

请打开浏览器开发者工具（F12），切换到 **Console** 标签，然后：

1. **清除控制台**（点击清除按钮或 Ctrl+L）
2. **刷新页面**（F5）
3. **等待几秒钟**
4. **复制所有控制台输出**（包括所有日志、错误、警告）

### 2. Network 标签信息

切换到 **Network** 标签，然后：

1. **清除网络日志**
2. **刷新页面**
3. **找到以下请求**（如果存在）：
   - `events?...` （查询事件的请求）
   - `ticket_types?...` （查询票类型的请求）
   - `venues?...` （查询场馆的请求）

4. **对于每个失败的请求**（状态码不是 200）：
   - 点击请求
   - 查看 **Headers** 标签，复制 **Request URL** 和 **Request Headers**
   - 查看 **Response** 标签，复制完整的响应内容
   - 查看 **Preview** 标签（如果有）

### 3. Supabase RLS 策略状态

请确认是否已执行 RLS 修复 migration：

在 Supabase SQL Editor 中运行以下查询：

```sql
-- 检查 venues RLS 策略
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'venues'
AND policyname = 'venues_read_public';
```

**请提供查询结果**，特别是 `qual` 字段的内容。

### 4. 事件数据检查

在 Supabase SQL Editor 中运行以下查询：

```sql
-- 检查事件是否存在
SELECT 
  e.id,
  e.title,
  e.status,
  e.venue_id,
  v.id as venue_exists,
  v.name as venue_name,
  v.is_active as venue_active
FROM public.events e
LEFT JOIN public.venues v ON e.venue_id = v.id
WHERE e.id = '66dca6c2-971a-413f-9c32-8c1c0729f310';
```

**请提供查询结果**。

### 5. 测试 RLS 策略

在 Supabase SQL Editor 中，使用 **anon** 角色测试查询（模拟未登录用户）：

```sql
-- 设置角色为 anon（匿名用户）
SET ROLE anon;

-- 尝试查询事件
SELECT 
  e.*,
  v.id as venue_id,
  v.name as venue_name,
  v.address as venue_address
FROM public.events e
LEFT JOIN public.venues v ON e.venue_id = v.id
WHERE e.id = '66dca6c2-971a-413f-9c32-8c1c0729f310'
AND e.status = 'published';

-- 重置角色
RESET ROLE;
```

**请提供查询结果**（包括是否有错误信息）。

## 可能的原因

根据代码分析，可能的原因包括：

1. **RLS 策略未执行**：`008_fix_venues_rls_for_events.sql` 可能还没有执行
2. **Venue 数据缺失**：事件关联的 venue 可能不存在或 `is_active=false`
3. **网络请求失败**：Supabase API 请求可能被阻止或超时
4. **认证问题**：用户可能未正确认证，导致 RLS 策略阻止访问
5. **错误处理问题**：错误可能被捕获但没有正确显示

## 临时解决方案

如果需要快速测试，可以临时禁用 RLS 策略（**仅用于调试，不要在生产环境使用**）：

```sql
-- 临时禁用 venues RLS（仅用于调试）
ALTER TABLE public.venues DISABLE ROW LEVEL SECURITY;

-- 测试完成后，记得重新启用
-- ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
```
