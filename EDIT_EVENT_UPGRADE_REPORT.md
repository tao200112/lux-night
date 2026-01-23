# Edit Event 页面升级报告

## 修改文件清单

### 1. 页面组件
- **apps/admin-web/app/events/[id]/edit/page.tsx** - 完全重写，对齐创建页面的所有功能

### 2. API 路由
- **apps/admin-web/app/api/admin/events/[eventId]/route.ts** - 升级 GET 和 PUT 方法，支持完整字段和票种增删改策略

### 3. 数据库迁移
- **supabase/migrations/025_add_event_paused_cancelled_status.sql** - 新增，添加 'paused' 和 'cancelled' 状态支持

## 关键代码片段

### 1. 编辑页面结构（8个模块）

```typescript
// apps/admin-web/app/events/[id]/edit/page.tsx

// Section H: 只读统计信息
{eventStats && (
  <section>
    <h3>📊 Event Statistics</h3>
    {/* 显示总订单数、总收入、已核销票数、Event ID */}
  </section>
)}

// Section 1: 海报与品牌
<section>
  <h3>① Poster & Branding</h3>
  {/* 海报上传/替换/删除、标题、副标题、描述 */}
</section>

// Section 2: 场地与基础信息
<section>
  <h3>② Venue & Basics</h3>
  {/* Venue选择/切换（支持多个venue） */}
</section>

// Section 3: 活动时间
<section>
  <h3>③ Event Time</h3>
  {/* 开始/结束日期时间，跨天自动处理 */}
</section>

// Section 4: 票务核销窗口
<section>
  <h3>④ Ticket Redemption Window</h3>
  {/* 核销开始/结束时间 */}
</section>

// Section 5: 票种与价格
<section>
  <h3>⑤ Ticket Types</h3>
  {/* 票种增删改、排序、已售出限制 */}
</section>

// Section 6: 规则与合规
<section>
  <h3>Policies</h3>
  {/* 退款政策 */}
</section>

// Section 7: 操作栏（固定底部）
<div className="fixed bottom-0">
  {/* Save Draft / Publish / Pause */}
</div>
```

### 2. 跨天活动自动处理

```typescript
// 如果 end_time < start_time，自动调整 end_date +1
useEffect(() => {
  if (startDate && startTime && endDate && endTime) {
    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(`${endDate}T${endTime}`);
    
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      if (end <= start) {
        const newEnd = new Date(end);
        newEnd.setDate(newEnd.getDate() + 1);
        setEndDate(newEnd.toISOString().split('T')[0]);
      }
    }
  }
}, [startDate, startTime, endDate, endTime]);
```

### 3. 票种已售出限制

```typescript
// 删除票种时检查已售出数量
const deleteTicketType = (id: string) => {
  const ticketType = ticketTypes.find(tt => tt.id === id);
  
  // 如果已售出，不能删除，只能停用
  if (ticketType && ticketType.sold_count && ticketType.sold_count > 0) {
    if (!confirm(`This ticket type has ${ticketType.sold_count} sold tickets. You cannot delete it, but you can deactivate it. Deactivate instead?`)) {
      return;
    }
    // 改为停用
    setTicketTypes(prev =>
      prev.map(tt => tt.id === id ? { ...tt, status: 'HIDDEN' as const } : tt)
    );
    return;
  }
  
  // 未售出可以删除
  if (confirm('Are you sure you want to delete this ticket type?')) {
    setTicketTypes(prev => prev.filter(tt => tt.id !== id));
  }
};
```

### 4. 票种增删改策略（API）

```typescript
// apps/admin-web/app/api/admin/events/[eventId]/route.ts

// 获取现有票种（检查已售出数量）
const { data: existingTicketTypes } = await adminClient
  .from('ticket_types')
  .select('id, sold_count')
  .eq('event_id', eventId);

const existingSoldCounts = new Map(
  (existingTicketTypes || []).map((tt: any) => [tt.id, tt.sold_count || 0])
);

// 找出需要删除的票种（只删除未售出的）
const toDelete = Array.from(existingIds).filter(id => !newIds.has(id));
for (const id of toDelete) {
  const soldCount = existingSoldCounts.get(id) || 0;
  if (soldCount > 0) {
    // 已售出，不能删除，改为停用
    await adminClient
      .from('ticket_types')
      .update({ status: 'HIDDEN', is_active: false })
      .eq('id', id);
  } else {
    // 未售出，可以删除
    await adminClient
      .from('ticket_types')
      .delete()
      .eq('id', id);
  }
}

// 更新或插入票种
for (const tt of newTicketTypes) {
  if (tt.id && existingIds.has(tt.id)) {
    // 更新现有票种
    const soldCount = existingSoldCounts.get(tt.id) || 0;
    if (soldCount > 0) {
      console.warn(`Ticket type ${tt.id} has ${soldCount} sold tickets. Price change will only affect new orders.`);
    }
    await adminClient
      .from('ticket_types')
      .update(ticketData)
      .eq('id', tt.id);
  } else {
    // 插入新票种
    await adminClient
      .from('ticket_types')
      .insert(ticketData);
  }
}
```

