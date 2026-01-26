# 地区/地址体系重构 - 自检报告

> 生成时间：2026-01-26T00:27:18-05:00
> 项目：lux-night (monorepo with admin-web / customer-web / internal-web)

---

## 0. 项目结构概览

```
lux-night/
├── apps/
│   ├── admin-web/          # 平台管理端 (Port 3002)
│   ├── customer-web/       # 顾客端 (Port 3000)
│   └── internal-web/       # 商家内部管理端 (Port 3001)
├── supabase/
│   └── migrations/         # 数据库迁移脚本
└── packages/               # 共享代码包
```

---

## A. 当前哪些表/字段在承担"地区"职责？

### 1. `regions` 表（核心地区表）

| 字段 | 类型 | 用途 |
|------|------|------|
| `id` | UUID | 主键 |
| `name` | TEXT | 地区名称（如 "Los Angeles"） |
| `state` | TEXT | 州/省代码 |
| `country` | TEXT | 国家代码（默认 "US"） |
| `slug` | TEXT | URL-friendly 标识 |
| `city` | TEXT | 城市名 |
| `lat`, `lng` | DOUBLE | 中心点坐标 |
| `center_lat`, `center_lng` | DOUBLE | 冗余中心点 |
| `is_active` | BOOLEAN | 是否激活 |

**问题**：`regions` 表承担了"地区"的抽象概念，但实际上与 `venues` 的 city/state 重复，且管理成本高。

### 2. `merchants` 表

| 字段 | 用途 |
|------|------|
| `region_id` | **NOT NULL**，必须指向 regions 表 |
| `default_venue_id` | 默认场地（可选） |

**问题**：商家创建时必须选择 region，但实际上应该基于 venue 的物理位置自动推导。

### 3. `venues` 表

| 字段 | 用途 |
|------|------|
| `merchant_id` | 所属商家 |
| `region_id` | **NOT NULL**，必须指向 regions 表 |
| `place_id` | Google Place ID |
| `formatted_address` | 完整地址 |
| `address_line1`, `address_line2` | 结构化地址 |
| `city`, `state`, `postal_code`, `country` | 地址组件 |
| `lat`, `lng` | 坐标 |

**问题**：`venues` 既有 `region_id` 又有完整的 `city/state` 地址，存在冗余。触发器强制同步 venues.region_id 到 merchants.region_id。

### 4. `events` 表

| 字段 | 用途 |
|------|------|
| `region_id` | **NOT NULL**，必须指向 regions 表 |
| `merchant_id` | 所属商家 |
| `venue_id` | **NOT NULL**，指向 venues 表 |

**问题**：活动同时存 `region_id` 和 `venue_id`，但 region_id 可以从 venue_id 推导。

### 5. `orders` 表

| 字段 | 用途 |
|------|------|
| `region_id` | **NULLABLE**，可选关联 |

### 6. `profiles` 表

| 字段 | 用途 |
|------|------|
| `last_region_id` | 用户上次选择的地区 |
| `default_merchant_id` | Internal 端默认工作空间 |
| `default_venue_id` | Internal 端默认场地 |

### 7. `invites` 表

| 字段 | 用途 |
|------|------|
| `merchant_id` | 邀请的目标商家 |
| `venue_id` | 可选：邀请的目标场地 |

---

## B. 当前 Customer 端切换地区/过滤依赖什么字段？

### 切换地区流程

1. **Home 页面** (`apps/customer-web/app/page.tsx`)：
   - 用户点击顶部按钮 `Choose your area`
   - 显示 `regions` 表中所有 `is_active = true` 的地区列表
   - 用户选择后调用 `setRegion(regionId)`

2. **RegionContext** (`apps/customer-web/contexts/RegionContext.tsx`)：
   - 存储当前选中的 `Region` 对象
   - 调用 `/api/region/set` 设置 cookie `current_region_id`
   - 存储到 `localStorage` (`lux_region_id`)

3. **Events 过滤** (`apps/customer-web/lib/data/events.ts`)：
   ```typescript
   // getEvents() 和 getEventsByRegion()
   query = query.eq('region_id', regionId);  // ← 直接用 events.region_id 过滤
   ```

4. **Drops 过滤** (`apps/customer-web/app/drops/page.tsx`)：
   - 复用 `getDropsByRegion(regionId)` → 同样依赖 `events.region_id`

### 问题点

- 过滤逻辑直接依赖 `events.region_id`
- 没有基于 `venues.city/state` 进行地理过滤
- `Region` 是手工配置的抽象概念，不是基于实际地址的动态聚合

---

## C. 当前 Admin 创建商家/活动/Venue 的绑定链路

### 创建 Merchant

1. **Admin UI** (`apps/admin-web/app/api/admin/merchants/route.ts` POST)：
   - 必须传入 `regionId`（NOT NULL 约束）
   - 写入 `merchants` 表

2. **数据库约束**：
   - `merchants.region_id` NOT NULL REFERENCES `regions(id)`
   - `UNIQUE(region_id, name)` —— 同 region 下商家名唯一

### 创建 Venue

