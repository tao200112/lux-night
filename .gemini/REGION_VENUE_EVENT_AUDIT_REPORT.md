# 地区/地址体系重构 - 旧逻辑问题报告（第1步）

> 生成时间：2026-01-26T00:45:00-05:00
> 项目：lux-night monorepo

---

## A. 当前承担地区职责的表/字段

### 1. `regions` 表（核心地区表）

| 字段 | 类型 | NOT NULL | 当前用途 |
|------|------|----------|----------|
| `id` | UUID | ✅ | 主键 |
| `name` | TEXT | ✅ | 地区名称（如 "Los Angeles"） |
| `state` | TEXT | ❌ | 州代码（如 "CA"） |
| `country` | TEXT | ❌ (默认 "US") | 国家代码 |
| `slug` | TEXT | ❌ | URL-friendly 标识（**未被广泛使用**） |
| `city` | TEXT | ❌ | 城市名（**与 name 冗余**） |
| `lat`, `lng` | DOUBLE | ❌ | 中心点坐标 |
| `center_lat`, `center_lng` | DOUBLE | ❌ | **冗余**中心点（与 lat/lng 重复） |
| `is_active` | BOOLEAN | ✅ | 是否激活 |

**唯一约束**：`UNIQUE (name, state, country)` ✅ 符合新规格

**问题**：
- `city` 和 `name` 冗余
- `center_lat/lng` 和 `lat/lng` 冗余
- 缺少 `slug` 的 UNIQUE 约束（实际有条件索引）

---

### 2. `merchants` 表

| 字段 | 约束 | 当前用途 |
|------|------|----------|
| `region_id` | NOT NULL, FK → regions.id | 商家所属地区 |

**当前创建逻辑**：
- Admin 创建 Merchant 时必须手动选择 region ❌ **不符合新规格**
- 应该由 Invite 带入，不可手选

---

### 3. `venues` 表

| 字段 | 约束 | 当前用途 |
|------|------|----------|
| `merchant_id` | NOT NULL, FK → merchants.id | 所属商家 |
| `region_id` | NOT NULL, FK → regions.id | 所属地区（触发器自动继承） |
| `address` | ❌ | 旧地址字段 |
| `formatted_address` | ❌ | Google Places 返回的完整地址 |
| `address_line1` | ❌ | 街道地址第一行 |
| `address_line2` | ❌ | 街道地址第二行（可选） |
| `city` | ❌ | 城市 (**不应存储，应从 region join**) |
| `state` | ❌ | 州 (**不应存储，应从 region join**) |
| `postal_code` | ❌ | 邮编 |
| `country` | ❌ | 国家 (**不应存储**) |
| `place_id` | ❌ | Google Place ID (**新规格不需要 Google API**) |
| `lat`, `lng` | ❌ | 坐标 |

**当前触发器**（✅ 符合新规格）：
- `trg_set_venue_region_from_merchant`：INSERT 时自动 `region_id = merchant.region_id`
- `trg_sync_venue_regions_on_merchant_update`：UPDATE merchant.region_id 时自动同步 venues

**问题**：
1. `city/state/country` 字段存在，代码中仍在写入（来自 Google Places API）
2. `address_line1` 当前非 NOT NULL
3. 创建 Venue 时 UI 仍允许手动选择 Region 下拉 ❌

---

### 4. `events` 表

| 字段 | 约束 | 当前用途 |
|------|------|----------|
| `region_id` | NOT NULL, FK → regions.id | 用于 Customer 端过滤 |
| `merchant_id` | NOT NULL, FK → merchants.id | 所属商家 |
| `venue_id` | NOT NULL, FK → venues.id | 所属场地 |

**问题**：
1. 创建 Event 时 UI 仍允许手动选择 Region 下拉 ❌
2. **没有 DB 层约束**确保 `event.region_id == venue.region_id == merchant.region_id`
3. 如果手动选择不一致，DB 不阻止

---

### 5. `orders` 表

| 字段 | 约束 | 当前用途 |
|------|------|----------|
| `region_id` | NULLABLE, FK → regions.id | 订单所属地区（可选） |

