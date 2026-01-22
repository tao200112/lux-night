# 修复报告：Admin-Web 两个阻断级问题修复

## 修改文件清单

### 问题 A：Venues API 500 错误 + 活动地区继承逻辑

1. **apps/admin-web/app/api/admin/venues/route.ts**
   - 删除所有对 `logo_url` 字段的引用（该字段在数据库中不存在）
   - 删除对 `description` 字段的引用（该字段在数据库中不存在）
   - 保留 `region_id` 字段的查询和返回

2. **apps/admin-web/app/events/new/page.tsx**
   - 删除 `Venue` 接口中的 `logo_url` 和 `description` 字段
   - 修复 venue 对象构建时对不存在字段的引用

3. **apps/admin-web/app/events/[id]/edit/page.tsx**
   - 删除 `Venue` 接口中的 `logo_url` 和 `description` 字段
   - 修复 venue 对象构建时对不存在字段的引用

4. **apps/admin-web/app/api/admin/merchants/[id]/default-venue/route.ts**
   - 删除查询和返回中的 `logo_url` 和 `description` 字段
   - 删除 TypeScript 接口中的 `logo_url` 字段定义

5. **apps/admin-web/app/api/admin/merchants/[id]/events/route.ts**
   - **关键改进**：增强 venue/region 自动继承逻辑
   - 如果 merchant 没有 `default_venue_id`，自动查找该 merchant 的第一个 active venue
   - 发布活动时，如果 merchant 没有绑定 venue/region，返回明确的业务错误码 `MERCHANT_VENUE_NOT_BOUND` 或 `MERCHANT_REGION_NOT_BOUND`
   - 确保 `region_id` 从 venue 继承（优先级：venue.region_id > merchant.region_id）

### 问题 B：Admin 设置页新增地区按钮无反应

6. **apps/admin-web/app/api/admin/settings/regions/route.ts**
   - **新增功能**：支持创建新地区（通过 POST body 中的 `name` 字段判断）
   - 创建逻辑：
     - 使用 `createAdminClient()` 绕过 RLS
     - 自动检查唯一约束（name, state, country）
     - 处理重复地区错误（返回 409 状态码和 `DUPLICATE_REGION` 错误码）
     - 自动生成默认值（country='US', status='Operational', is_active=true）
     - 写入 audit log
   - 保留原有的更新地区状态功能

7. **apps/admin-web/app/settings/page.tsx**
   - **新增功能**：添加"新增地区"弹窗和表单
   - 添加状态管理：`showAddRegionModal`, `newRegionName`, `newRegionState`, `newRegionCountry`, `submittingRegion`
   - 为"Add New Region"按钮添加 `onClick` 处理函数
   - 实现弹窗表单，包含：
     - Region Name（必填）
     - State（可选）
     - Country（默认 'US'）
   - 提交后自动刷新地区列表
   - 错误处理和用户提示

## 关键代码片段

### 1. Venues API 修复（删除 logo_url）

```typescript
// apps/admin-web/app/api/admin/venues/route.ts
// 修复前：
.select('id, name, address, logo_url, description, merchant_id, region_id')

// 修复后：
.select('id, name, address, merchant_id, region_id')
```

### 2. 活动创建时的 Venue/Region 自动继承

```typescript
// apps/admin-web/app/api/admin/merchants/[id]/events/route.ts

// 如果还没有venue_id，尝试获取merchant的第一个active venue
if (!finalVenueId) {
  const { data: firstVenue, error: firstVenueError } = await supabase
    .from('venues')
    .select('id, region_id')
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  
  if (!firstVenueError && firstVenue) {
    finalVenueId = firstVenue.id;
    finalRegionId = firstVenue.region_id || merchant.region_id || null;
  }
}

// Publish时：必须要有venue_id和region_id
if (!isDraft) {
  if (!finalVenueId) {
    return NextResponse.json(
      { 
        success: false, 
        code: 'MERCHANT_VENUE_NOT_BOUND', 
        message: 'Venue is required for publishing. This merchant has no venue bound. Please bind a venue to this merchant first.' 
      },
      { status: 400 }
    );
  }
  // ... region_id 检查
}
```

### 3. 新增地区 API

```typescript
// apps/admin-web/app/api/admin/settings/regions/route.ts

async function createRegion(body: any) {
  const { name, state, country, lat, lng } = body;
  
  // 使用admin client绕过RLS
  const adminClient = createAdminClient();
  
  // 检查唯一约束
  const { data: existing } = await adminClient
    .from('regions')
    .select('id, name')
    .eq('name', name.trim())
    .eq('state', state || null)
    .eq('country', country || 'US')
    .single();
  
  if (existing) {
    return NextResponse.json(
      { 
        success: false, 
        code: 'DUPLICATE_REGION', 
        message: `Region "${name}" already exists` 
      },
      { status: 409 }
    );
  }
  
  // 创建新地区
  const { data: newRegion, error: createError } = await adminClient
    .from('regions')
    .insert({
      name: name.trim(),
      state: state || null,
      country: country || 'US',
      lat: lat || null,
      lng: lng || null,
      is_active: true,
      status: 'Operational',
    })
    .select()
    .single();
  
  // ... 错误处理和 audit log
}
```

### 4. 设置页新增地区按钮

