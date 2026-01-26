# 地区/地址体系重构 - 实施计划

> 生成时间：2026-01-26
> 目标：移除 `regions` 概念，统一以 `venues` 作为唯一地理归属单位

---

## 一、新架构说明

### 核心原则

1. **Venue 是唯一地理/归属单位**
2. **Merchant 必须绑定一个或多个 Venue**（使用 `merchant_venues` 关联表）
3. **Event 必须绑定 `venue_id`**（单 venue）
4. **Customer 端过滤基于 `venues.city/state`**，不再基于 `region_id`
5. **Home 的 "Choose your area" 改为选择 Area = (city + state)**

### 数据模型 ERD

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NEW DATA MODEL                                 │
└─────────────────────────────────────────────────────────────────────────┘

  ┌───────────────┐         ┌─────────────────────┐         ┌──────────────┐
  │   merchants   │         │   merchant_venues   │         │    venues    │
  ├───────────────┤         ├─────────────────────┤         ├──────────────┤
  │ PK id (UUID)  │◄────────│ FK merchant_id      │─────────►│ PK id (UUID) │
  │ name          │         │ FK venue_id         │         │ merchant_id* │
  │ status        │         │ PK id (UUID)        │         │ name         │
  │ created_at    │         │ created_at          │         │ place_id     │
  │ updated_at    │         │ UNIQUE(m_id, v_id)  │         │ formatted_   │
  │ [deprecated]  │         └─────────────────────┘         │   address    │
  │   region_id   │                                         │ address_line1│
  │   (NULLABLE)  │                                         │ address_line2│
  └───────────────┘                                         │ city         │
                                                            │ state        │
                                                            │ postal_code  │
                                                            │ country      │
                                                            │ lat, lng     │
                                                            │ timezone     │
                                                            │ is_active    │
                                                            │ [deprecated] │
                                                            │   region_id  │
                                                            │   (NULLABLE) │
                                                            └──────────────┘
                                                                   │
                                                                   │ venue_id
                                                                   ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                               events                                     │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ PK id (UUID)                                                             │
  │ FK merchant_id (NOT NULL)                                                │
  │ FK venue_id (NOT NULL) ← 核心：活动必须绑定 venue                          │
  │ [deprecated] region_id (NULLABLE)                                        │
  │ title, description, poster_url                                           │
  │ start_at, end_at, age_policy, refund_policy                             │
  │ status: draft | pending_review | approved | published | rejected | ...  │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                     Areas (Derived View / API)                          │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ 由 venues 表动态聚合生成，不是物理表                                        │
  │                                                                          │
  │ SELECT DISTINCT city, state, country                                    │
  │ FROM venues                                                              │
  │ WHERE is_active = true                                                  │
  │ ORDER BY state, city;                                                   │
  └─────────────────────────────────────────────────────────────────────────┘
```

### Area 选择逻辑

Customer 端 "Choose your area" 改为：

```typescript
// API: GET /api/areas
// 从 venues 聚合可选的 city+state 列表
interface Area {
  id: string;        // 生成的 ID，如 "los-angeles-ca" 或 "blacksburg-va"
  city: string;      // "Los Angeles"
  state: string;     // "CA"
  country: string;   // "US"
  displayName: string; // "Los Angeles, CA"
  venueCount: number;  // 该区域的活跃 venue 数量
}