**问题**：不需要改动，NULLABLE 可保留用于历史统计。

---

### 6. `profiles` 表

| 字段 | 约束 | 当前用途 |
|------|------|----------|
| `last_region_id` | NULLABLE, FK → regions.id | 用户上次选择的地区 |
| `default_merchant_id` | NULLABLE | Internal 端默认工作空间 |
| `default_venue_id` | NULLABLE | Internal 端默认场地 |

**问题**：符合规格，不需要改动。

---

### 7. `invites` 表

| 字段 | 约束 | 当前用途 |
|------|------|----------|
| `region_id` | NULLABLE, FK → regions.id | Admin 创建邀请码时指定 |
| `merchant_id` | NULLABLE, FK → merchants.id | 绑定已有商家 |

**当前 CHECK 约束**（部分符合）：
```sql
CHECK (
  (issued_by_type = 'admin' AND intended_role IN ('owner', 'manager') AND region_id IS NOT NULL)
  OR (issued_by_type = 'merchant' AND merchant_id IS NOT NULL)
  OR (merchant_id IS NOT NULL)
)
```

**问题**：
1. Admin invite 允许 `merchant_id` 为空，但 consume 逻辑**拒绝**没有 merchant_id 的 invite ❌
2. **无法创建新 Merchant**：consume API 第 312-336 行明确拒绝 `merchant_id` 为空的 invite

---

## B. Admin-Web / Internal-Web / Customer-Web 创建/编辑流程

### B.1 Admin-Web

#### 创建 Region
| UI 页面 | API 路径 | 字段 |
|---------|----------|------|
| `app/settings/page.tsx` (Regional Config) | `POST /api/admin/regions` | name, state, is_active (+ center_lat/lng 可选) |

**问题**：UI 使用 PlaceAutocomplete 填写 center 点，但新规格**不需要 Google Places**。

#### 创建 Invite
| UI 页面 | API 路径 | 关键逻辑 |
|---------|----------|----------|
| `app/settings/invites/page.tsx` | `POST /api/admin/invites` | 必须选 region；如果是 owner/manager，**还必须传 merchantId** |
| `app/api/admin/invites/create-merchant/route.ts` | `POST /api/admin/invites/create-merchant` | 允许 merchantId 为空，但 consume 会报错 |

**问题**：
1. UI 要求选商家或"创建新商家"，但"创建新商家"的 invite consume 时会失败
2. 与新规格冲突：Admin 应该只传 `region_id`，consume 时创建 merchant

#### 创建 Merchant
| UI 页面 | API 路径 | 关键逻辑 |
|---------|----------|----------|
| `app/merchants/new/page.tsx` 或 `app/api/admin/merchants` POST | `POST /api/admin/merchants` | 必须传 regionId |

**问题**：
1. 允许手动选择 region，不是从 invite 传入
2. 新规格：只能通过 invite consume 创建 merchant

#### 创建 Venue
| UI 页面 | API 路径 | 关键逻辑 |
|---------|----------|----------|
| `app/settings/venues/page.tsx` | `POST /api/admin/venues` | 必须选 merchant、region、address (PlaceAutocomplete) |

**问题**：
1. **手动选择 region** ❌ 应该自动继承 merchant.region_id
2. **依赖 Google Places API** ❌ 新规格只需要 address_line1 + address_line2
3. 写入 city/state 到 venues 表 ❌

#### 创建 Event
| UI 页面 | API 路径 | 关键逻辑 |
|---------|----------|----------|
| `app/events/new/page.tsx` | `POST /api/admin/events` | 必须选 merchant、venue、region |

**问题**：
1. **手动选择 region** ❌ 应该自动继承
2. 保存时 region_id 可能与 venue.region_id 不一致（DB 不校验）

---

### B.2 Internal-Web

#### Consume Invite
| UI 页面 | API 路径 | 关键逻辑 |
|---------|----------|----------|
| `app/invite/page.tsx` | `POST /api/invite/consume` | **必须** invite.merchant_id 已存在，否则 400 |

**问题**：
- 第 312-336 行：`if (!invite.merchant_id || !isValidUuid(invite.merchant_id))` → 拒绝
- **无法创建新 Merchant**

