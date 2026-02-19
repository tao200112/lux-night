# 阶段 1：Admin Approval Center 变更明细诊断（只读）

## 1) Findings（数据链路、字段现状、Admin Query/UI 现状）

### A) 请求数据来源

| 入口 | 路径 | 行号 | 说明 |
|-----|------|------|------|
| Admin Portal（admin-web）Approval Center | `apps/admin-web/app/(admin)/approvals/page.tsx` | L65-86 | 拉取 approvals 列表 |
| Admin API（Approval Center 列表） | `apps/admin-web/app/api/admin/approvals/route.ts` | L94-119 | 查询 `merchant_change_requests`，select 包含 `payload` |
| Admin Portal Change Requests | `apps/admin-web/app/(admin)/change-requests/page.tsx` | L60, L86-109 | 拉取 change-requests 列表并 Approve/Reject |
| Admin API（Change Requests） | `apps/admin-web/app/api/admin/change-requests/route.ts` | L22-42 | 查询 `merchant_change_requests`，select `*`（含 payload） |
| Internal-web Admin Event Change Requests | `apps/internal-web/app/admin/event-change-requests/page.tsx` | L58-69, L80-126 | 拉取 internal admin 列表 |
| Internal Admin API | `apps/internal-web/app/api/admin/event-change-requests/route.ts` | L56-82 | 查询 `merchant_change_requests`，select 包含 `payload`，映射为 `payload_json` |

### B) Merchant 提交位置

| 提交入口 | 路径 | 行号 | 写入表 | Payload 结构 |
|---------|------|------|--------|-------------|
| 活动周配置 Request Changes | `apps/internal-web/app/events-v2/[id]/request-change/page.tsx` | L110-122 | `merchant_change_requests`（经由 API） | 见下方 |
| API 写入 | `apps/internal-web/app/api/events-v2/[id]/change-requests/route.ts` | L62-74 | `merchant_change_requests` | 同上 |

**Payload 结构（Week Config）：**
```json
{
  "week_start_date": "2026-02-15",
  "days": {
    "0": {
      "enabled": false,
      "start_time": "16:00",
      "end_time": "02:00",
      "end_next_day": true,
      "tickets": [{ "id": "...", "name": "cover(21+)", "category": "entry", "price_cents": 1000, "action": "upsert", ... }]
    },
    "3": { "enabled": true, "start_time": "16:00", "end_time": "02:00", "end_next_day": true, "tickets": [...] }
  }
}
```

### C) 数据库表

| 表名 | 关键字段 | 是否存储变更详情 |
|-----|---------|-----------------|
| `merchant_change_requests` | `payload` (JSONB) | ✅ 存 proposed config（整份 after） |
| `merchant_change_requests` | `target_week_start_date`, `note`, `status`, `review_note` | - |
| `merchant_change_requests` | `before_snapshot` / `payload_before` | ❌ 无 |
| `event_change_requests` | - | ❌ 已 DROP（migration 027） |
| `requests` | `payload_before`, `payload_after` | 另一套 schema，非 merchant 周配置 |

### D) Admin Query / UI 现状

| 页面 | 是否 select payload | 是否渲染 payload | 是否渲染 diff |
|-----|---------------------|------------------|---------------|
| admin-web Approvals | ✅ (route L100) | ❌ 卡片仅显示 event/merchant/status，无 payload 展示 | ❌ |
| admin-web Approvals 详情 | N/A | N/A | 详情 API 查 `requests` 表，非 merchant_change_requests |
| admin-web Change Requests | ✅ (select *) | ✅ 以 raw JSON 在 collapsible 中展示 | ❌ 仅 raw JSON，无 before/after diff |
| internal-web admin event-change-requests | ✅ (payload→payload_json) | ⚠️ 只渲染 title/poster_url/ticket_type_id 等字段 | ❌ 周配置 payload 为 days 结构，UI 无对应分支，Changes 区域为空 |

---

## 2) Root Cause（根因）

