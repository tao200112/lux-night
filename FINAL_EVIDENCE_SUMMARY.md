# 最终证据总结 - Event Week V2 重构

## A. 我到底改了什么（完整清单）

### 新增文件（28个）

#### 数据库
- `supabase/migrations/034_event_week_ticketing_v2.sql` - 完整迁移文件

#### Admin API（6个）
- `apps/admin-web/app/api/admin/events-v2/route.ts` - 创建/获取活动列表
- `apps/admin-web/app/api/admin/events-v2/[id]/route.ts` - 获取/更新活动详情
- `apps/admin-web/app/api/admin/events-v2/[id]/week/route.ts` - 获取/保存周配置
- `apps/admin-web/app/api/admin/change-requests/route.ts` - 获取申请列表
- `apps/admin-web/app/api/admin/change-requests/[id]/approve/route.ts` - 审批通过
- `apps/admin-web/app/api/admin/change-requests/[id]/reject/route.ts` - 拒绝申请

#### Internal API（3个）
- `apps/internal-web/app/api/events-v2/route.ts` - 活动列表（只读）
- `apps/internal-web/app/api/events-v2/[id]/week/route.ts` - 周配置（只读）
- `apps/internal-web/app/api/events-v2/[id]/change-requests/route.ts` - 提交申请

#### Customer API（3个）
- `apps/customer-web/app/api/public/events-v2/[id]/route.ts` - 活动详情
- `apps/customer-web/app/api/public/events-v2/[id]/week/route.ts` - 周配置
- `apps/customer-web/app/api/public/checkout-v2/route.ts` - Checkout v2

#### Admin 前端（4个）
- `apps/admin-web/app/events-v2/page.tsx` - 活动列表
- `apps/admin-web/app/events-v2/new/page.tsx` - 创建活动（只有 poster/title/description）
- `apps/admin-web/app/events-v2/[id]/week/page.tsx` - 周配置编辑器
- `apps/admin-web/app/change-requests/page.tsx` - 审批页面

#### Internal 前端（3个）
- `apps/internal-web/app/events-v2/page.tsx` - 活动列表（只读）
- `apps/internal-web/app/events-v2/[id]/page.tsx` - 活动详情（只读）
- `apps/internal-web/app/events-v2/[id]/request-change/page.tsx` - 提交申请

#### Customer 前端（1个）
- `apps/customer-web/app/events-v2/[id]/page.tsx` - 活动详情（按天展示）

#### 工具函数（2个）
- `lib/utils/event-week.ts` - 时间窗口计算
- `lib/stripe/event-week-sync.ts` - Stripe 同步

#### 文档（3个）
- `EVENT_WEEK_V2_IMPLEMENTATION.md`
- `DATABASE_MIGRATION_INSTRUCTIONS.md`
- `MIGRATION_SUCCESS.md`

### 修改文件（1个）
- `apps/customer-web/app/api/stripe/webhook/route.ts` - 添加 v2 订单处理

---

## B. 关键代码片段（核心变更）

### 1. 新创建活动 API（无 Venue/Time）

```typescript
// 文件：apps/admin-web/app/api/admin/events-v2/route.ts
// 行 28-45

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { merchant_id, title, description, poster_url, status = 'active' } = body;
  
  // 只接受这些字段，没有 venue_id, start_at, end_at
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

### 2. 新创建活动页面（无 Venue/Time）

```typescript
// 文件：apps/admin-web/app/events-v2/new/page.tsx
// 行 18-24

const [formData, setFormData] = useState({
  merchant_id: '',
  title: '',
  description: '',
  poster_url: '',
  status: 'active' as 'active' | 'paused' | 'archived',
});
// 注意：没有 venueId, startDate, endDate, scheduleMode
```

### 3. 新周配置编辑器（只有 7 天配置）

```typescript
// 文件：apps/admin-web/app/events-v2/[id]/week/page.tsx
// 核心：7 天卡片，每卡片有 enabled, start_time, end_time, tickets
// 没有 Venue 选择，没有 Event Time，没有 Weekly/Single 切换
```

---

## C. 新页面路由清单

### Admin 端口
- **创建活动**：`/events-v2/new` ✅
- **周配置编辑**：`/events-v2/[id]/week` ✅
- **活动列表**：`/events-v2` ✅
- **审批页面**：`/change-requests` ✅
- **活动基础信息编辑**：`/events-v2/[id]` ❌ **未创建**（只有 week 配置页）

### Internal 端口
- **活动列表**：`/events-v2` ✅
- **活动详情**：`/events-v2/[id]` ✅
- **提交申请**：`/events-v2/[id]/request-change` ✅

### Customer 端口
- **活动详情/购买**：`/events-v2/[id]` ✅

---

## D. 旧字段搜索结果（仍被旧页面使用）

### Venue / venueId
- **文件**：`apps/admin-web/app/events/[id]/edit/page.tsx`
  - 行 88-89: `const [venueId, setVenueId] = useState<string>('');`
  - 行 1067-1120: Section 2: Venue & Basics（完整 UI）
  - 行 610: `if (!venueId) { errors.push('Venue is required...'); }`

### Event Time / start_at / end_at
- **文件**：`apps/admin-web/app/events/[id]/edit/page.tsx`
  - 行 91-95: `startDate, startTime, endDate, endTime` 状态
  - 行 1222-1270: Section 3: Event Time（完整 UI）

### Weekly vs Single / schedule mode
- **文件**：`apps/admin-web/app/events/[id]/edit/page.tsx`
  - 行 109: `const [scheduleMode, setScheduleMode] = useState<'single' | 'weekly'>('single');`
  - 行 1187-1215: Schedule Mode Toggle UI
  - 行 1289-1304: WeeklyScheduleEditor 组件

### Redemption Window
- **文件**：`apps/admin-web/app/events/[id]/edit/page.tsx`
  - 行 97-100: `redeemStartDate, redeemStartTime, redeemEndDate, redeemEndTime`
  - 行 1324-1400: Section 4: Ticket Redemption Window

---

## E. "修改活动"按钮实际跳转

### 按钮位置和代码
- **文件**：`apps/admin-web/app/events/[id]/page.tsx`
- **行 331-336**：
```typescript
<Link
  href={`/events/${event.id}/edit`}  // ← 旧路由
  className="..."