1. **Admin UI** (`apps/admin-web/app/settings/venues/page.tsx`)：
   - 必须选择 Merchant、Region、使用 PlaceAutocomplete 选地址
   - 调用 `/api/admin/venues` POST

2. **API** (`apps/admin-web/app/api/admin/venues/route.ts` POST)：
   ```typescript
   // 必须传入：name, merchant_id, region_id, place_id
   // 调用 getPlaceDetails(place_id) 获取结构化地址
   // 写入 venues 表
   ```

3. **触发器** (`015_sync_venues_region_with_merchants.sql`)：
   - 创建 venue 时自动继承 merchant 的 region_id
   - 更新 merchant.region_id 时自动同步所有 venues

### 创建 Event

1. **Admin UI** (`apps/admin-web/app/events/new/page.tsx`)：
   - 必须选择 Merchant、Region、Venue
   - 必须传入 `venue_id` 和 `region_id`

2. **API** (`apps/admin-web/app/api/admin/events/route.ts` 或类似)：
   - 写入 events 表，`region_id` 和 `venue_id` 都 NOT NULL

### 问题点

- 创建流程需要手动选择 Region，而不是从 Venue 自动推导
- Merchant 必须先绑定 Region 才能创建，但这不是基于实际地址
- Event 同时存 region_id 和 venue_id，冗余

---

## D. 哪些地方仍在使用 regions / region_id / region slug？

### 数据库层

| 表 | 字段 | 用途 |
|----|------|------|
| `regions` | 整表 | 核心地区配置 |
| `merchants` | `region_id` | NOT NULL，强制绑定 |
| `venues` | `region_id` | NOT NULL，强制绑定 |
| `events` | `region_id` | NOT NULL，用于过滤 |
| `orders` | `region_id` | NULLABLE，记录订单所属区 |
| `profiles` | `last_region_id` | 记录用户上次选择 |

### Admin-Web

| 文件 | 用途 |
|------|------|
| `app/settings/page.tsx` | Regional Config UI（创建/编辑 Region） |
| `app/settings/venues/page.tsx` | 创建 Venue 需选 Region |
| `app/events/new/page.tsx` | 创建 Event 需选 Region |
| `app/events/[id]/edit/page.tsx` | 编辑 Event 需选 Region |
| `app/api/admin/regions/` | CRUD API |
| `app/api/admin/merchants/route.ts` | 创建 Merchant 需 regionId |
| `app/api/admin/venues/route.ts` | 创建 Venue 需 region_id |
| `lib/data/admin/dashboard.ts` | 按 region 统计销售 |

### Customer-Web

| 文件 | 用途 |
|------|------|
| `app/page.tsx` | Home 页选择 Region |
| `app/drops/page.tsx` | Drops 按 region 过滤 |
| `contexts/RegionContext.tsx` | 全局 Region 状态 |
| `lib/data/regions.ts` | 获取 regions 列表 |
| `lib/data/events.ts` | 按 region_id 过滤 events |
| `app/api/region/set/route.ts` | 设置当前 region cookie |
| `app/api/region/current/route.ts` | 获取当前 region |
| `app/api/profile/region/route.ts` | 更新 profile.last_region_id |

### Internal-Web

| 文件 | 用途 |
|------|------|
| 多处 | workspace 切换（不直接依赖 region，但 merchants 表有 region_id） |

---

## E. 哪些地方会因为移除 regions 而崩？

### 🔴 必须修改（会 crash / 功能失效）

| 文件路径 | 函数/组件 | 崩溃原因 |
|----------|-----------|----------|
| `apps/customer-web/lib/data/events.ts` | `getEvents()`, `getEventsByRegion()` | 使用 `.eq('region_id', regionId)` 过滤，移除后无法过滤 |
| `apps/customer-web/app/page.tsx` | `DiscoverPage` | 依赖 `region.id` 调用 `getEventsByRegion()`，region 为 null 时不显示活动 |
| `apps/customer-web/app/drops/page.tsx` | `DropsPage` | 依赖 `region.id` 调用 `getDropsByRegion()` |
| `apps/customer-web/contexts/RegionContext.tsx` | `RegionProvider` | 整个 Context 基于 Region 类型，需要重构为 AreaContext |
| `apps/customer-web/lib/data/regions.ts` | `getRegions()`, `getRegion()` | 直接查询 `regions` 表，需要改为从 venues 聚合 |
| `apps/admin-web/app/settings/page.tsx` | `AdminSettingsPage` | Regional Config 整个 Section 需要移除或隐藏 |
| `apps/admin-web/app/settings/venues/page.tsx` | `SettingsVenuesPage` | 创建 Venue 时需选 Region 下拉，需移除 |
| `apps/admin-web/app/events/new/page.tsx` | 创建活动表单 | 需选 Region 下拉，需移除 |
| `apps/admin-web/app/events/[id]/edit/page.tsx` | 编辑活动表单 | 同上 |
| `apps/admin-web/app/api/admin/merchants/route.ts` | `POST` | 必须传入 `regionId`，需要重构 |
| `apps/admin-web/app/api/admin/venues/route.ts` | `POST` | 必须传入 `region_id`，需要重构；验证 region 存在 |
| `apps/admin-web/app/api/admin/regions/` | 整个目录 | 需要重构为 `/api/admin/areas` 或移除 |
| Database Schema | `merchants.region_id` | NOT NULL 约束会阻止插入，需要 migration 改为 NULLABLE 或移除 |
| Database Schema | `venues.region_id` | NOT NULL 约束会阻止插入，需要 migration 改为 NULLABLE 或移除 |
| Database Schema | `events.region_id` | NOT NULL 约束会阻止插入，需要 migration 改为 NULLABLE 或移除 |
| Database Triggers | `sync_venue_region_from_merchant` | 会尝试同步不存在的 region_id |