// 过滤逻辑
// 选中 Area 后，前端存储 { city, state }
// 查询 events 时：
// 1. 先查满足条件的 venues: SELECT id FROM venues WHERE city = ? AND state = ? AND is_active = true
// 2. 再查 events: SELECT * FROM events WHERE venue_id IN (venue_ids) AND status = 'published'
// 或者一步到位 JOIN：
// SELECT e.* FROM events e
//   JOIN venues v ON e.venue_id = v.id
//   WHERE v.city = ? AND v.state = ? AND v.is_active = true
//   AND e.status = 'published'
```

---

## 二、逐文件改动列表

### 数据库 Migrations（按顺序执行）

| # | 文件名 | 目的 |
|---|--------|------|
| 1 | `027_create_merchant_venues_table.sql` | 创建 `merchant_venues` M:N 关联表 |
| 2 | `028_make_region_id_nullable.sql` | 将 `merchants.region_id`, `venues.region_id`, `events.region_id` 改为 NULLABLE |
| 3 | `029_disable_region_sync_triggers.sql` | 禁用/删除 region 同步触发器 |
| 4 | `030_backfill_merchant_venues.sql` | 回填 `merchant_venues` 数据 |
| 5 | `031_backfill_events_venue_id.sql` | 回填 events 中缺失的 venue_id（如有） |

### Backfill 脚本

| 文件名 | 目的 |
|--------|------|
| `backfill_merchant_venues.sql` | 从现有 venues.merchant_id 生成 merchant_venues 记录 |
| `audit_events_without_venue.sql` | 输出缺失 venue_id 的 events 列表，供人工修复 |
| `audit_merchants_without_venues.sql` | 输出没有绑定 venue 的 merchants，需管理员补绑定 |

### Admin-Web 改动

| 文件路径 | 改动内容 |
|----------|----------|
| `app/settings/page.tsx` | 移除 "Regional Config" 整个 Section（约 200 行），或设置 `hidden` |
| `app/settings/venues/page.tsx` | 移除 Region 下拉选择，创建 venue 时不再需要 region_id |
| `app/events/new/page.tsx` | 移除 Region 下拉，Venue 选择直接从商家绑定的 venues 中选 |
| `app/events/[id]/edit/page.tsx` | 同上 |
| `app/api/admin/regions/route.ts` | 改为 `/api/admin/areas`，返回从 venues 聚合的 area 列表 |
| `app/api/admin/regions/[id]/route.ts` | 可选保留用于历史数据查看，或移除 |
| `app/api/admin/regions/cities/route.ts` | 移除或重构 |
| `app/api/admin/merchants/route.ts` | POST：移除 `regionId` 必填，改为创建后必须绑定 venue；GET：移除 region 关联查询 |
| `app/api/admin/venues/route.ts` | POST：移除 `region_id` 必填；GET：移除 region 关联 |
| `app/api/admin/events/route.ts` | POST：移除 `region_id`；强制校验 `venue_id` |
| `lib/data/admin/dashboard.ts` | 销售统计改为按 venue.city/state 分组，或移除 region 分组 |
| `components/CitySelect.tsx` | 可保留，用于选择 city（从 venues 聚合） |
| `app/merchants/page.tsx` | 列表显示改用 venue 的 city/state |
| `app/merchants/[id]/page.tsx` | 商家详情移除 region，显示关联的 venues |
| **新增** `lib/data/admin/merchant-venues.ts` | 管理 merchant_venues 关联的 CRUD |
| **新增** `app/api/admin/merchant-venues/route.ts` | merchant_venues 的 API |

### Customer-Web 改动

| 文件路径 | 改动内容 |
|----------|----------|
| `contexts/RegionContext.tsx` | **重命名为** `AreaContext.tsx`，类型从 `Region` 改为 `Area` |
| `lib/data/regions.ts` | **重命名为** `lib/data/areas.ts`，改为从 venues 聚合 area 列表 |
| `app/page.tsx` | 使用新的 `AreaContext`，"Choose your area" 列表从 `/api/areas` 获取 |
| `app/drops/page.tsx` | 使用 `useArea()` 替代 `useRegion()` |
| `lib/data/events.ts` | `getEventsByArea(city, state)` 替代 `getEventsByRegion(regionId)` |
| `app/api/region/set/route.ts` | **重命名为** `app/api/area/set/route.ts`，cookie 存 `city|state` |
| `app/api/region/current/route.ts` | **重命名为** `app/api/area/current/route.ts` |
| `app/api/regions/route.ts` | **改为** `app/api/areas/route.ts`，从 venues 聚合返回 |
| `app/api/profile/region/route.ts` | 移除或改为存储 last area |
| `lib/data/profile.ts` | 移除 `last_region_id` 更新逻辑 |
| `components/EventGlassCard.tsx` | 地址显示使用 `venue.city, venue.state` |
| `app/events/[id]/page.tsx` | 地址显示使用 `venue.formatted_address`，加 `line-clamp-2` |
| `app/wallet/page.tsx` | 票据显示 venue 简短地址 |
| `app/ticket/[id]/page.tsx` | 同上 |

### Internal-Web 改动

| 文件路径 | 改动内容 |
|----------|----------|
| 大部分不受影响 | Internal 端基于 merchant_members + venues，不直接依赖 region |
| `lib/internal/workspace.ts` | 确保不依赖 region_id |

### Shared / Types

| 文件路径 | 改动内容 |
|----------|----------|
| `types.ts` | 移除 Region 类型，添加 Area 类型 |
| `constants.ts` | 如有 region 相关常量，移除 |

---

## 三、Migrations 脚本详情

### 027_create_merchant_venues_table.sql

```sql
-- =========================================================
-- 027 CREATE MERCHANT_VENUES TABLE
-- Merchant 与 Venue 的 M:N 关联表
-- =========================================================