### 5. 状态控制（Publish/Pause）

```typescript
// 发布确认弹窗
const handlePublish = async () => {
  if (!showPublishConfirm) {
    setShowPublishConfirm(true);
    return;
  }
  // ... 发布逻辑
};

// 暂停功能
const handlePause = async () => {
  if (!confirm('Are you sure you want to pause this event? Customers will not be able to purchase new tickets, but existing tickets remain valid.')) {
    return;
  }
  // ... 暂停逻辑
};
```

### 6. 未保存更改提示

```typescript
// 跟踪未保存更改
useEffect(() => {
  setHasUnsavedChanges(true);
}, [title, subtitle, description, venueId, startDate, startTime, endDate, endTime, ticketTypes, refundPolicy]);

// 离开页面时提示
onClick={() => {
  if (hasUnsavedChanges && !confirm('You have unsaved changes. Are you sure you want to leave?')) {
    return;
  }
  router.back();
}}
```

## SQL 迁移

### 025_add_event_paused_cancelled_status.sql

```sql
-- 删除旧的 CHECK 约束
ALTER TABLE public.events 
DROP CONSTRAINT IF EXISTS events_status_check;

-- 添加新的 CHECK 约束（包含 paused 和 cancelled）
ALTER TABLE public.events 
ADD CONSTRAINT events_status_check 
CHECK (status IN ('draft','pending_review','approved','published','paused','cancelled','rejected','archived'));
```

**执行方式：**
```bash
# 在 Supabase 项目中执行（已成功推送）
npx supabase db push --include-all

# 或直接在 Supabase Dashboard 的 SQL Editor 中执行迁移文件内容
```

**✅ 迁移状态：已成功推送到远程数据库**

## 本地验证步骤

### 1. 测试跨天活动编辑

1. 登录 Admin 端
2. 访问一个现有活动的编辑页：`/events/[eventId]/edit`
3. 设置活动时间：
   - Start: 2024-12-31 22:00
   - End: 2025-01-01 02:00
4. ✅ 应该自动检测为跨天活动，显示提示
5. 如果 End Time < Start Time（同一天），应该自动调整 End Date +1

### 2. 测试多票种活动编辑

1. 访问编辑页
2. 添加多个票种：
   - 18-20 Entry ($25)
   - 21+ Entry ($30)
   - Drink Ticket ($15)
3. ✅ 所有票种应该显示在列表中
4. 编辑一个票种，修改价格
5. ✅ 保存后价格应该更新
6. 删除一个未售出的票种
7. ✅ 应该成功删除
8. 尝试删除一个已售出的票种（如果有）
9. ✅ 应该提示不能删除，只能停用

### 3. 测试已售出票种的编辑限制

1. 找到一个有已售出票种的活动（sold_count > 0）
2. 访问编辑页
3. ✅ 已售出票种应该显示 "X sold" 标签
4. 尝试删除已售出票种
5. ✅ 应该提示不能删除，询问是否停用
6. 选择停用
7. ✅ 票种状态应该变为 HIDDEN
8. 编辑已售出票种的价格
9. ✅ 应该允许修改，但显示警告："Price changes will only affect new orders"

### 4. 测试海报上传/替换

1. 访问编辑页
2. 如果已有海报，点击删除按钮
3. ✅ 海报应该被清除
4. 点击上传区域，选择新图片
5. ✅ 应该显示预览
6. ✅ 上传成功后，posterUrl 应该更新
7. 保存草稿
8. ✅ 海报应该保存成功

### 5. 测试 Venue 切换

1. 访问编辑页（确保 merchant 有多个 venue）
2. ✅ 应该显示当前 venue（只读显示）
3. 如果有多个 venue，应该显示下拉选择框
4. 选择一个不同的 venue
5. ✅ venue 应该更新
6. 保存
7. ✅ 活动的 venue_id 应该更新