```typescript
// apps/admin-web/app/settings/page.tsx

<button 
  onClick={() => {
    console.log('[SETTINGS] Add region button clicked');
    setShowAddRegionModal(true);
  }}
  className="..."
>
  <span className="material-symbols-outlined text-[18px]">add</span>
  Add New Region
</button>

{/* 弹窗表单 */}
{showAddRegionModal && (
  <form onSubmit={async (e) => {
    e.preventDefault();
    const res = await fetch('/api/admin/settings/regions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newRegionName.trim(),
        state: newRegionState.trim() || null,
        country: newRegionCountry || 'US',
      }),
    });
    // ... 处理响应和刷新列表
  }}>
    {/* 表单字段 */}
  </form>
)}
```

## SQL 迁移

**无需 SQL 迁移**。原因：
1. `logo_url` 字段从未在数据库中存在，只是代码中错误引用了它
2. `regions.status` 字段已通过 `007_admin_schema.sql` 迁移添加

如果数据库尚未运行 `007_admin_schema.sql`，需要执行：

```sql
-- 如果 regions 表没有 status 字段，执行：
ALTER TABLE public.regions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Operational' 
CHECK (status IN ('Operational', 'Maintenance'));
```

## 手工验收步骤

### 问题 A 验收：Venues API + 活动创建

1. **测试 Venues API（不再 500）**
   - 登录 Admin 端
   - 打开浏览器 DevTools Network 标签
   - 访问：`/events/new?merchant_id=<某个merchant_id>`
   - 检查 Network 中 `/api/admin/venues?merchant_id=...` 请求
   - ✅ 应该返回 200，不再出现 `logo_url does not exist` 错误

2. **测试活动创建（自动继承 venue/region）**
   - 选择一个**已绑定 venue** 的 merchant
   - 访问：`/events/new?merchant_id=<merchant_id>`
   - ✅ 页面应自动显示该 merchant 的 default venue（或第一个 active venue）
   - ✅ Venue 信息显示为只读，显示 "Auto-selected from merchant"
   - 填写活动信息（标题、时间、票种等）
   - 点击 "Publish"
   - ✅ 活动应成功创建，`venue_id` 和 `region_id` 自动从 merchant 继承

3. **测试活动发布（merchant 未绑定 venue 的错误提示）**
   - 选择一个**未绑定任何 venue** 的 merchant（或创建一个测试 merchant）
   - 访问：`/events/new?merchant_id=<merchant_id>`
   - ✅ 页面应显示红色提示："No venue bound to this merchant"
   - 填写活动信息，点击 "Publish"
   - ✅ 应返回明确的错误：`MERCHANT_VENUE_NOT_BOUND`，提示用户先绑定 venue

### 问题 B 验收：新增地区功能

4. **测试新增地区按钮**
   - 登录 Admin 端
   - 访问：`/settings`
   - 滚动到 "Regional Config" 部分
   - 点击 "Add New Region" 按钮
   - ✅ 应弹出新增地区表单弹窗

5. **测试创建地区（成功）**
   - 在弹窗中填写：
     - Region Name: "Test Region"
     - State: "California"（可选）
     - Country: "US"（默认）
   - 点击 "Create Region"
   - ✅ Network 中应看到 POST `/api/admin/settings/regions` 请求，返回 200
   - ✅ 弹窗应关闭，地区列表应立即刷新，新地区出现在列表中

6. **测试创建地区（重复错误）**
   - 再次点击 "Add New Region"
   - 填写相同的 Region Name、State、Country
   - 点击 "Create Region"
   - ✅ 应返回 409 错误，错误码 `DUPLICATE_REGION`，提示地区已存在

7. **测试创建地区（必填字段验证）**
   - 点击 "Add New Region"
   - 不填写 Region Name，直接点击 "Create Region"
   - ✅ 应显示浏览器原生验证提示（required 字段）

## logo_url 问题解释

### 为什么出现？

1. **Schema 不同步**：代码中引用了 `venues.logo_url` 字段，但数据库 schema（`001_schema.sql`）中 `venues` 表从未定义过此字段
2. **可能的原因**：
   - 开发时计划添加 logo_url 但未完成数据库迁移
   - 或从其他项目复制代码时包含了不存在的字段引用
   - 或 TypeScript 接口定义与数据库 schema 不一致

### 选择的修复方案

**方案：删除所有 `logo_url` 字段引用**

原因：
1. 数据库中从未存在此字段，添加字段需要迁移，且可能影响现有数据
2. 产品需求中未明确需要 venue logo，删除引用是最小改动
3. 如果未来需要，可以：
   - 添加 SQL 迁移：`ALTER TABLE venues ADD COLUMN logo_url TEXT;`
   - 重新添加代码引用

### 如何避免再次发生？

1. **Schema 同步策略**：
   - 使用 TypeScript 类型生成工具（如 `supabase-gen-types`）从数据库 schema 自动生成类型
   - 或维护一个统一的 `types.ts` 文件，确保与数据库 schema 一致

2. **代码审查检查点**：
   - 所有 `.select()` 查询中的字段必须在 schema 中存在
   - 所有 TypeScript 接口中的字段必须与数据库字段对应

3. **测试策略**：
   - 集成测试中覆盖所有 API 端点
   - 使用真实数据库（或 schema 一致的测试数据库）进行测试

4. **开发流程**：
   - 修改数据库 schema 时，同步更新所有相关 TypeScript 类型
   - 使用 lint 规则检查：禁止在 `.select()` 中使用未定义的字段名

## 总结

✅ **问题 A-1**：已修复 venues API 500 错误（删除 logo_url 引用）  
✅ **问题 A-2**：已修复活动创建时的 venue/region 自动继承逻辑  
✅ **问题 B**：已修复新增地区按钮无反应问题，并实现完整的创建地区功能  

所有修复**仅在 admin-web 应用内**完成，未修改其他应用代码。
