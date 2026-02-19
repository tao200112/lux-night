# Admin Approval（event-change-requests）修复自检报告

**执行日期**: 2026-02-18  
**阶段**: 1（自检，不改代码）

---

## 1) admin-gray-beta 域名指向

### 检查结果

| 检查项 | 结论 |
|--------|------|
| **vercel.json** | `apps/admin-web/vercel.json` 与 `apps/internal-web/vercel.json` 仅定义 buildCommand/outputDirectory，无项目名/域名 |
| **项目名** | 仓库中无 "admin-gray-beta" 字符串 |
| **Root Dir** | Vercel 项目根目录在 Vercel Dashboard 配置，代码库无法读取 |

### 结论

**admin-gray-beta 的 Root Dir 无法从代码库确定**，需在 Vercel Dashboard 中查看：
- Project Settings → General → Root Directory
- 若为 `apps/admin-web` → admin-web
- 若为 `apps/internal-web` → internal-web

根据命名惯例（admin 前缀），**推测 admin-gray-beta ≈ admin-web**。

---

## 2) Approve 404 复现

### 请求信息（从代码推导）

| 场景 | 页面 URL | 请求 | 状态 |
|------|----------|------|------|
| **internal-web** | `/admin/event-change-requests` | `POST /api/admin/event-change-requests/{id}/approve` | API 在 internal-web 存在，理论上可成功 |
| **admin-web** | `/approvals` | `POST /api/admin/approvals/{id}/approve` | **404**：见下节根因 |

### 404 触发链路

1. 用户访问 admin-web `/approvals`
2. 列表由 `GET /api/admin/approvals` 拉取（查询 `merchant_change_requests`）→ 正常
3. 用户点击 Approve → `POST /api/admin/approvals/{id}/approve`
4. API 内部：
   - `admin-web/app/api/admin/approvals/[id]/approve/route.ts` 第 60–64 行
   - 使用 `adminClient.from('event_change_requests').select(...).eq('id', requestId).single()`
5. 表 `event_change_requests` 已在 migration `20260127210000_drop_legacy_tables.sql` 中 **DROP**
6. 查询失败 → `fetchError` 有值，`changeRequest` 为 null → 返回 **404**，`message: 'Change request not found'`

### 请求详情（admin-web approvals approve）

| 字段 | 值 |
|------|-----|
| **完整 URL** | `{origin}/api/admin/approvals/{id}/approve` |
| **Method** | POST |
| **Body** | `{ "note": "" }` |
| **响应** | 404 |
| **响应 body** | `{ ok: false, error: 'Not Found', code: 'NOT_FOUND', message: 'Change request not found', step, debug }` |

---

## 3) event-change-requests 存在性矩阵

### internal-web

| 类型 | 路径 | 存在 | 说明 |
|------|------|------|------|
| 页面 | `/admin/event-change-requests` | ✅ | `app/admin/event-change-requests/page.tsx` |
| 列表 API | `GET /api/admin/event-change-requests` | ✅ | `app/api/admin/event-change-requests/route.ts` |
| Approve API | `POST /api/admin/event-change-requests/[id]/approve` | ✅ | `app/api/admin/event-change-requests/[id]/approve/route.ts` |
| Reject API | `POST /api/admin/event-change-requests/[id]/reject` | ✅ | `app/api/admin/event-change-requests/[id]/reject/route.ts` |
| 鉴权 | `admin_users` + Supabase service role | ✅ | `requireAdmin()` 查 admin_users |

### admin-web

| 类型 | 路径 | 存在 | 说明 |
|------|------|------|------|
| 页面 | `/admin/event-change-requests` | ❌ 缺失 | 无此路由 |
| 页面 | `/approvals` | ✅ | 审批中心（使用 approvals API） |
| 页面 | `/change-requests` | ✅ | 修改申请（使用 change-requests API） |
| event-change-requests API | `GET/POST /api/admin/event-change-requests/*` | ❌ 缺失 | 无此 API |
| approvals API | `GET /api/admin/approvals` | ✅ | 查 `merchant_change_requests` |
| approvals approve | `POST /api/admin/approvals/[id]/approve` | ⚠️ 有 BUG | 查/写 `event_change_requests`（已删表） |
| change-requests API | `GET /api/admin/change-requests` | ✅ | 查 `merchant_change_requests`，含 before_snapshot |

### 小结

- **internal-web**：event-change-requests 页面 + API 齐全，且使用 `merchant_change_requests`
- **admin-web**：
  - 无 event-change-requests 页面/API
  - approvals approve/reject 仍用已删的 `event_change_requests` → 导致 404
  - change-requests 使用 `merchant_change_requests`，逻辑正确

---

## 4) “看不到修改细节” 根因

### 表结构

| 表 | 列 | 来源 |
|----|-----|------|
| `merchant_change_requests` | `payload` (JSONB) | 034_event_week_ticketing_v2.sql |
| `merchant_change_requests` | `before_snapshot` (JSONB) | 20260218120000_add_before_snapshot_to_merchant_change_requests.sql |