#### 其他
- 内部 workspace 切换不直接依赖 region，不需要大改

---

### B.3 Customer-Web

#### 选择 Region
| UI 页面 | API 路径 | 关键逻辑 |
|---------|----------|----------|
| `app/page.tsx` (Home) | `GET /api/regions` → `lib/data/regions.ts` | 从 regions 表获取 is_active=true 列表 |
| | `POST /api/region/set` | 设置 cookie + localStorage |
| `contexts/RegionContext.tsx` | - | 全局 Region 状态 |

**问题**：符合规格，不需要大改。

#### 过滤 Events
| UI 页面 | API 路径 | 关键逻辑 |
|---------|----------|----------|
| `app/page.tsx`, `app/drops/page.tsx` | `lib/data/events.ts` → `getEventsByRegion()` | `.eq('region_id', regionId)` |

**问题**：符合规格。

#### 地址展示
| UI 页面 | 当前逻辑 | 问题 |
|---------|----------|------|
| `app/events/[id]/page.tsx` | 显示 `venue.address` 或 `venue.formatted_address` | 应改为 `address_line1` + Region 的 city/state |
| `app/wallet/page.tsx`, `app/ticket/[id]/page.tsx` | 显示 `venue.name` | 可加 city 增强 |
| `components/EventGlassCard.tsx` | 显示 venue name | 可加 city 增强 |

---

## C. 冗余/不一致来源清单

| # | 问题描述 | 涉及位置 | 修复建议 |
|---|----------|----------|----------|
| C1 | Venues 存储 city/state/country | `venues` 表, `POST /api/admin/venues` | 停止写入，展示时 JOIN region |
| C2 | Events 手动选 region | `app/events/new/page.tsx`, `app/events/[id]/edit/page.tsx` | 移除 region 下拉，自动继承 |
| C3 | Venues 手动选 region | `app/settings/venues/page.tsx` | 移除 region 下拉，自动继承 |
| C4 | Invite consume 不能创建新 Merchant | `apps/internal-web/app/api/invite/consume/route.ts` | 改为：如果 invite.merchant_id 为空，创建 merchant |
| C5 | Admin Invite UI 要求 merchantId | `app/settings/invites/page.tsx` | owner/manager 类型只需 region |
| C6 | DB 无事件一致性约束 | - | 添加 trigger：events 必须 region_id == venue.region_id |
| C7 | 依赖 Google Places API 创建 venue | `POST /api/admin/venues` | 改为手填 address_line1 |
| C8 | regions.city 与 name 冗余 | `regions` 表 | 统一用 name 作为城市名 |
| C9 | regions.center_lat/lng 与 lat/lng 冗余 | `regions` 表 | 统一用 lat/lng（或 center_lat/lng，停止双写） |

---

## D. 移除/改造后会崩的点清单

### 🔴 必须修改（会 crash / 数据不一致）

| 文件路径 | 原因 |
|----------|------|
| `apps/internal-web/app/api/invite/consume/route.ts` | 第 312-336 行拒绝 merchant_id 为空的 invite；需改为创建 merchant |
| `apps/admin-web/app/api/admin/venues/route.ts` POST | 依赖 GOOGLE_MAPS_API_KEY，移除后 503；改为纯手填 |
| `apps/admin-web/app/api/admin/venues/[id]/route.ts` PUT | 同上，place_id 更新依赖 Google |
| `apps/admin-web/app/settings/venues/page.tsx` | PlaceAutocomplete 组件必填，移除后 UI 报错 |
| `apps/admin-web/app/events/new/page.tsx` | UI 需移除 region 下拉 |
| `apps/admin-web/app/events/[id]/edit/page.tsx` | 同上 |
| `apps/admin-web/app/settings/invites/page.tsx` | UI 需调整：owner/manager 只选 region，不选 merchant |
| `apps/admin-web/app/api/admin/invites/route.ts` POST | 第 506-528 行：owner/manager 强制 merchantId，需改为只需 regionId |
| `supabase/migrations/` | 需添加 events 一致性触发器 |