>
  Edit Event
</Link>
```

### 最终 URL
- `/events/[id]/edit` ✅ **这是旧路由**

### 指向的页面
- **文件**：`apps/admin-web/app/events/[id]/edit/page.tsx`
- **这是旧页面**，包含所有旧字段

---

## F. 路由结构对比

### 旧路由（仍在使用）
```
apps/admin-web/app/events/
├── page.tsx              ← 活动列表
├── new/
│   └── page.tsx         ← 创建活动（有 Venue/Time/Weekly）
└── [id]/
    ├── page.tsx         ← 活动详情
    └── edit/
        └── page.tsx     ← 编辑活动（有 Venue/Time/Weekly/Redemption）
```

### 新路由（我创建的）
```
apps/admin-web/app/events-v2/
├── page.tsx              ← 活动列表
├── new/
│   └── page.tsx         ← 创建活动（只有 poster/title/description）
└── [id]/
    └── week/
        └── page.tsx     ← 周配置编辑器（7天配置）
```

---

## G. Console.log 标记位置

### 新页面标记（已添加）
1. **文件**：`apps/admin-web/app/events-v2/[id]/week/page.tsx`
   - **行 30**：`console.log('[NEW V2 PAGE] AdminEventWeekPage loaded - /events-v2/[id]/week');`

2. **文件**：`apps/admin-web/app/events-v2/new/page.tsx`
   - **行 12**：`console.log('[NEW V2 PAGE] AdminNewEventV2Page loaded - /events-v2/new');`

### 旧页面标记（已添加）
1. **文件**：`apps/admin-web/app/events/[id]/edit/page.tsx`
   - **行 60**：`console.log('[OLD PAGE] AdminEditEventPageContent loaded - /events/[id]/edit');`

2. **文件**：`apps/admin-web/app/events/new/page.tsx`
   - **行 51**：`console.log('[OLD PAGE] AdminCreateEventPageContent loaded - /events/new');`

### 验证方法
1. 运行开发环境
2. 点击"修改活动"按钮
3. 打开浏览器控制台
4. 查看输出：
   - `[NEW V2 PAGE]` → 新页面已生效 ✅
   - `[OLD PAGE]` → 仍在使用旧页面 ❌

---

## H. 已修复的入口链接

### ✅ 1. 活动详情页的"编辑"按钮
- **文件**：`apps/admin-web/app/events/[id]/page.tsx`
- **行 332**：从 `/events/${event.id}/edit` 改为 `/events-v2/${event.id}/week`
- **按钮文字**：从 "Edit Event" 改为 "Configure Week"

### ✅ 2. 活动列表页的"创建活动"按钮
- **文件**：`apps/admin-web/app/events/page.tsx`
- **行 203**：从 `/events/new` 改为 `/events-v2/new`

### ✅ 3. Merchant 详情页的"创建活动"按钮
- **文件**：`apps/admin-web/app/merchants/[merchantId]/page.tsx`
- **行 225**：从 `/events/new?merchant_id=${merchantId}` 改为 `/events-v2/new?merchant_id=${merchantId}`

### ✅ 4. 新创建页面支持 merchant_id 参数
- **文件**：`apps/admin-web/app/events-v2/new/page.tsx`
- **已添加**：从 URL 参数读取 merchant_id

---

## I. 结论

### 问题根因
1. ✅ 我创建了新路由 `/events-v2/*` 和新页面
2. ❌ 但所有入口链接仍指向旧路由 `/events/*`
3. ❌ 用户点击"修改活动"时访问的是旧页面

### 已修复
- ✅ 活动详情页的"编辑"按钮 → 指向新路由
- ✅ 活动列表页的"创建活动"按钮 → 指向新路由
- ✅ Merchant 页的"创建活动"按钮 → 指向新路由
- ✅ 添加了 console.log 标记用于验证

### 验证步骤
1. 运行开发环境
2. 点击"修改活动"按钮
3. 查看控制台输出
4. 如果看到 `[NEW V2 PAGE]` → 修复成功 ✅
5. 如果看到 `[OLD PAGE]` → 需要检查其他入口或缓存

---

## J. 如果仍看到旧页面

### 可能原因
1. **浏览器缓存**：硬刷新（Ctrl+Shift+R）
2. **其他入口链接**：检查是否有导航栏、面包屑等
3. **路由中间件**：检查是否有重定向逻辑

### 进一步修复
如果控制台仍显示 `[OLD PAGE]`，需要：
1. 全局搜索所有指向 `/events/*` 的链接
2. 检查是否有路由中间件重定向
3. 检查是否有组件级别的导航逻辑