`merchant_change_requests` 支持 changes 和 before_snapshot。

### 写入情况

| 提交入口 | 表 | payload | before_snapshot |
|----------|-----|---------|-----------------|
| `/api/events/[id]/change-requests`（周配置） | merchant_change_requests | ✅ | ✅ 提交前拉取 event_week 写入 |
| `/api/merchant/event-change-requests`（价/库存/海报等） | merchant_change_requests | ✅ | ❌ 未写入 |

### 读取与展示

| 端 | API | 是否 select before_snapshot | 是否 select payload | UI 展示 |
|----|-----|----------------------------|---------------------|---------|
| internal-web event-change-requests | `/api/admin/event-change-requests` | ❌ 未选 | ✅ | 只展示 payload（after），无 before/after diff |
| admin-web approvals | `/api/admin/approvals` | ❌ 未选 | ✅ | 不展示 payload，无 “View Changes” |
| admin-web change-requests | `/api/admin/change-requests` | ✅ 通过 `select('*')` | ✅ | WeekConfigDiff，有 before vs after |

### 结论：缺的是“数据”还是“展示”

| 问题 | 根因 |
|------|------|
| **internal-web 看不到 diff** | 缺“展示”：API 未返回 before_snapshot；UI 无 before/after diff，只展示 payload |
| **admin-web approvals 看不到修改** | 缺“展示”：API 返回 payload 但不返回 before_snapshot；UI 不渲染 payload，无 “View Changes” |
| **price/inventory/poster 类型** | 缺“数据”：提交时未写 before_snapshot，后端无 before 可对比 |

---

## 5) Root Cause 汇总

### 404 原因

**admin-web approvals approve/reject 仍使用已删除的 `event_change_requests` 表**：

- `apps/admin-web/app/api/admin/approvals/[id]/approve/route.ts`：第 62 行 fetch、第 392 行 update
- `apps/admin-web/app/api/admin/approvals/[id]/reject/route.ts`：第 70 行 update
- 表在 migration `20260127210000` 中已 DROP，查询失败 → 返回 404

### Diff 缺失原因

1. **数据**：price/inventory/poster 提交未写 `before_snapshot`
2. **API**：internal-web、admin-web approvals 均未 select `before_snapshot`
3. **展示**：admin-web approvals 不展示 payload，无 “View Changes”

---

## 6) 推荐方案三选一

### 方案 A) admin-web 跳转 internal-web 完成审批（最快）

**思路**：在 admin-web 添加链接，跳转到 internal-web 的 event-change-requests 审批页。

| 步骤 | 说明 |
|------|------|
| 1 | 在 admin-web Approvals 或侧边栏增加 “Event Change Requests” 入口 |
| 2 | 入口链接指向 internal-web 部署的 `/admin/event-change-requests`（可配置 NEXT_PUBLIC_INTERNAL_WEB_URL） |
| 3 | 确保 internal-web 部署可被 admin-web 用户访问（同域名/SSO 或共享 session） |

**优点**：改动小，不改 approvals API  
**缺点**：跨域/跨应用，需处理 session 和鉴权

---

### 方案 B) admin-web 增加 event-change-requests API + UI（推荐统一后台）

**思路**：在 admin-web 补齐 event-change-requests 能力，并修复 approvals 的 approve/reject。

| 步骤 | 说明 |
|------|------|
| 1 | 修复 approvals approve/reject：改为使用 `merchant_change_requests`，列名用 `reviewed_by_admin`、`reviewed_at`、`review_note` |
| 2 | 修复 approvals counts：改为从 `merchant_change_requests` 统计，不再查 `event_change_requests` |
| 3 | 可选：新增 `/api/admin/event-change-requests` 列表、approve、reject 路由（若希望与 internal-web 路径一致） |
| 4 | approvals 页：增加 “View Changes” drawer，展示 payload 及 before_snapshot 的 diff |
| 5 | approvals API：select 增加 `before_snapshot` |
| 6 | price/inventory/poster 提交：在 `/api/merchant/event-change-requests` 写入 `before_snapshot`（或提供回退方案：无 before 时显示 payload 内容） |

**优点**：统一在 admin-web 审批，API 和 UI 一致  
**缺点**：改动较多，需完整测试

---

### 方案 C) 仅修复 approvals API，不增加 event-change-requests 路由

**思路**：只修 approvals approve/reject，不新增 event-change-requests 页面/API。

| 步骤 | 说明 |
|------|------|
| 1 | approvals approve：`event_change_requests` → `merchant_change_requests`，`payload_json` → `payload`，`approved_by` → `reviewed_by_admin`，`approved_at` → `reviewed_at` |
| 2 | approvals reject：同上，`rejection_reason` → `review_note` |
| 3 | approvals counts：`event_change_requests` → `merchant_change_requests` |
| 4 | approvals API GET：select 增加 `before_snapshot` |
| 5 | approvals 页：增加 “View Changes” drawer，显示 payload 与 before_snapshot 的 diff |

