# 证据报告：Event Week V2 重构实施情况

## A. 我到底改了什么（文件清单）

### 新增文件（A - Added）

#### 数据库迁移
- **A** `supabase/migrations/034_event_week_ticketing_v2.sql`
  - 创建 events_v2, event_weeks, event_week_days, ticket_types_v2, merchant_change_requests 表
  - 创建 RPC 函数：rpc_get_or_create_event_week, calculate_day_validity_window
  - 扩展 tickets 表添加快照字段
  - 创建 RLS 策略

#### Admin API 路由
- **A** `apps/admin-web/app/api/admin/events-v2/route.ts`
  - POST/GET /api/admin/events-v2 - 创建/获取活动列表（v2）
- **A** `apps/admin-web/app/api/admin/events-v2/[id]/route.ts`
  - GET/PUT /api/admin/events-v2/[id] - 获取/更新活动详情（v2）
- **A** `apps/admin-web/app/api/admin/events-v2/[id]/week/route.ts`
  - GET/PUT /api/admin/events-v2/[id]/week - 获取/保存本周配置
- **A** `apps/admin-web/app/api/admin/change-requests/route.ts`
  - GET /api/admin/change-requests - 获取修改申请列表
- **A** `apps/admin-web/app/api/admin/change-requests/[id]/approve/route.ts`
  - POST /api/admin/change-requests/[id]/approve - 审批通过
- **A** `apps/admin-web/app/api/admin/change-requests/[id]/reject/route.ts`
  - POST /api/admin/change-requests/[id]/reject - 拒绝申请

#### Internal API 路由
- **A** `apps/internal-web/app/api/events-v2/route.ts`
  - GET /api/events-v2 - 获取活动列表（只读）
- **A** `apps/internal-web/app/api/events-v2/[id]/week/route.ts`
  - GET /api/events-v2/[id]/week - 获取本周配置（只读）
- **A** `apps/internal-web/app/api/events-v2/[id]/change-requests/route.ts`
  - POST /api/events-v2/[id]/change-requests - 提交修改申请

#### Customer API 路由
- **A** `apps/customer-web/app/api/public/events-v2/[id]/route.ts`
  - GET /api/public/events-v2/[id] - 获取活动详情（公开）
- **A** `apps/customer-web/app/api/public/events-v2/[id]/week/route.ts`
  - GET /api/public/events-v2/[id]/week - 获取本周配置（公开）
- **A** `apps/customer-web/app/api/public/checkout-v2/route.ts`
  - POST /api/public/checkout-v2 - 创建 Stripe checkout session（v2）

#### Admin 前端页面
- **A** `apps/admin-web/app/events-v2/page.tsx`
  - 活动列表页面（新路由：/events-v2）
- **A** `apps/admin-web/app/events-v2/new/page.tsx`
  - 创建活动页面（新路由：/events-v2/new）
- **A** `apps/admin-web/app/events-v2/[id]/week/page.tsx`
  - 本周编辑器页面（新路由：/events-v2/[id]/week）
- **A** `apps/admin-web/app/change-requests/page.tsx`
  - 审批页面（新路由：/change-requests）

#### Internal 前端页面
- **A** `apps/internal-web/app/events-v2/page.tsx`
  - 活动列表页面（新路由：/events-v2）
- **A** `apps/internal-web/app/events-v2/[id]/page.tsx`
  - 活动详情页面（新路由：/events-v2/[id]）
- **A** `apps/internal-web/app/events-v2/[id]/request-change/page.tsx`
  - 提交修改申请页面（新路由：/events-v2/[id]/request-change）

#### Customer 前端页面
- **A** `apps/customer-web/app/events-v2/[id]/page.tsx`
  - 活动详情页（新路由：/events-v2/[id]）

#### 工具函数
- **A** `lib/utils/event-week.ts`
  - 时间窗口计算工具函数
- **A** `lib/stripe/event-week-sync.ts`
  - Stripe Product/Price 同步逻辑