### 6. 测试状态控制

1. 访问一个 draft 状态的编辑页
2. ✅ 底部应该显示 "Save Draft" 和 "Publish" 按钮
3. 点击 "Publish"
4. ✅ 应该弹出确认弹窗
5. 确认发布
6. ✅ 活动状态应该变为 published
7. 刷新页面
8. ✅ 底部应该显示 "Save Draft" 和 "Pause" 按钮（不再显示 Publish）
9. 点击 "Pause"
10. ✅ 应该弹出确认，确认后状态变为 paused

### 7. 测试只读统计信息

1. 访问一个已发布且有订单的活动编辑页
2. ✅ 页面顶部应该显示统计卡片：
   - Total Orders
   - Total Revenue
   - Redeemed Tickets
   - Event ID
3. ✅ 这些信息应该是只读的，不能编辑

### 8. 测试核销窗口

1. 访问编辑页
2. 设置活动时间
3. ✅ 核销窗口应该自动设置为：
   - Start: 活动开始前 30 分钟
   - End: 活动结束后 60 分钟
4. 手动修改核销窗口
5. ✅ 应该可以独立于活动时间设置
6. 保存
7. ✅ 核销窗口应该保存成功

### 9. 测试表单验证

1. 访问编辑页
2. 清空 Title
3. 点击 "Publish"
4. ✅ 应该显示错误："Event title is required"
5. 清空 Venue
6. 点击 "Publish"
7. ✅ 应该显示错误："Venue is required"
8. 设置 End Time < Start Time
9. ✅ 应该自动调整或显示错误

### 10. 测试未保存更改提示

1. 访问编辑页
2. 修改任意字段（标题、描述等）
3. ✅ 页面顶部应该显示黄色警告："You have unsaved changes"
4. 点击 "Cancel"
5. ✅ 应该弹出确认："You have unsaved changes. Are you sure you want to leave?"
6. 确认离开
7. ✅ 应该返回上一页

## 功能对比表

| 功能模块 | 创建页面 | 编辑页面（升级后） | 状态 |
|---------|---------|------------------|------|
| 海报上传/替换/删除 | ✅ | ✅ | 完成 |
| 标题/副标题/描述 | ✅ | ✅ | 完成 |
| Venue 选择/切换 | ✅ | ✅ | 完成 |
| 活动时间（跨天支持） | ✅ | ✅ | 完成 |
| 核销窗口 | ✅ | ✅ | 完成 |
| 票种增删改 | ✅ | ✅ | 完成 |
| 票种已售出限制 | ❌ | ✅ | 新增 |
| 退款政策 | ✅ | ✅ | 完成 |
| 状态控制（Draft/Published/Paused） | ✅ | ✅ | 完成 |
| 只读统计信息 | ❌ | ✅ | 新增 |
| 未保存更改提示 | ❌ | ✅ | 新增 |
| 发布确认弹窗 | ❌ | ✅ | 新增 |

## 注意事项

1. **价格转换**：
   - 前端显示和编辑使用美元（price_cents 字段名但值是美元）
   - API 接收美元，转换为分存储（乘以 100）
   - API 返回分，前端转换为美元显示（除以 100）

2. **票种已售出限制**：
   - 已售出票种（sold_count > 0）不能删除，只能停用（status = 'HIDDEN'）
   - 已售出票种的价格修改只影响新订单（通过版本化或业务逻辑实现）

3. **状态映射**：
   - 数据库状态：'draft', 'published', 'paused', 'cancelled', 'pending_review', 'approved', 'rejected', 'archived'
   - UI 状态：'draft', 'published', 'paused', 'cancelled'
   - 需要执行 SQL 迁移以支持 'paused' 和 'cancelled'

4. **跨天活动**：
   - 如果 end_time < start_time，自动调整 end_date +1
   - 显示跨天提示

5. **核销窗口**：
   - 默认：活动开始前 30 分钟到结束后 60 分钟
   - 可以独立于活动时间设置
   - 支持快速设置按钮

## 后续优化建议

1. **票种版本化**：实现真正的价格版本化，而不是简单的警告
2. **富文本编辑器**：为 Description 添加富文本编辑器支持
3. **图片裁剪**：为海报上传添加裁剪功能
4. **批量操作**：支持批量编辑多个票种
5. **历史记录**：显示活动编辑历史
6. **草稿对比**：显示草稿与已发布版本的差异