CREATE TABLE IF NOT EXISTS public.merchant_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_merchant_venues_merchant ON public.merchant_venues(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_venues_venue ON public.merchant_venues(venue_id);

COMMENT ON TABLE public.merchant_venues IS 'Merchant-Venue M:N relationship. A merchant can have multiple venues.';

DO $$
BEGIN
  RAISE NOTICE '✅ Created merchant_venues table';
END $$;
```

### 028_make_region_id_nullable.sql

```sql
-- =========================================================
-- 028 MAKE REGION_ID NULLABLE
-- 将 region_id 改为 NULLABLE（第一步：解除约束）
-- =========================================================

-- 1. merchants.region_id
ALTER TABLE public.merchants ALTER COLUMN region_id DROP NOT NULL;
COMMENT ON COLUMN public.merchants.region_id IS '[DEPRECATED] Legacy region reference. Will be removed in future migration.';

-- 2. venues.region_id
ALTER TABLE public.venues ALTER COLUMN region_id DROP NOT NULL;
COMMENT ON COLUMN public.venues.region_id IS '[DEPRECATED] Legacy region reference. Will be removed in future migration.';

-- 3. events.region_id
ALTER TABLE public.events ALTER COLUMN region_id DROP NOT NULL;
COMMENT ON COLUMN public.events.region_id IS '[DEPRECATED] Legacy region reference. Use venue_id to determine location.';

-- 4. 移除 merchants 的 UNIQUE(region_id, name) 约束
-- 先查找约束名，再删除
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT constraint_name INTO v_constraint_name
  FROM information_schema.table_constraints
  WHERE table_name = 'merchants'
    AND constraint_type = 'UNIQUE'
    AND constraint_name LIKE '%region_id%name%';
  
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.merchants DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped constraint: %', v_constraint_name;
  END IF;
END $$;

-- 5. 添加新的 UNIQUE 约束（仅 name）—— 可选，如果业务需要
-- ALTER TABLE public.merchants ADD CONSTRAINT uq_merchants_name UNIQUE (name);

DO $$
BEGIN
  RAISE NOTICE '✅ Made region_id NULLABLE on merchants, venues, events';
END $$;
```

### 029_disable_region_sync_triggers.sql

```sql
-- =========================================================
-- 029 DISABLE REGION SYNC TRIGGERS
-- 禁用 region 同步触发器
-- =========================================================

-- 1. 删除 venue 创建时自动继承 merchant region 的触发器
DROP TRIGGER IF EXISTS trg_set_venue_region_from_merchant ON public.venues;
DROP FUNCTION IF EXISTS public.set_venue_region_from_merchant();

-- 2. 删除 merchant region 更新时同步 venues 的触发器
DROP TRIGGER IF EXISTS trg_sync_venues_region_on_merchant_update ON public.merchants;
DROP FUNCTION IF EXISTS public.sync_venues_region_on_merchant_update();

DO $$
BEGIN
  RAISE NOTICE '✅ Disabled region sync triggers';
END $$;
```

### 030_backfill_merchant_venues.sql

```sql
-- =========================================================
-- 030 BACKFILL MERCHANT_VENUES
-- 从现有 venues.merchant_id 生成 merchant_venues 记录
-- =========================================================

INSERT INTO public.merchant_venues (merchant_id, venue_id)
SELECT DISTINCT merchant_id, id
FROM public.venues
WHERE merchant_id IS NOT NULL
ON CONFLICT (merchant_id, venue_id) DO NOTHING;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.merchant_venues;
  RAISE NOTICE '✅ Backfilled % merchant_venues records', v_count;
END $$;
```

### 031_backfill_events_venue_id.sql

```sql
-- =========================================================
-- 031 BACKFILL EVENTS VENUE_ID
-- 检查并回填 events 中缺失的 venue_id
-- =========================================================

-- 1. 审计：找出没有 venue_id 的 events
DO $$
DECLARE
  v_missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_missing_count
  FROM public.events
  WHERE venue_id IS NULL;
  
  IF v_missing_count > 0 THEN
    RAISE WARNING '⚠️ Found % events without venue_id. These need manual fix:', v_missing_count;
  ELSE
    RAISE NOTICE '✅ All events have venue_id';
  END IF;
END $$;

-- 2. 尝试自动回填：通过 merchant 的 default_venue_id
UPDATE public.events e
SET venue_id = m.default_venue_id
FROM public.merchants m
WHERE e.merchant_id = m.id
  AND e.venue_id IS NULL
  AND m.default_venue_id IS NOT NULL;

-- 3. 再次检查
DO $$
DECLARE
  v_still_missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_still_missing
  FROM public.events
  WHERE venue_id IS NULL;
  
  IF v_still_missing > 0 THEN
    RAISE WARNING '⚠️ Still % events without venue_id after backfill. Run audit query to identify:', v_still_missing;
  ELSE
    RAISE NOTICE '✅ All events now have venue_id';
  END IF;
END $$;

-- 4. 输出需要人工修复的 events（运行此查询）
-- SELECT e.id, e.title, e.merchant_id, m.name as merchant_name, e.created_at
-- FROM public.events e
-- LEFT JOIN public.merchants m ON e.merchant_id = m.id
-- WHERE e.venue_id IS NULL
-- ORDER BY e.created_at DESC;
```

---

## 四、Backfill 脚本（可选，供人工运行）

### audit_events_without_venue.sql

```sql
-- 审计：输出缺失 venue_id 的 events
SELECT 
  e.id as event_id,
  e.title,
  e.merchant_id,
  m.name as merchant_name,
  e.region_id,
  r.name as region_name,
  e.status,
  e.created_at
FROM public.events e
LEFT JOIN public.merchants m ON e.merchant_id = m.id
LEFT JOIN public.regions r ON e.region_id = r.id
WHERE e.venue_id IS NULL
ORDER BY e.created_at DESC;
```

### audit_merchants_without_venues.sql

```sql
-- 审计：输出没有绑定 venue 的 merchants
SELECT 
  m.id as merchant_id,
  m.name as merchant_name,
  m.status,
  m.created_at,
  m.default_venue_id,
  (SELECT COUNT(*) FROM public.venues v WHERE v.merchant_id = m.id) as venue_count
FROM public.merchants m
WHERE NOT EXISTS (
  SELECT 1 FROM public.venues v WHERE v.merchant_id = m.id
)
ORDER BY m.created_at DESC;
```

---

## 五、API 变更清单

### 新增 API

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/areas` | GET | 从 venues 聚合返回可选的 area 列表 |
| `/api/area/set` | POST | 设置当前选中的 area (city+state) |
| `/api/area/current` | GET | 获取当前选中的 area |
| `/api/admin/merchant-venues` | GET/POST | 管理 merchant-venue 绑定 |
| `/api/admin/merchant-venues/[id]` | DELETE | 删除绑定 |

### 修改 API

| 端点 | 变更 |
|------|------|
| `POST /api/admin/merchants` | 移除 `regionId` 必填 |
| `POST /api/admin/venues` | 移除 `region_id` 必填 |
| `POST /api/admin/events` | 移除 `region_id`，强制 `venue_id` |
| `GET /api/admin/venues` | 移除 region 关联查询 |

### 废弃 API（保留但标记 deprecated）

| 端点 | 说明 |
|------|------|
| `/api/admin/regions` | 返回空或提示 deprecated |
| `/api/regions` | Customer 端改用 `/api/areas` |
| `/api/region/set` | 改用 `/api/area/set` |

---

## 六、自测 Checklist（15+ 条）

### Admin 端

| # | 测试项 | 预期结果 |
|---|--------|----------|
| 1 | 创建 Venue（使用 PlaceAutocomplete 选地址） | 成功创建，自动填充 city/state/lat/lng |
| 2 | 未配置 GOOGLE_MAPS_API_KEY 时创建 Venue | 显示 503 错误，明确提示 "GOOGLE_MAPS_API_KEY not configured" |
| 3 | 创建 Merchant（不需选 region） | 成功创建，region_id 为 NULL |
| 4 | 创建 Merchant 后绑定 Venue | 成功添加到 merchant_venues 表 |
| 5 | 未绑定 Venue 的 Merchant 尝试创建 Event | 阻止创建，提示 "Merchant must have at least one venue" |
| 6 | 创建 Event（选择 Venue） | 成功创建，venue_id 正确写入 |
| 7 | Event 列表显示 Venue 地址 | 显示 venue 的 city/state 或 formatted_address |
| 8 | Settings 页面不再显示 Regional Config | 整个 Section 隐藏或移除 |
| 9 | Settings -> Venues 页面正常工作 | 可增删改查 venues |

### Customer 端

| # | 测试项 | 预期结果 |
|---|--------|----------|
| 10 | Home 页 "Choose your area" 显示 area 列表 | 列表从 venues 聚合，显示 "City, State" 格式 |
| 11 | 选择 Area 后 Home 过滤正确 | 只显示该 city+state 下的 events |
| 12 | Drops 页面过滤与 Home 一致 | 使用相同的 area 过滤 |
| 13 | 切换 Area 后持久化 | 刷新页面后仍保持选中的 area |
| 14 | Event Detail 地址显示 | venue 地址使用 line-clamp-2，不溢出 |
| 15 | Wallet 票据显示 venue 地址 | 显示简短地址（venue name + city） |
| 16 | 无 Area 时提示选择 | 显示 "Choose your area" 引导 |

### 旧数据兼容

| # | 测试项 | 预期结果 |
|---|--------|----------|
| 17 | 有 region_id 但无 venue 地址的旧 event | 显示 fallback 地址或 "Location TBA" |
| 18 | 旧 merchant 有 region_id | 正常显示，不报错 |
| 19 | 旧 venue 有 region_id 无 city/state | 地址显示使用 formatted_address 或 address fallback |

### 错误处理

| # | 测试项 | 预期结果 |
|---|--------|----------|
| 20 | 保存 Event 失败 | 显示明确的 toast 错误信息 |
| 21 | RLS 权限不足 | 返回 403 并显示提示 |
| 22 | Places API 调用失败 | 显示 "Unable to lookup address" 提示 |

---

## 七、回滚方案

如需回滚，执行以下步骤：

1. **恢复 region_id NOT NULL 约束**
   ```sql
   ALTER TABLE public.merchants ALTER COLUMN region_id SET NOT NULL;
   ALTER TABLE public.venues ALTER COLUMN region_id SET NOT NULL;
   ALTER TABLE public.events ALTER COLUMN region_id SET NOT NULL;
   ```

2. **恢复触发器**
   - 运行 `015_sync_venues_region_with_merchants.sql`

3. **代码回滚**
   - Git revert 相关 commits

4. **保留 merchant_venues 表**
   - 可暂不删除，对业务无影响

---

## 八、执行顺序

1. ✅ 完成自检报告（本文档）
2. ⏳ 确认方案，开始执行数据库 migrations
3. ⏳ 修改 Admin-Web 代码
4. ⏳ 修改 Customer-Web 代码
5. ⏳ 运行 backfill 脚本
6. ⏳ 按 checklist 自测
7. ⏳ 部署验证

请确认后，我将开始执行数据库 migrations 和代码修改。
