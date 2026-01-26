# Admin Region / Venue 表格化选择与验收说明

## 一、改动的文件（仅 apps/admin-web，customer-web 最小兼容）

### admin-web
- `lib/usStates.ts` — 新建，50 州缩写+名称
- `lib/places.ts` — 未改，继续用 `getPlaceDetails`、`slugFromName`
- `app/api/admin/regions/route.ts` — GET 扩展（city, slug, status, is_active, center_*），新增 POST（country/state/city/name/center）
- `app/api/admin/regions/[id]/route.ts` — 新建，GET / PUT（state, city, name, status, center_*）
- `app/api/admin/regions/cities/route.ts` — 新建，GET ?state=&country= 返回 DB 已有 city 列表
- `app/api/admin/places/autocomplete/route.ts` — 新建，admin 鉴权，?input=&types=cities|address，无 key 时 503
- `app/api/admin/places/details/route.ts` — 新建，POST { place_id }，admin 鉴权，无 key 时 503
- `app/api/admin/places/status/route.ts` — 新建，GET 返回 { configured: boolean }
- `app/api/admin/settings/route.ts` — 响应增加 `hasPlacesKey`
- `app/api/admin/venues/route.ts` — GET 增加 formatted_address、?region_id=，返回 address = formatted_address ?? address
- `app/api/admin/venues/[id]/route.ts` — 未改
- `components/PlaceAutocomplete.tsx` — 增加 `types`（cities|address）、`autocompleteUrl`，默认 `/api/admin/places/autocomplete`
- `components/CitySelect.tsx` — 新建，方式 A：DB cities 下拉；方式 B：无数据时「Select city center (Google)」
- `app/settings/page.tsx` — Region：Country/State/City 表格化、Add/Edit 弹窗、列表 City+State、Edit 含 Status；hasPlacesKey 禁用/提示
- `app/settings/venues/page.tsx` — hasPlacesKey、Place 必选、无 key 时禁用提交并提示；列表展示 formatted_address，line-clamp-2

### customer-web（只做必要兼容）
- `app/events/[id]/page.tsx` — 地址行加 `line-clamp-2`；`venue.address` 已由 `getEvent` 用 `formatted_address ?? address` 填充
- `lib/data/events.ts` — 未改，已使用 formatted_address ?? address
- `components/EventGlassCard.tsx` — 未改，已有 line-clamp-2，address 来自 data 层

### 脚本与文档
- `scripts/reset_test_data.sql` — 删除名称含 "Test" 的 merchant 及其 venues/events/orders 等
- `scripts/backfill_region_venue.sql` — address → formatted_address、region.city 回填
- `docs/ADMIN_REGION_VENUE_VERIFICATION.md` — 本文件

---

## 二、执行顺序（测试环境）

1. **db push**（如有新迁移）  
   `npx supabase db push`

2. **reset 测试数据**（可选）  
   `psql $DATABASE_URL -f scripts/reset_test_data.sql`

3. **backfill 旧数据**  
   `psql $DATABASE_URL -f scripts/backfill_region_venue.sql`

4. **用 Admin 新流程创建**  
   - Settings → Regional Config → Add：Country=US，State 下拉，City 下拉或「Select city center (Google)」，Display name、可选 City center (Place)，保存  
   - Settings → Venues → Add：name、merchant、region、Address 用 Place 搜索必选，保存

---

## 三、验收清单（自检）

| 项 | 如何验证 |
|----|----------|
| Region 列表用新 API | Settings 的 regions 来自 `/api/admin/settings`（含 hasPlacesKey），列表展示 city, state |
| Add Region 必须 state/city 选择 | 打开 Add，State 为下拉，City 为下拉或「Select city center (Google)」，无自由输入 city/state |
| 无 GOOGLE_MAPS_API_KEY 时禁用并提示 | 去掉 key 后：Region 的「Select city center (Google)」和可选 City center 不提供或提示；Venues 的 Address 提示「GOOGLE_MAPS_API_KEY not configured」，Save 禁用 |
| Add Venue 必须 Place 选择并写入 place_id/formatted_address/lat/lng | Add Venue 时 Address 必选 Place；保存后列表与详情有 formatted_address，且 DB 有 place_id、lat、lng |
| customer-web 地址不破版 | 活动卡片、详情页地址 `line-clamp-2`，`formatted_address ?? address` 在 data 层已完成 |
| region 切换后 events 过滤正确 | 顾客端切 region 后，`getEvents(regionId)` 按 `events.region_id` 过滤，列表随 region 变化 |

---

## 四、API 汇总（admin 鉴权）

- `GET /api/admin/regions` — 列表，?all=1 返回全部
- `POST /api/admin/regions` — 创建：{ country, state, city, name?, center_lat?, center_lng? }
- `GET /api/admin/regions/[id]` — 单条
- `PUT /api/admin/regions/[id]` — 更新：{ state?, city?, name?, status?, center_lat?, center_lng? }
- `GET /api/admin/regions/cities?state=&country=` — 可选 city 列表
- `GET /api/admin/places/autocomplete?input=&types=cities|address` — 无 key 时 503
- `POST /api/admin/places/details` { place_id } — 无 key 时 503
- `GET /api/admin/places/status` — { configured: boolean }
- `GET /api/admin/venues?region_id=` — 列表，含 formatted_address
- `POST /api/admin/venues` — { name, merchant_id, region_id, place_id } 必填
- `PUT /api/admin/venues/[id]` — { name?, address_line2?, place_id? }
