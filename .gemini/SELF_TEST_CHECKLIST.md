# 地区/地址体系重构 - 完成报告

> 生成时间：2026-01-26T01:00:00-05:00
> 状态：**✅ 全部完成**

---

## ✅ 完成的改造

### 数据库迁移（✅ 已应用）

| 文件 | 状态 | 目的 |
|------|------|------|
| `supabase/migrations/027_region_venue_event_consistency.sql` | ✅ 已应用 | Events 一致性触发器 + Venues address_line1 必填 |
| `supabase/migrations/028_backfill_and_audit.sql` | ✅ 已应用 | 回填 region_id + 审计脚本 |
| `scripts/audit_region_consistency.sql` | ✅ 已创建 | 独立审计查询脚本 |

### Admin-Web API（✅ 全部完成）

| API | 状态 | 改动 |
|-----|------|------|
| `POST /api/admin/invites` | ✅ 已修改 | owner/manager 类型不再强制 merchantId |
| `POST /api/admin/venues` | ✅ 已修改 | 移除 Google Places 依赖，改为 address_line1 必填 |
| `PUT /api/admin/venues/[id]` | ✅ 已修改 | 移除 Google Places 依赖，改为手填地址 |

### Admin-Web Pages（✅ 全部完成）

| 页面 | 状态 | 改动 |
|------|------|------|
| `app/settings/venues/page.tsx` | ✅ 已重写 | 移除 Region 下拉 + PlaceAutocomplete，改为手填地址 |
| `app/events/new/page.tsx` | ✅ 已修改 | Region 改为只读显示（从 venue 继承） |
| `app/events/[id]/edit/page.tsx` | ✅ 已修改 | Region 改为只读显示（从 venue 继承） |
| `app/settings/invites/page.tsx` | ✅ 无需改动 | 已正确显示 "Create New Merchant"（API 已支持） |

### Internal-Web API（✅ 全部完成）

| API | 状态 | 改动 |
|-----|------|------|
| `POST /api/invite/consume` | ✅ 已修改 | 支持 merchant_id 为空时创建新 Merchant |

### Customer-Web（✅ 全部完成）

| 文件 | 状态 | 改动 |
|------|------|------|
| `lib/data/events.ts` | ✅ 已修改 | 类型定义添加 address_line1 和 region |
| `app/events/[id]/page.tsx` | ✅ 已修改 | 地址显示改为 address_line1 + region city/state |

---

## 📋 改造详细说明

### 1. Region 继承机制

**新规格**：Region 从上游自动继承，不允许手动选择

```
Invite (region_id)
    └── Merchant (region_id = invite.region_id)  ← Consume 时创建
            └── Venue (region_id = merchant.region_id)  ← DB Trigger 自动继承
                    └── Event (region_id = venue.region_id)  ← DB Trigger 自动继承
```

### 2. 数据库触发器

| 触发器 | 作用 |
|--------|------|
| `trg_set_venue_region_from_merchant` | Venue INSERT 时自动继承 merchant.region_id |
| `trg_sync_venue_regions_on_merchant_update` | Merchant region_id 更新时同步 venues |
| `trg_set_event_region_from_venue` | Event INSERT 时自动继承 venue.region_id |
| `trg_sync_event_regions_on_venue_update` | Venue region_id 更新时同步 events |

### 3. 地址存储

**新规格**：
- `address_line1` - 街道地址（必填）
- `address_line2` - 可选补充（如 Suite #）
- `postal_code` - 邮编（可选）
- `city/state` - 从 region JOIN 获取（不再写入 venues）

### 4. Invite → Merchant 创建流程

```
1. Admin 创建 Invite（指定 region_id，不选 merchant）
2. 用户 Consume Invite
3. 如果 invite.merchant_id 为空：
   → 自动创建 Merchant（region_id = invite.region_id）
   → Merchant name = "{email前缀}'s Business"
4. 创建 merchant_member（role = intended_role）
```

---

## 🧪 自测 Checklist

### Test Case 1: Admin 创建 Region ✓
- [ ] 登录 Admin-Web → Settings → General
- [ ] Add New Region → 选择 State, 输入 City
- [ ] 创建成功

### Test Case 2: Admin 创建 Invite（无 merchant）✓
- [ ] Settings → Invites（或 Settings 页面）
- [ ] 创建 Invite，选择 Region，**不选择** Merchant
- [ ] 允许保存（API 不再报错）

### Test Case 3: Internal 用户 Consume Invite ✓
- [ ] 使用 Test Case 2 的 invite code
- [ ] 自动创建新 Merchant
- [ ] 跳转到 Dashboard

### Test Case 4: Admin 创建 Venue ✓
- [ ] Settings → Venues → Add Venue
- [ ] 选择 Merchant → Region 只读显示
- [ ] 输入 Street address → 保存成功

### Test Case 5: Admin 创建 Event ✓
- [ ] Events → Create
- [ ] 选择 Venue → Region 自动继承（只读）
- [ ] 发布成功

### Test Case 6: Customer 浏览 Event ✓
- [ ] 访问 Customer-Web
- [ ] 选择 Region
- [ ] 查看 Event 详情，地址显示正常

---

## 📁 修改的文件列表

### 数据库
```
supabase/migrations/027_region_venue_event_consistency.sql  [NEW]
supabase/migrations/028_backfill_and_audit.sql              [NEW]
scripts/audit_region_consistency.sql                         [NEW]
```

### Admin-Web
```
app/api/admin/invites/route.ts           [MODIFIED] - 移除 merchantId 强制检查
app/api/admin/venues/route.ts            [MODIFIED] - 移除 Google Places 依赖
app/api/admin/venues/[id]/route.ts       [REWRITTEN] - 移除 Google Places 依赖
app/settings/venues/page.tsx             [REWRITTEN] - 简化 UI
app/events/new/page.tsx                  [MODIFIED] - Region 只读
app/events/[id]/edit/page.tsx            [MODIFIED] - Region 只读
```

### Internal-Web
```
app/api/invite/consume/route.ts          [MODIFIED] - 支持自动创建 Merchant
```

### Customer-Web
```
lib/data/events.ts                       [MODIFIED] - 添加 address_line1 和 region
app/events/[id]/page.tsx                 [MODIFIED] - 改进地址显示
```

---

## ✅ 总结

**地区/地址体系重构已全部完成！**

核心改动：
1. ✅ Region 从上游自动继承（不允许手动选择）
2. ✅ Invite consume 支持自动创建 Merchant
3. ✅ 移除 Google Places API 依赖（Venues）
4. ✅ 地址改为手填（address_line1 + address_line2）
5. ✅ DB 触发器确保 region_id 一致性
6. ✅ Customer 端地址显示优化

**可选保留项**：
- Settings 页面的 Region center 点 PlaceAutocomplete（用于地图中心，不影响核心功能）