### 🟡 需要修改（功能降级但不 crash）

| 文件路径 | 函数/组件 | 影响 |
|----------|-----------|------|
| `apps/admin-web/lib/data/admin/dashboard.ts` | `getDashboardStats()` | 销售按 region 统计会失效 |
| `apps/customer-web/app/api/profile/region/route.ts` | `POST` | 更新 `last_region_id` 会失效 |
| `apps/admin-web/app/api/admin/customers/[customerId]/route.ts` | 客户详情 | 显示用户的 region 信息会失效 |

### 🟢 可保留但建议重构

| 文件路径 | 说明 |
|----------|------|
| `profiles.last_region_id` | 可改为存储 area (city+state) 或直接移除 |
| `orders.region_id` | NULLABLE，可保留用于历史数据统计，或通过 venue 反查 |

---

## F. 当前 Venues 地址字段状态

已经通过 `20260126000000_add_structured_address.sql` 添加了结构化地址字段：

| 字段 | 类型 | 状态 |
|------|------|------|
| `place_id` | TEXT | ✅ 已添加，唯一索引 |
| `formatted_address` | TEXT | ✅ 已添加 |
| `address_line1` | TEXT | ✅ 已添加 |
| `address_line2` | TEXT | ✅ 已添加 |
| `city` | TEXT | ✅ 已添加 |
| `state` | TEXT | ✅ 已添加 |
| `postal_code` | TEXT | ✅ 已添加 |
| `country` | TEXT | ✅ 已添加 |
| `lat`, `lng` | DOUBLE | ✅ 原有 |

**良好基础**：Venues 已经具备完整的结构化地址字段，可以支持新的 Area 过滤方案。

---

## G. 新架构目标 ERD

```
┌─────────────┐       ┌─────────────────────┐       ┌─────────────┐
│   venues    │       │   merchant_venues   │       │  merchants  │
├─────────────┤       ├─────────────────────┤       ├─────────────┤
│ PK id       │───┐   │ PK id               │   ┌───│ PK id       │
│ merchant_id │   │   │ FK merchant_id      │───┘   │ name        │
│ name        │   └───│ FK venue_id         │       │ status      │
│ place_id    │       │ UNIQUE(m_id, v_id)  │       │ created_at  │
│ formatted_  │       └─────────────────────┘       └─────────────┘
│   address   │
│ city        │       ┌─────────────┐
│ state       │       │   events    │
│ country     │       ├─────────────┤
│ lat, lng    │   ┌───│ PK id       │
│ is_active   │   │   │ FK venue_id │───────────────────────────────┐
└─────────────┘   │   │ FK merchant │                               │
                  │   │ title       │       ┌───────────────────────┘
                  │   │ start_at    │       │
                  │   │ ...         │       │
                  │   └─────────────┘       │
                  │                         │
                  │                         v
                  │   ┌─────────────────────────────────────────────┐
                  │   │ venues (地址字段完整)                        │
                  │   │ 用于 Customer 端按 city/state 过滤           │
                  │   └─────────────────────────────────────────────┘
                  │
                  │   ┌───────────────────────────────────────────┐
                  │   │ Derived: Areas                            │
                  └───│ 从 venues 聚合生成                         │
                      │ SELECT DISTINCT city, state FROM venues  │
                      │ WHERE is_active = true                   │
                      └───────────────────────────────────────────┘
```

### 核心变化

1. **移除 `regions` 表的业务依赖**
   - `merchants.region_id` → NULLABLE 或移除
   - `venues.region_id` → NULLABLE 或移除
   - `events.region_id` → NULLABLE 或移除（通过 venue_id 反查）

2. **新增 `merchant_venues` 关联表（M:N）**
   - 一个商家可以有多个场地
   - 一个场地只属于一个商家（实际是 1:N，但用 M:N 表更灵活）

3. **Customer 端 Area 过滤**
   - 基于 `venues.city + venues.state` 动态聚合可选区域
   - 过滤逻辑：`events.venue_id IN (SELECT id FROM venues WHERE city = ? AND state = ?)`

4. **Event 绑定**
   - `events.venue_id` 必填（NOT NULL）
   - `events.merchant_id` 保留（便于查询，但以 venue 为准）
   - 移除 `events.region_id` 依赖

---

## 下一步

待您确认此检查报告后，我将：

1. 输出详细的逐文件改动列表
2. 生成 migrations/backfill 脚本
3. 输出 15+ 条自测 checklist

请确认是否可以继续。
