# Weekly Schedule 售票系统重构 - 实现计划

> 生成时间：2026-01-26T01:30:00  
> 状态：**进行中**

---

## ✅ 已完成

### Part A: 修复 500 错误

| 项目 | 状态 | 文件 |
|------|------|------|
| DB 触发器修复 | ✅ 完成 | `supabase/migrations/029_fix_event_venue_null.sql` |
| API 错误处理 | ✅ 完成 | `apps/admin-web/app/api/admin/merchants/[id]/events/route.ts` |

**改动详情**：
- 触发器 `set_event_region_from_venue` 现在允许 `venue_id = NULL`（draft 状态）
- 当 `venue_id = NULL` 时，使用 `merchant.region_id`
- API 捕获触发器异常，返回 400 而不是 500

### Part B: Weekly Schedule 系统

| 项目 | 状态 | 文件 |
|------|------|------|
| 数据库迁移 | ✅ 完成 | `supabase/migrations/030_weekly_schedule_system.sql` |
| Weekly Rules API | ✅ 完成 | `apps/admin-web/app/api/admin/events/[id]/weekly-rules/route.ts` |
| Ticket Prices API | ✅ 完成 | `apps/admin-web/app/api/admin/ticket-types/[id]/prices/route.ts` |

**新增表**：
- `event_weekly_rules` - 活动的周一到周日售票规则
- `ticket_type_prices` - 票种按天定价

**新增字段**：
- `events.schedule_mode` - 调度模式：single/weekly/custom
- `events.timezone` - 活动默认时区
- `tickets.valid_start_at/valid_end_at` - 票有效期
- `tickets.valid_for_date` - 票适用日期
- `tickets.purchased_day_of_week` - 购买时选择的星期几

**新增函数**：
- `calculate_ticket_validity(event_id, date, dow)` - 计算票有效期
- `is_ticket_valid_now(ticket_id)` - 检查票是否在有效期内
- `get_next_sale_date(event_id)` - 获取下一个可售日期

---

## 🔶 待完成

### Admin UI 改造

| 项目 | 文件 | 改动 |
|------|------|------|
| Create Event 页面 | `app/events/new/page.tsx` | 添加 Weekly Schedule 区块 |
| Edit Event 页面 | `app/events/[id]/edit/page.tsx` | 添加 Weekly Schedule 区块 |
| Ticket Type 编辑 | 同上 | 添加按天定价 UI |

**Weekly Schedule UI 规格**：
```
周一到周日 7 行，每行：
- 开关（is_on_sale）
- 开始时间（valid_from_time）
- 结束时间（valid_to_time）
- 跨天提示（自动计算）
```

**票种按天定价 UI**：
```
每个票种可展开显示 7 天定价：
- 周X enabled | $XX.XX | 库存限制（可选）
```

### Customer-Web 兼容

| 项目 | 文件 | 改动 |
|------|------|------|
| 活动列表 | `app/page.tsx` | 显示"下一场"或"今日可售" |
| 购买流程 | `app/checkout/page.tsx` | 选择日期 → 计算票有效期 |
| 验票 | `app/api/redeem/route.ts` | 检查票有效期 |

### Internal-Web 兼容

| 项目 | 文件 | 改动 |
|------|------|------|
| 扫码验票 | Scanner 组件 | 调用 `is_ticket_valid_now()` |

---

## 📋 验收用例（15 条）

### Part A: 修复 500

1. ✅ **Draft 无 venue 可保存**：创建活动 → 不选 venue → 保存草稿 → 成功
2. ✅ **Draft 保存不报 500**：创建活动 → 保存草稿 → 返回 2XX 或 400（非 500）
3. ✅ **Publish 无 venue 阻止**：创建活动 → 不选 venue → 发布 → 提示"Venue required"
4. ✅ **Publish 有 venue 成功**：创建活动 → 选 venue → 发布 → 成功
5. ✅ **Region 自动继承**：发布的活动 → event.region_id == venue.region_id

### Part B: Weekly Schedule

6. ⏳ **创建 Weekly 活动**：schedule_mode = weekly → 保存成功
7. ⏳ **设置周期规则**：周五周六开放 → 保存 → 查询返回正确规则
8. ⏳ **设置票种按天定价**：周五 $30，周六 $40 → 保存成功
9. ⏳ **购票选择日期**：选择本周五 → 票的 valid_for_date = 正确日期
10. ⏳ **票有效期计算**：购买周五票 → valid_start_at/end_at 正确
11. ⏳ **过期票不可核销**：票已过有效期 → 扫码显示"expired"
12. ⏳ **有效票可核销**：票在有效期内 → 扫码成功
13. ⏳ **下一场日期显示**：活动设置周五周六 → 列表显示"Next: Friday"
14. ⏳ **跨天时间正确**：22:00-04:00 → is_overnight = true
15. ⏳ **时区处理**：LA 时区活动 → 票有效期为 LA 本地时间

---

## 🔧 下一步

1. **实现 Admin UI**：Weekly Schedule 区块 + 票种按天定价
2. **实现 Customer 购买流程**：日期选择 → 计算有效期
3. **实现 Internal 验票**：检查票有效期
4. **端到端测试**