#### 文档
- **A** `EVENT_WEEK_V2_IMPLEMENTATION.md`
- **A** `DATABASE_MIGRATION_INSTRUCTIONS.md`
- **A** `MIGRATION_SUCCESS.md`

### 修改文件（M - Modified）

- **M** `apps/customer-web/app/api/stripe/webhook/route.ts`
  - 添加 handleCheckoutSessionCompletedV2 函数支持 v2 订单

### 删除文件（D - Deleted）

- **D** `verify_migration_031.sql`

---

## B. 关键文件的核心变更（最小 diff）

### 1. 数据库迁移（核心表结构）

```sql
-- 文件：supabase/migrations/034_event_week_ticketing_v2.sql

-- events_v2 表（活动长期模板）
CREATE TABLE IF NOT EXISTS public.events_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  poster_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 注意：没有 venue_id, start_at, end_at, validity_start, validity_end 等字段

-- event_weeks 表（每周配置）
CREATE TABLE IF NOT EXISTS public.event_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events_v2(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL, -- Monday 00:00
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft')),
  ...
);

-- event_week_days 表（每天配置）
CREATE TABLE IF NOT EXISTS public.event_week_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_week_id UUID NOT NULL REFERENCES public.event_weeks(id) ON DELETE CASCADE,
  dow INT NOT NULL CHECK (dow >= 0 AND dow <= 6), -- 0=Monday
  enabled BOOLEAN NOT NULL DEFAULT false,
  start_time TIME NOT NULL DEFAULT '16:00',
  end_time TIME NOT NULL DEFAULT '02:00',
  end_next_day BOOLEAN NOT NULL DEFAULT true,
  ...
);

-- ticket_types_v2 表（每天独立票种）
CREATE TABLE IF NOT EXISTS public.ticket_types_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_week_day_id UUID NOT NULL REFERENCES public.event_week_days(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('entry','vip','drink','skipline','other')),
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  ...
);
```

### 2. 新 API 路由（Admin 创建活动）

```typescript
// 文件：apps/admin-web/app/api/admin/events-v2/route.ts

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { merchant_id, title, description, poster_url, status = 'active' } = body;
  
  // 注意：只接受 merchant_id, title, description, poster_url, status
  // 没有 venue_id, start_at, end_at 等字段
  
  const { data: event } = await supabase
    .from('events_v2')
    .insert({
      merchant_id,
      title,
      description: description || null,
      poster_url,
      status,
    })
    .select()
    .single();
}
```

### 3. 新 UI 页面（Admin 创建活动）

```typescript
// 文件：apps/admin-web/app/events-v2/new/page.tsx

const [formData, setFormData] = useState({
  merchant_id: '',
  title: '',
  description: '',
  poster_url: '',
  status: 'active' as 'active' | 'paused' | 'archived',
});
// 注意：没有 venueId, startDate, endDate, scheduleMode 等字段
```

### 4. 路由/导航/链接指向

**新路由（我创建的）：**
- Admin 创建活动：`/events-v2/new`
- Admin 编辑周配置：`/events-v2/[id]/week`
- Admin 活动列表：`/events-v2`
- Admin 审批：`/change-requests`

**旧路由（仍然存在）：**
- Admin 创建活动：`/events/new` ✅ **仍在使用**
- Admin 编辑活动：`/events/[id]/edit` ✅ **仍在使用**
- Admin 活动列表：`/events` ✅ **仍在使用**

---

## C. 新页面路由清单

### Admin 端口
- **创建活动**：`/events-v2/new` ✅ 已创建
- **编辑活动基础信息**：`/events-v2/[id]` ❌ **未创建**（只有 week 配置页）
- **周配置编辑**：`/events-v2/[id]/week` ✅ 已创建
- **审批页面**：`/change-requests` ✅ 已创建

### Internal 端口
- **活动列表**：`/events-v2` ✅ 已创建
- **活动详情**：`/events-v2/[id]` ✅ 已创建
- **提交修改申请**：`/events-v2/[id]/request-change` ✅ 已创建