**优点**：改动集中在 approvals，不动路由结构  
**缺点**：仍需实现 approve 逻辑（参考 change-requests approve 或 internal-web approve），否则只更新状态不应用配置

---

## 7) 各方案实现步骤清单

### 方案 A

1. 配置 `NEXT_PUBLIC_INTERNAL_WEB_URL`
2. 在 admin-web 添加 “Event Change Requests” 入口，指向 internal-web `/admin/event-change-requests`
3. 确认 internal-web 的 admin 鉴权与 admin-web 一致或可互通

### 方案 B（推荐）

1. 修改 `approvals/[id]/approve/route.ts`：用 `merchant_change_requests` 和正确列名，实现 approve 逻辑
2. 修改 `approvals/[id]/reject/route.ts`：同上
3. 修改 `approvals/route.ts`：counts 改为 `merchant_change_requests`，select 增加 `before_snapshot`
4. 在 approvals 页增加 “View Changes” drawer，展示 payload 与 before_snapshot diff
5. 在 `/api/merchant/event-change-requests` 中写入 `before_snapshot`（按 request_type 拉取当前配置）
6. 可选：admin-web 新增 `/api/admin/event-change-requests` 系列 API 以对齐 internal-web

### 方案 C

1. 修改 approvals approve/reject 使用 `merchant_change_requests` 和正确列名
2. 修改 approvals counts 使用 `merchant_change_requests`
3. 在 approvals approve 中实现“应用 payload”逻辑（参考 change-requests approve）
4. approvals API GET 增加 `before_snapshot`
5. approvals 页增加 “View Changes” drawer

---

## 8) 验收用例（方案 B 或 C 实施后）

| 用例 | 预期 |
|------|------|
| Approve 成功 | request 状态变为 approved，event 配置按 payload 更新 |
| Reject 成功 | request 状态变为 rejected，review_note 记录原因 |
| UI 看到修改细节 | 能展示具体变更（before vs after，或至少 payload 内容） |
| 周配置类型 | 能展示 days diff（若有 before_snapshot） |
| price/inventory/poster 类型 | 能展示 payload，若补写 before_snapshot 则能 diff |

---

请回复 **"OK + 选方案 A/B/C"**，确认后再进入阶段 2 修改。

---

## 阶段 2 修复记录

**执行日期**: 2026-02-18  
**采用方案**: B

### 0) 统一数据模型

| 项目 | 值 |
|------|-----|
| **DB 表名** | `merchant_change_requests` |
| **payload/changes** | `payload` |
| **before_snapshot** | `before_snapshot` |
| **status** | `status` |
| **type** | `request_type` |
| **target_id** | `event_id` + `target_week_start_date` |
| **approved_by** | `reviewed_by_admin` |
| **approved_at** | `reviewed_at` |
| **rejection_reason** | `review_note` |

新增类型定义：`apps/admin-web/lib/types/merchant-change-request.ts`

### 1) 改动点

| 文件 | 改动 |
|------|------|
| `apps/admin-web/app/api/admin/approvals/[id]/approve/route.ts` | 改为从 `merchant_change_requests` 读写；实现 week_config、poster、price、inventory、event_edit 的应用逻辑；使用 `reviewed_by_admin`、`reviewed_at`、`review_note` |
| `apps/admin-web/app/api/admin/approvals/[id]/reject/route.ts` | 改为 `merchant_change_requests`，`review_note`、`reviewed_by_admin`、`reviewed_at` |
| `apps/admin-web/app/api/admin/approvals/route.ts` | counts 改为 `merchant_change_requests`；select 增加 `payload`、`before_snapshot`、`request_type`、`target_week_start_date`、`submitted_by`；`events:event_id` → `events_v2:event_id`；响应增加 `beforeSnapshot`、`targetWeekStartDate` |
| `apps/admin-web/app/(admin)/approvals/page.tsx` | 增加 “View Changes” 按钮和 Drawer；Diff 表格（Field / Before / After）；Drawer 内 Approve/Reject 按钮；404/409/500 错误提示 |
| `apps/internal-web/app/api/merchant/event-change-requests/route.ts` | 提交时根据 request_type 拉取当前数据写入 `before_snapshot` |

### 2) 验收步骤

1. **Merchant 提交**：在 internal-web 提交 event/week_config 或 price/inventory/poster 变更
2. **Admin 列表**：admin-web Approval Center 能看到 pending
3. **View Changes**：点击 View Changes 弹出 Drawer，能看 Field / Before / After 或 payload JSON
4. **Approve**：点击 Approve → Network 200 → request 状态变为 approved → 目标表已更新 → 列表刷新
5. **Reject**：点击 Reject 输入原因 → Network 200 → request 状态变为 rejected → 目标数据不变
6. **幂等**：已 approve/reject 的请求再次 approve 返回 409
7. **404**：不存在的 id 返回 404

### 3) 已知限制

- `request_type` 为 `general` 时 approve 按 `event_edit` 处理
- 周配置 diff 需 `before_snapshot` 存在；price/inventory/poster 需提交时写入（已修复）
- 若 `before_snapshot` 为空，Drawer 仅展示 payload JSON