### 🟡 需要修改（功能降级但不 crash）

| 文件路径 | 原因 |
|----------|------|
| `apps/admin-web/app/settings/page.tsx` | Regional Config 使用 PlaceAutocomplete 填 center 点，需移除或改为可选手填 |
| `apps/customer-web/app/events/[id]/page.tsx` | 地址展示需改为 address_line1 + Region city/state |
| `apps/admin-web/lib/data/admin/dashboard.ts` | 销售按 region 统计无需改，但确保 JOIN 正确 |

### 🟢 可保留不改

| 文件路径 | 说明 |
|----------|------|
| `apps/customer-web/contexts/RegionContext.tsx` | 符合规格 |
| `apps/customer-web/lib/data/events.ts` | 按 region_id 过滤，符合规格 |
| `apps/customer-web/lib/data/regions.ts` | 符合规格 |

---

## E. 需要修改的 API 与页面清单

### 数据库 Migrations（按顺序）

| # | 文件名 | 目的 |
|---|--------|------|
| 1 | `027_region_venue_event_consistency.sql` | 统一约束 + 触发器：events.region_id 必须等于 venue.region_id 等于 merchant.region_id |
| 2 | `028_venues_address_cleanup.sql` | venues.address_line1 改为 NOT NULL（新记录）；停止写入 city/state/country |

### Admin-Web API

| API 路径 | 需要改动 |
|----------|----------|
| `POST /api/admin/invites` | owner/manager 类型移除 merchantId 必填 |
| `POST /api/admin/venues` | 移除 place_id 必填，改为 address_line1 必填；移除 region_id 手选 |
| `PUT /api/admin/venues/[id]` | 移除 place_id 解析依赖 Google |
| `POST /api/admin/events` | 移除 region_id 手选，自动继承 |
| `PUT /api/admin/events/[id]` | 同上 |

### Admin-Web Pages

| 页面路径 | 需要改动 |
|----------|----------|
| `app/settings/page.tsx` | Regional Config 移除 PlaceAutocomplete，只需 state 下拉 + city 输入 + is_active |
| `app/settings/venues/page.tsx` | 移除 region 下拉，移除 PlaceAutocomplete，改为 address_line1/address_line2 输入 |
| `app/settings/invites/page.tsx` | owner/manager 类型只选 region，不选 merchant |
| `app/events/new/page.tsx` | 移除 region 下拉 |
| `app/events/[id]/edit/page.tsx` | 移除 region 下拉 |

### Internal-Web API

| API 路径 | 需要改动 |
|----------|----------|
| `POST /api/invite/consume` | 如果 invite.merchant_id 为空，创建新 merchant（region_id = invite.region_id） |

### Customer-Web Pages

| 页面路径 | 需要改动 |
|----------|----------|
| `app/events/[id]/page.tsx` | 地址展示改为 `address_line1` + `Region.name, Region.state` |
| `app/wallet/page.tsx` | （可选）增强地址显示 |
| `components/EventGlassCard.tsx` | （可选）增强地址显示 |

---

## F. 改造计划（高层概览）

### Phase 1: 数据库迁移
1. 创建新 migration：events 一致性触发器
2. 修改 venues.address_line1 为 NOT NULL（仅新记录）
3. 回填/审计现有数据

### Phase 2: Admin-Web 改造
1. 简化 Regional Config（移除 Google 依赖）
2. Invite 创建：owner/manager 只需 region
3. Venue 创建：移除 region 下拉 + PlaceAutocomplete
4. Event 创建/编辑：移除 region 下拉

### Phase 3: Internal-Web 改造
1. Consume Invite：支持创建新 Merchant

### Phase 4: Customer-Web 改造
1. 地址展示：JOIN region 获取 city/state

### Phase 5: 自测
1. 全流程自测（invite → merchant → venue → event → customer 浏览）
2. 验证一致性约束

---

## 确认后继续

请确认此报告内容后，我将：
1. 编写并应用数据库迁移
2. 逐个修改 Admin-Web / Internal-Web / Customer-Web 代码
3. 输出自测 Checklist

是否继续执行第 2 步（数据库迁移）？
