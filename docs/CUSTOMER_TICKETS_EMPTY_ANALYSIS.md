# 顾客端「售票显示为空」原因分析

## 现象

活动详情页底部显示 **"No tickets available"**，没有日期选择也没有票种列表。

## 显示逻辑（前端）

- 文件：`apps/customer-web/app/events-v2/[id]/page.tsx`
- 数据来源：`weekConfig.days` 来自接口 `GET /api/public/events-v2/[id]/upcoming-days?limit=3`
- 文案出现条件：**`enabledDays.length === 0`**，即 `weekConfig.days` 为空数组

```ts
const enabledDays = weekConfig?.days || [];
// ...
{enabledDays.length === 0 ? (
  <div className="text-center py-12 text-gray-400">
    <p>No tickets available</p>
  </div>
) : ...}
```

因此「显示为空」等价于：**upcoming-days 返回的 `days` 为空**。

---

## 后端：`days` 何时为空

接口：`apps/customer-web/app/api/public/events-v2/[id]/upcoming-days/route.ts`

逻辑概要：

1. 校验活动存在且状态为 `active` 或 `paused`。
2. 按周循环（最多 6 周），每周调用 RPC `rpc_get_or_create_event_week(event_id, for_date, timezone)`。
3. 对每周返回的 `result.days` 做过滤：
   - 只保留 **`day.enabled === true`** 的日期；
   - 只保留 **结束时间晚于当前时间** 的日期（`new Date(endIso) > now`）；
   - 每个日期下只保留 **`status === 'active'`** 的票种。
4. 将符合条件的日期放入 `accumulatedDays`，最多 `limit` 条（默认 3），最后按日期排序返回。

因此 **`days` 为空** 的可能原因如下。

---

## 可能原因（按常见程度）

### 1. 活动周未配置「可售日期」（最常见）

- **含义**：该活动在 `event_weeks` 下有周，但对应 `event_week_days` 里**没有把任何一天设为启用**（`enabled = false`）。
- RPC 行为：
  - 若该周已存在：从 DB 读 `event_week_days`，只有 `enabled = true` 的会出现在返回的 `days` 里。
  - 若该周不存在：会**新建一周**，且新建的 7 天**默认全是 `enabled = false`**（见 migration 中 `v_enabled BOOLEAN := false`），因此新周不会产生任何可售日。
- **结果**：接口里所有 `day.enabled` 都被过滤掉，`days` 为空 → 前端显示 "No tickets available"。

**建议排查：**

- 在 Internal/Admin 打开该活动的「周配置」或「Event Week」：
  - 确认至少有一周的**至少一天**被勾选/启用（enabled）。
- 或直接查库：
  - `event_weeks` 中该 `event_id` 的周；
  - `event_week_days` 中对应 `event_week_id` 且 `enabled = true` 的记录。

---

### 2. 所有「未结束」的日期都已过期

- **含义**：接口只保留「结束时间 > 当前时间」的日期。若当前时间已超过所有配置的结束时间，这些日期都会被过滤掉。
- 结束时间由 `day.date` + `day.end_time` + `day.end_next_day` 和时区 `America/New_York` 计算得到。
- **可能情况**：
  - 活动只配置了「本周」几天，且当前时间已过当晚结束时间（如 02:00 next day）；
  - 服务器时区与预期不一致，导致 `endIso` 或 `now` 计算偏差，所有日期被误判为已结束。

**建议排查：**

- 在 Internal 为该活动多配置几周，或至少确保「今天/明天」有 enabled 的日期；
- 在接口中临时打日志，看 `endIso` 与 `now` 的值，确认时区与「未结束」判断是否符合预期。

---

### 3. RPC 报错或返回空

- **含义**：若 `rpc_get_or_create_event_week` 报错或返回 `rpcResult.length === 0`，该周会被跳过；若连续几周都如此，`accumulatedDays` 会一直为空。
- **可能原因**：权限、表缺失、函数版本不一致等。

**建议排查：**

- 看接口或服务端日志是否有 RPC 报错；
- 在 Supabase SQL Editor 直接调用：
  `SELECT * FROM rpc_get_or_create_event_week('<event_id>'::uuid, current_date, 'America/New_York');`
  看是否返回一行且 `days` 非空。

---

### 4. 活动状态不是 active/paused

- **含义**：接口要求 `events_v2.status IN ('active','paused')`，否则直接 404，前端会走错误态而不是「无票」。
- 你当前现象是「No tickets available」而不是报错，说明接口 200 且返回了 `days: []`，通常不是这一条；但若后续改成「活动不存在也返回空列表」，则需再确认 status。

---

## 快速自检清单

| 检查项 | 方法 |
|--------|------|
| 活动是否有周 | 查 `event_weeks` 表，`event_id = 该活动 id` |
| 是否有启用日 | 查 `event_week_days`，对应 `event_week_id` 且 `enabled = true` |
| 是否有票种 | 查 `ticket_types_v2`，对应 `event_week_day_id` 且 `status = 'active'` |
| 接口实际返回 | 浏览器 Network：`/api/public/events-v2/<id>/upcoming-days?limit=3` 看响应 JSON 里 `days` 是否为空 |
| 时间是否全过期 | 同上，看接口逻辑或加日志确认 `endIso` 与 `now` |

---

## 结论与建议

- **直接原因**：前端拿到的 `weekConfig.days` 为空，所以显示 "No tickets available"。
- **根本原因**：在绝大多数情况下是 **该活动没有配置任何「可售日期」**（没有 enabled 的 `event_week_days`），或 **可售日期在接口里都被判为已结束**。
- **建议操作**：
  1. 在 Internal/Admin 为该活动配置至少一周，并**启用至少一天**（enabled）；
  2. 为该天配置至少一个 `status = 'active'` 的票种；
  3. 若仍为空，再按上表查 DB 与接口返回、以及时间/时区逻辑。
