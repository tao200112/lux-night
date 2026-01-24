# Merchants Insert Timezone Error 最终修复方案

## A) Client 验证

### 当前代码确认
- **文件：** `apps/admin-web/app/api/admin/merchants/route.ts`
- **Client 创建：** `requireAdmin(request)` 返回 `adminClient`
- **adminClient 来源：** `lib/admin/api.ts` 的 `createServiceRoleClient()`
- **Key 类型：** `process.env.SUPABASE_SERVICE_ROLE_KEY` ✅

### 验证日志
已添加以下日志：
- `step: 'client.verification'` - 验证 client 使用的 key 类型
- `step: 'merchant.insert.before'` - 插入前验证 client 类型

**预期日志：**
```json
{
  "step": "client.verification",
  "clientKeyType": "SERVICE_ROLE",
  "usingServiceRoleKey": true,
  "keyPrefix": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## B) 数据库定位脚本

请在 **Supabase SQL Editor** 执行以下查询：

```sql
-- 1) 查 RLS policy 是否引用 timezone
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  roles, 
  cmd, 
  qual, 
  with_check
FROM pg_policies
WHERE (qual ILIKE '%timezone%' OR with_check ILIKE '%timezone%')
ORDER BY tablename, policyname;

-- 2) 查 triggers（merchants/venues/merchant_members）
SELECT 
  event_object_schema, 
  event_object_table, 
  trigger_name, 
  action_timing, 
  event_manipulation, 
  action_statement
FROM information_schema.triggers
WHERE event_object_table IN ('merchants', 'venues', 'merchant_members')
ORDER BY event_object_table, trigger_name;

-- 3) 查所有函数里是否出现 timezone
SELECT 
  n.nspname AS schema, 
  p.proname AS name,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p 
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE pg_get_functiondef(p.oid) ILIKE '%timezone%'
ORDER BY 1, 2;

-- 4) 查 view 是否引用 timezone
SELECT 
  table_schema, 
  table_name,
  view_definition
FROM information_schema.views
WHERE view_definition ILIKE '%timezone%'
ORDER BY table_schema, table_name;
```

## C) 修复策略

### 方案 1: 禁用 Trigger（推荐，最小破坏）

如果 trigger 是问题的根源，直接禁用：

```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_ensure_merchant_default_venue ON public.merchants;
COMMIT;
```

**优点：**
- 最小破坏
- 立即解决问题
- 不影响其他功能

**缺点：**
- 不再自动创建 default venue（可以在应用层处理）

### 方案 2: 修复 Trigger Function

如果必须保留 trigger，修复 function：

```sql
BEGIN;

-- 修改 trigger function，使用更安全的方式
CREATE OR REPLACE FUNCTION public.ensure_merchant_default_venue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_venue_id UUID;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.default_venue_id IS NULL THEN
    -- 使用 SET LOCAL 临时禁用 RLS（如果支持）
    -- 或者使用更安全的方式插入
    PERFORM set_config('role', 'service_role', true);
    
    INSERT INTO public.venues(...)
    VALUES (...);
    
    UPDATE public.merchants
    SET default_venue_id = v_default_venue_id
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
```

### 方案 3: 在应用层创建 Default Venue

如果禁用 trigger，在应用层处理：

```typescript
// 在创建 merchant 后，手动创建 default venue
if (merchantInsertResult.data && !merchantInsertResult.data.default_venue_id) {
  const { data: defaultVenue } = await adminClient
    .from('venues')
    .insert({
      merchant_id: merchantId,
      region_id: regionId,
      name: 'Default Venue',
      timezone: COALESCE(regionData.timezone, 'America/New_York'),
      is_active: true,
    })
    .select('id')
    .single();
  
  await adminClient
    .from('merchants')
    .update({ default_venue_id: defaultVenue.id })
    .eq('id', merchantId);
}
```

## 最终修复脚本

根据定位结果，选择以下之一：

### 如果问题在 Trigger：
```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_ensure_merchant_default_venue ON public.merchants;
COMMIT;
```

### 如果问题在 RLS Policy：
需要查看 policy 定义，修复 timezone 引用。

## 验证步骤

1. 执行定位脚本，获取结果
2. 根据结果选择修复方案
3. 执行修复脚本
4. 重新测试 POST `/api/admin/merchants`
5. 验证 `merchant.default_venue_id` 和 `invite.merchantId` 正确