1. **admin-web Approval Center**：API 已返回 `payload`，但列表卡片**完全没有渲染 payload**，也没有「查看详情」入口，只能看到 Approve/Reject。
2. **internal-web admin event-change-requests**：UI 按 event_edit / price_change / inventory_change / poster_change 的 schema 渲染，而周配置提交的是 `{ week_start_date, days }`，**结构与现有渲染逻辑不匹配**，导致 Changes 区域为空。
3. **缺少 before 数据**：`merchant_change_requests` 只存 `payload`（proposed config），没有 `before_snapshot`，无法在 Admin 端直接展示 Before → After diff。

---

## 3) Proposed Data Model（推荐方案 1）

**沿用 `merchant_change_requests`，增加可选 before_snapshot：**

- `payload`：保持为 proposed/after config（JSONB）
- `before_snapshot`（可选，JSONB）：提交时写入当前周配置快照，Admin 端据此生成 diff
- 若暂不迁移，可通过读时拉取当前 event_week 配置作为 before，与 payload 做 diff

**字段设计：**

```
merchant_change_requests:
  - payload: JSONB (proposed config, 已有)
  - before_snapshot: JSONB (可选，提交时快照)
  - target_week_start_date: DATE
  - note: TEXT
  - status, reviewed_by_admin, reviewed_at, review_note, created_at, updated_at
```

**理由**：before + after 结构清晰，Admin 端易于按 Day 分组展示 diff，不依赖 patch 解析。

---

## 4) Proposed UI（列表 + 详情交互）

1. **列表**：卡片可点击进入详情页 / Drawer / Modal；卡片上展示简要变更摘要（如「3 天有变更，5 个票种」）。
2. **详情**：
   - 元信息：merchant、event、target_week、提交时间、note
   - 变更摘要：自动生成（改了哪几天、多少票种）
   - 明细 diff（按 Day 分组）：
     - `Enabled: false → true`
     - `Time: 16:00-02:00 → 17:00-02:30 (next day)`
     - Tickets：新增/删除/改价/改 limit/改名称/改 status
   - 在详情内操作 Approve / Reject，支持 optional reject reason

---

## 5) Fix Plan（将要改动的文件）

| 阶段 | 改动内容 |
|-----|---------|
| 1. 数据层 | 迁移：为 `merchant_change_requests` 添加 `before_snapshot` 列（可选）；或在提交时写入 before_snapshot |
| 2. Merchant 提交 | `apps/internal-web/app/api/events-v2/[id]/change-requests/route.ts`：提交前拉取当前 event_week 配置，写入 `before_snapshot` |
| 3. Admin API | `apps/admin-web/app/api/admin/change-requests/route.ts`：确保返回 `payload`、`before_snapshot`；或新增 detail API 返回 before（从 DB 或实时拉取）+ after |
| 4. Admin UI | `apps/admin-web/app/(admin)/change-requests/page.tsx`：增加详情 Modal/Drawer，渲染 week/day/ticket diff |
| 5. internal-web Admin | `apps/internal-web/app/admin/event-change-requests/page.tsx`：为 `payload.days` 增加渲染分支，展示周配置 diff |
| 6. Approve 流程 | 已有 `apps/admin-web/app/api/admin/change-requests/[id]/approve/route.ts` 能应用 payload，保持不变 |

**是否迁移**：是，添加 `before_snapshot` 列（nullable）。  
**是否回填历史**：否，历史请求可仅展示 proposed config，或读时拉取当前配置作为 before。

---

## 6) Test Plan（E2E）

1. **Merchant 提交**：在 events-v2 Request Change 页修改某周配置（启用/禁用日、时间、票种价格/limit），提交。
2. **Admin 查看 diff**：在 Approval Center / Change Requests 打开该请求详情，确认能看到按 Day 分组的 diff（Enabled、Time、Tickets 变更）。
3. **Admin Approve**：点击 Approve，确认 event_week 和 ticket_types_v2 已按 payload 更新。
4. **Merchant 端生效**：Merchant 端活动周配置页面刷新后，显示新配置。
5. **Admin Reject**：新建一条请求，Reject 并填写原因；Merchant 端可见 REJECTED 及 review_note。
6. **Console / 网络**：无报错，数据流完整。
