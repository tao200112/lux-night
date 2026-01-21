# 商家地区绑定机制说明

## 概述

系统中商家（merchant）、场地（venue）和活动（event）都已经绑定了地区（region）。当商家绑定到某个地区后，该商家的场地和活动会自动显示在该地区的列表中。

## 数据模型

### 1. 地区（Regions）
```sql
regions (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT,
  country TEXT DEFAULT 'US',
  ...
)
```

### 2. 商家（Merchants）- 已绑定地区
```sql
merchants (
  id UUID PRIMARY KEY,
  region_id UUID NOT NULL REFERENCES regions(id),  -- 商家必须绑定一个地区
  name TEXT NOT NULL,
  ...
)
```

### 3. 场地（Venues）- 已绑定地区
```sql
venues (
  id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  region_id UUID NOT NULL REFERENCES regions(id),  -- 场地也绑定地区
  name TEXT NOT NULL,
  ...
)
```

### 4. 活动（Events）- 已绑定地区
```sql
events (
  id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  venue_id UUID NOT NULL REFERENCES venues(id),
  region_id UUID NOT NULL REFERENCES regions(id),  -- 活动也绑定地区
  ...
)
```

## 工作流程

### 创建商家时绑定地区

在 `CREATE_MERCHANT_INVITE_FOR_USER.sql` 中，创建商家时已经指定了 `region_id`：

```sql
INSERT INTO public.merchants (id, name, region_id, status)
VALUES (
  gen_random_uuid(),
  'Merchant for taoliu001711@gmail.com',
  v_region_id,  -- 使用指定的 region_id
  'active'
)
```

### 创建场地时继承地区

创建 venue 时，应该使用 merchant 的 `region_id`，或者确保 `venue.region_id` 与 `merchant.region_id` 一致。

**推荐做法**：在创建 venue 时，从 merchant 获取 region_id：

```sql
-- 创建 venue 时自动使用 merchant 的 region_id
INSERT INTO public.venues (merchant_id, region_id, name, ...)
SELECT 
  p_merchant_id,
  m.region_id,  -- 从 merchant 获取 region_id
  p_name,
  ...
FROM public.merchants m
WHERE m.id = p_merchant_id;
```

### 创建活动时继承地区

创建 event 时，应该使用 venue 的 `region_id`：

```sql
-- 创建 event 时自动使用 venue 的 region_id
INSERT INTO public.events (merchant_id, venue_id, region_id, ...)
SELECT 
  p_merchant_id,
  p_venue_id,
  v.region_id,  -- 从 venue 获取 region_id
  ...
FROM public.venues v
WHERE v.id = p_venue_id;
```

## 前端显示逻辑

### 客户端（Customer App）

在 `apps/customer-web/app/page.tsx` 中，用户选择地区后，会过滤显示该地区的活动：

```typescript
const loadEvents = async () => {
  if (!region) return;
  
  // 根据 region.id 过滤 events
  const eventsData = await getEventsData(region.id);
  setEvents(eventsData);
};
```

`getEvents()` 函数（`apps/customer-web/lib/data/events.ts`）已经支持按 `region_id` 过滤：

```typescript
export async function getEvents(regionId?: string): Promise<EventWithVenue[]> {
  const supabase = createClient();
  
  let query = supabase
    .from('events')
    .select(`*, venues!inner(id, name, address)`)
    .eq('status', 'published')
    .order('start_at', { ascending: true });

  if (regionId) {
    query = query.eq('region_id', regionId);  // 按地区过滤
  }

  const { data, error } = await query;
  return (data || []) as EventWithVenue[];
}
```

## 当前状态

✅ **已完成**：
- 数据库表结构已支持地区绑定（merchants、venues、events 都有 `region_id`）
- 客户端显示逻辑已支持按地区过滤
- 创建商家时已绑定地区

⚠️ **需要注意**：
- 创建 venue 时，确保 `venue.region_id` 与 `merchant.region_id` 一致
- 创建 event 时，确保 `event.region_id` 与 `venue.region_id` 一致
- 如果 venue/event 的创建 API 尚未自动设置 region_id，需要更新这些 API

## 验证地区绑定

执行以下查询验证地区绑定是否正确：

```sql
-- 查看商家及其地区
SELECT 
  m.id AS merchant_id,
  m.name AS merchant_name,
  r.name AS region_name
FROM public.merchants m
INNER JOIN public.regions r ON r.id = m.region_id;

-- 查看场地及其地区（应该与 merchant 的 region 一致）
SELECT 
  v.id AS venue_id,
  v.name AS venue_name,
  m.name AS merchant_name,
  r1.name AS venue_region,
  r2.name AS merchant_region
FROM public.venues v
INNER JOIN public.merchants m ON m.id = v.merchant_id
INNER JOIN public.regions r1 ON r1.id = v.region_id
INNER JOIN public.regions r2 ON r2.id = m.region_id;

-- 查看活动及其地区（应该与 venue 的 region 一致）
SELECT 
  e.id AS event_id,
  e.title AS event_title,
  v.name AS venue_name,
  r1.name AS event_region,
  r2.name AS venue_region
FROM public.events e
INNER JOIN public.venues v ON v.id = e.venue_id
INNER JOIN public.regions r1 ON r1.id = e.region_id
INNER JOIN public.regions r2 ON r2.id = v.region_id;
```

## 总结

**商家地区绑定已经实现**：
1. 商家创建时必须指定 `region_id`
2. 场地应该继承商家的 `region_id`
3. 活动应该继承场地的 `region_id`
4. 客户端按地区过滤时，会显示该地区的所有活动（包括该商家的活动）

如果商家的活动没有显示在地区列表中，检查：
1. `events.region_id` 是否与地区匹配
2. `events.status` 是否为 `'published'`
3. venue 和 event 的 region_id 是否正确设置