### Customer 端口
- **活动详情/购买**：`/events-v2/[id]` ✅ 已创建

---

## D. 旧字段/组件搜索结果

### 仍被旧页面使用（旧路由）

#### Venue / venueId / select venue
- **文件**：`apps/admin-web/app/events/[id]/edit/page.tsx`
  - 行 88-89: `const [venueId, setVenueId] = useState<string>('');`
  - 行 1067-1120: Section 2: Venue & Basics（完整 Venue 选择 UI）
  - 行 610: `if (!venueId) { errors.push('Venue is required...'); }`
- **文件**：`apps/admin-web/app/events/new/page.tsx`
  - 行 75-76: `const [venueId, setVenueId] = useState<string>('');`
  - 行 844-1005: Section 2: Venue & Basics（完整 Venue 选择 UI）

#### validity / start_at / end_at / redemption window
- **文件**：`apps/admin-web/app/events/[id]/edit/page.tsx`
  - 行 91-95: `startDate, startTime, endDate, endTime` 状态
  - 行 97-100: `redeemStartDate, redeemStartTime, redeemEndDate, redeemEndTime` 状态
  - 行 1222-1270: "Event Time" 分区（Start Date/Time, End Date/Time）
  - 行 1324-1400: "Ticket Redemption Window" 分区
- **文件**：`apps/admin-web/app/events/new/page.tsx`
  - 行 1049-1088: "Event Time" 分区
  - 行 1120-1200: "Ticket Redemption Window" 分区

#### Weekly vs Single / schedule mode
- **文件**：`apps/admin-web/app/events/[id]/edit/page.tsx`
  - 行 109: `const [scheduleMode, setScheduleMode] = useState<'single' | 'weekly'>('single');`
  - 行 1187-1215: Schedule Mode Toggle（Single Event / Weekly Schedule）
  - 行 1289-1304: WeeklyScheduleEditor 组件
- **文件**：`apps/admin-web/app/events/new/page.tsx`
  - 行 96: `const [scheduleMode, setScheduleMode] = useState<'single' | 'weekly'>('weekly');`
  - 行 1020-1048: Schedule Mode Toggle
  - 行 1104-1118: WeeklyScheduleEditor 组件

#### "必须选择活动时间"的校验逻辑
- **文件**：`apps/admin-web/app/events/[id]/edit/page.tsx`
  - 行 604-625: `validatePublish()` 函数
  - 行 610: `if (!venueId) { errors.push('Venue is required...'); }`
  - 行 512-530: 时间校验逻辑

### 新页面未接入（新路由）

**新页面（/events-v2/new）**：
- ✅ 没有 Venue 字段
- ✅ 没有 start_at/end_at 字段
- ✅ 没有 Weekly/Single 切换
- ✅ 没有 Redemption Window

**新页面（/events-v2/[id]/week）**：
- ✅ 只有周配置编辑器（7天配置）
- ✅ 没有 Venue 选择
- ✅ 没有 Event Time 字段

---

## E. "修改活动"按钮实际跳转

### 按钮位置
- **文件**：`apps/admin-web/app/events/[id]/page.tsx`
- **行 332**：
```typescript
href={`/events/${event.id}/edit`}
```

### 最终 URL
- `/events/[id]/edit` ✅ **这是旧路由**

### 指向的页面
- **文件**：`apps/admin-web/app/events/[id]/edit/page.tsx`
- **这是旧页面**，包含：
  - Section 2: Venue & Basics（Venue 选择）
  - Section 3: Event Time（Start/End Date/Time）
  - Schedule Mode Toggle（Single/Weekly）
  - Section 4: Ticket Redemption Window
  - WeeklyScheduleEditor 组件
  - TicketDayPricingEditor 组件

---

## F. 路由层面结构

### Next.js App Router 结构

