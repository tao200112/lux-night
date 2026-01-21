# 🔴 紧急修复 - create_staff_invite 函数

## 问题
函数中 `v_venue` 记录变量在 `p_venue_id` 为 NULL 时未被赋值，但在返回结果时访问了 `v_venue.name`。

## 立即执行步骤

### 方法 1: 使用完整修复脚本（推荐）

1. **打开 Supabase Dashboard**
   - 访问 https://supabase.com/dashboard
   - 选择你的项目
   - 点击左侧 **SQL Editor**

2. **执行完整修复脚本**
   - 点击 **New Query**
   - **复制并粘贴整个文件内容**：`supabase/scripts/fix_create_staff_invite_COMPLETE.sql`
   - 点击 **Run**（或按 Ctrl+Enter）

3. **验证执行结果**
   - 应该看到 "Success. No rows returned" 或显示函数信息
   - 如果有错误，检查错误信息

### 方法 2: 只执行关键修复（如果方法1失败）

如果上面的方法失败，尝试只更新函数的关键部分：

```sql
-- 只修复返回语句部分
CREATE OR REPLACE FUNCTION public.create_staff_invite(...)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ...
  v_venue RECORD;
  v_venue_name TEXT;  -- 新增变量
BEGIN
  ...
  
  -- 修改 venue 校验部分
  v_venue_name := NULL;
  IF p_venue_id IS NOT NULL THEN
    SELECT * INTO v_venue
    FROM public.venues
    WHERE id = p_venue_id AND merchant_id = p_merchant_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'VENUE_MISMATCH: Venue does not belong to merchant';
    END IF;
    
    v_venue_name := v_venue.name;  -- 赋值给单独变量
  END IF;
  
  ...
  
  -- 修改返回语句
  RETURN jsonb_build_object(
    ...
    'venue_name', v_venue_name,  -- 使用单独变量，不是 v_venue.name
    ...
  );
END;
$$;
```

## 验证修复是否成功

### 方法 1: 查询函数定义
```sql
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'create_staff_invite';
```

检查返回结果中是否包含 `v_venue_name TEXT` 和 `'venue_name', v_venue_name`。

### 方法 2: 测试调用
在 Supabase Dashboard SQL Editor 中测试：

```sql
-- 注意：这只是一个测试，需要有效的 merchant_id 和已登录用户
-- 实际测试请在应用中完成
SELECT public.create_staff_invite(
  'your-merchant-id'::UUID,
  'staff',
  10,
  30,
  NULL,  -- p_venue_id 为 NULL
  NULL
);
```

如果返回成功（`"ok": true`），说明修复成功。

### 方法 3: 在应用中测试
1. 打开商家端应用
2. 访问 `/invites/create`
3. 填写表单（**不要填写 venueId**）
4. 点击 "Generate Invite Code"
5. 如果成功创建邀请码，说明修复成功

## 如果仍然失败

### 检查项：
1. **确认函数确实被更新了**
   - 执行 `SELECT pg_get_functiondef(...)` 查看函数代码
   - 确认包含 `v_venue_name TEXT` 和 `'venue_name', v_venue_name`

2. **检查权限**
   - 确保你有权限修改函数
   - 如果使用 Supabase Dashboard，通常有权限

3. **清除缓存**
   - 如果使用连接池，可能需要重新连接
   - 重启应用可能有助于清除缓存

4. **查看完整错误**
   - 在 Supabase Dashboard → Logs → Postgres Logs 查看详细错误
   - 检查是否有其他相关问题

## 关键修复点

**原代码（有问题）**：
```sql
'venue_name', COALESCE(v_venue.name, NULL),  -- ❌ 当 v_venue 未赋值时会报错
```

**修复后（方法1 - CASE语句）**：
```sql
'venue_name', CASE WHEN p_venue_id IS NOT NULL THEN v_venue.name ELSE NULL END,  -- ✅ 但仍有风险
```

**修复后（方法2 - 单独变量，推荐）**：
```sql
DECLARE
  v_venue_name TEXT;  -- 新增
BEGIN
  v_venue_name := NULL;  -- 初始化
  IF p_venue_id IS NOT NULL THEN
    ...
    v_venue_name := v_venue.name;  -- 赋值
  END IF;
  ...
  'venue_name', v_venue_name,  -- ✅ 使用单独变量，安全
```

## 联系支持

如果以上方法都无法解决问题，请提供：
1. Supabase Dashboard 中的完整错误信息
2. 执行 `SELECT pg_get_functiondef(...)` 的结果
3. 应用的完整错误日志