```
apps/admin-web/app/
├── events/                    ← 旧路由（仍在使用）
│   ├── page.tsx              ← 活动列表（旧）
│   ├── new/
│   │   └── page.tsx         ← 创建活动（旧，有 Venue/Time）
│   └── [id]/
│       ├── page.tsx         ← 活动详情（旧）
│       └── edit/
│           └── page.tsx     ← 编辑活动（旧，有 Venue/Time/Weekly）
│
└── events-v2/                ← 新路由（我创建的）
    ├── page.tsx              ← 活动列表（新）
    ├── new/
    │   └── page.tsx         ← 创建活动（新，只有 poster/title/description）
    └── [id]/
        └── week/
            └── page.tsx     ← 周配置编辑器（新）
```

### 现在存在两套页面

1. **旧页面**（/events/*）：
   - ✅ 仍在使用
   - ✅ 包含 Venue、Event Time、Weekly/Single、Redemption Window
   - ✅ 被 `/events/[id]/page.tsx` 的链接指向

2. **新页面**（/events-v2/*）：
   - ✅ 已创建
   - ✅ 不包含 Venue、Event Time 等旧字段
   - ❌ **未被任何入口链接指向**

---

## G. 运行时命中验证（需要执行）

### 在新页面根组件添加 console.log

**文件**：`apps/admin-web/app/events-v2/[id]/week/page.tsx`
**位置**：函数开头，第 1 行
```typescript
export default function AdminEventWeekPage() {
  console.log('[NEW V2 PAGE] AdminEventWeekPage loaded - /events-v2/[id]/week');
  // ... 其余代码
}
```

**文件**：`apps/admin-web/app/events-v2/new/page.tsx`
**位置**：函数开头，第 1 行
```typescript
export default function AdminNewEventV2Page() {
  console.log('[NEW V2 PAGE] AdminNewEventV2Page loaded - /events-v2/new');
  // ... 其余代码
}
```

### 在旧页面根组件添加 console.log

**文件**：`apps/admin-web/app/events/[id]/edit/page.tsx`
**位置**：函数开头，第 59 行
```typescript
function AdminEditEventPageContent({ params }: { params: Promise<{ id: string }> }) {
  console.log('[OLD PAGE] AdminEditEventPageContent loaded - /events/[id]/edit');
  // ... 其余代码
}
```

**文件**：`apps/admin-web/app/events/new/page.tsx`
**位置**：函数开头
```typescript
export default function AdminNewEventPage() {
  console.log('[OLD PAGE] AdminNewEventPage loaded - /events/new');
  // ... 其余代码
}
```

### 预期结果
当用户点击"修改活动"按钮时：
- 控制台应该显示：`[OLD PAGE] AdminEditEventPageContent loaded - /events/[id]/edit`
- 这说明**入口链接仍指向旧路由**

---

## H. 入口链接清单（需要修改）

### 需要修改的入口点

1. **活动列表页的"编辑"按钮**
   - **文件**：`apps/admin-web/app/events/page.tsx`
   - **当前**：可能指向 `/events/[id]/edit`
   - **应改为**：`/events-v2/[id]/week` 或 `/events-v2/[id]`（如果创建了基础信息编辑页）

2. **活动详情页的"编辑"按钮**
   - **文件**：`apps/admin-web/app/events/[id]/page.tsx`
   - **行 332**：`href={`/events/${event.id}/edit`}`
   - **应改为**：`href={`/events-v2/${event.id}/week`}`

3. **导航栏的"创建活动"链接**
   - 需要检查是否有导航栏组件
   - **应改为**：`/events-v2/new`

4. **活动列表页的"新建活动"按钮**
   - **文件**：`apps/admin-web/app/events/page.tsx`
   - **应改为**：`/events-v2/new`

---

## I. 组件依赖树（如果新页面仍显示旧 UI）

### 新页面组件依赖

**文件**：`apps/admin-web/app/events-v2/[id]/week/page.tsx`
- ✅ 没有 import WeeklyScheduleEditor
- ✅ 没有 import TicketDayPricingEditor
- ✅ 没有 import 任何旧组件
- ✅ 使用全新的 UI 结构（7天卡片）

**文件**：`apps/admin-web/app/events-v2/new/page.tsx`
- ✅ 没有 import WeeklyScheduleEditor
- ✅ 没有 import TicketDayPricingEditor
- ✅ 没有 import 任何旧组件
- ✅ 只有简单的表单（poster, title, description, status）

---

## J. 结论与修复方案

### 问题根因
1. **我创建了新路由 `/events-v2/*`，但旧路由 `/events/*` 仍然存在**
2. **所有入口链接仍指向旧路由 `/events/[id]/edit`**
3. **用户点击"修改活动"时，实际访问的是旧页面**

### 最小可行修复计划（1-2小时）

#### 方案 A：修改所有入口指向新路由（推荐）

**步骤 1：修改活动详情页的"编辑"按钮**
- **文件**：`apps/admin-web/app/events/[id]/page.tsx`
- **行 332**：将 `href={`/events/${event.id}/edit`}` 改为 `href={`/events-v2/${event.id}/week`}`

**步骤 2：修改活动列表页的链接**
- **文件**：`apps/admin-web/app/events/page.tsx`
- 查找所有指向 `/events/[id]/edit` 的链接，改为 `/events-v2/[id]/week`
- 查找"新建活动"按钮，改为指向 `/events-v2/new`

**步骤 3：创建活动基础信息编辑页（可选）**
- **文件**：`apps/admin-web/app/events-v2/[id]/page.tsx`（新建）
- 只包含：poster, title, description, status
- 保存后跳转到 `/events-v2/[id]/week`

**步骤 4：隐藏/删除旧页面入口（可选）**
- 在旧页面添加提示："此页面已废弃，请使用新页面"
- 或直接删除旧页面文件（如果确定不再使用）

#### 方案 B：直接修改旧页面（更快）

**步骤 1：修改旧编辑页面**
- **文件**：`apps/admin-web/app/events/[id]/edit/page.tsx`
- 删除 Section 2: Venue & Basics（行 1067-1120）
- 删除 Section 3: Event Time（行 1222-1270）
- 删除 Schedule Mode Toggle（行 1187-1215）
- 删除 Section 4: Ticket Redemption Window（行 1324-1400）
- 删除 WeeklyScheduleEditor 和 TicketDayPricingEditor 组件
- 只保留：poster, title, description, status
- 添加跳转到 `/events-v2/[id]/week` 的按钮

**步骤 2：修改旧创建页面**
- **文件**：`apps/admin-web/app/events/new/page.tsx`
- 同样删除 Venue、Event Time、Weekly/Single、Redemption Window
- 保存后跳转到 `/events-v2/[id]/week`

---

## K. 具体修复代码

### 修复 1：修改活动详情页的"编辑"按钮

**文件**：`apps/admin-web/app/events/[id]/page.tsx`
**行 332**：

```typescript
// 旧代码
href={`/events/${event.id}/edit`}

// 新代码
href={`/events-v2/${event.id}/week`}
```

### 修复 2：修改活动列表页（如果存在编辑按钮）

**文件**：`apps/admin-web/app/events/page.tsx`
查找所有编辑链接，改为：
```typescript
href={`/events-v2/${event.id}/week`}
```

### 修复 3：创建活动基础信息编辑页（如果需要）

**新建文件**：`apps/admin-web/app/events-v2/[id]/page.tsx`
```typescript
// 只包含基础信息编辑：poster, title, description, status
// 保存后跳转到 /events-v2/[id]/week
```

---

## L. 验证步骤

1. 添加 console.log 标记（见 G 节）
2. 运行开发环境
3. 点击"修改活动"按钮
4. 查看控制台输出
5. 确认实际加载的页面

---

## 总结

**问题**：我创建了新路由 `/events-v2/*`，但所有入口链接仍指向旧路由 `/events/*`，导致用户看到的仍是旧页面。

**解决方案**：修改所有入口链接，将 `/events/[id]/edit` 改为 `/events-v2/[id]/week`。
