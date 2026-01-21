# API修复报告

## ✅ 修复的问题

### 1. 404错误：`GET /api/admin/merchants/[id]/default-venue`

**问题**：API返回404 Not Found

**原因**：Supabase查询语法错误，使用了不支持的`venues:default_venue_id(...)`语法

**修复**：
- 将查询拆分为两步：
  1. 先查询merchant获取`default_venue_id`
  2. 如果有`default_venue_id`，再单独查询venue详情
- 添加了venue的`is_active`检查
- 改进了错误日志

**文件**：`apps/admin-web/app/api/admin/merchants/[id]/default-venue/route.ts`

**修改内容**：
```typescript
// 修复前：使用不支持的语法
.select(`
  id,
  name,
  default_venue_id,
  venues:default_venue_id(...)  // ❌ 语法错误
`)

// 修复后：分步查询
// 1. 查询merchant
const { data: merchant } = await adminClient
  .from('merchants')
  .select('id, name, default_venue_id')
  .eq('id', merchantId)
  .single();

// 2. 如果有default_venue_id，查询venue
if (merchant.default_venue_id) {
  const { data: venueData } = await adminClient
    .from('venues')
    .select('id, name, address, logo_url, description, is_active')
    .eq('id', merchant.default_venue_id)
    .single();
}
```

---

### 2. 500错误：`GET /api/admin/venues?merchant_id=...`

**问题**：API返回500 Internal Server Error

**原因**：
- 使用了`merchants(...)`左连接，可能导致venues没有merchant关联时返回错误
- 缺少空数组处理
- 错误日志不够详细

**修复**：
- 将`merchants(...)`改为`merchants!inner(...)`，确保只返回有merchant关联的venues
- 添加了空数组处理（当没有venues时返回`{ success: true, data: [] }`）
- 改进了错误日志，使用`JSON.stringify`输出完整错误信息

**文件**：`apps/admin-web/app/api/admin/venues/route.ts`

**修改内容**：
```typescript
// 修复前：左连接可能导致问题
.select(`
  ...
  merchants(...)  // ❌ 左连接
`)

// 修复后：内连接 + 空数组处理
.select(`
  ...
  merchants!inner(...)  // ✅ 内连接，只返回有merchant的venues
`)

// 添加空数组处理
if (!venues || venues.length === 0) {
  return NextResponse.json({
    success: true,
    data: [],
  });
}
```

---

## 📋 修改的文件

1. ✅ `apps/admin-web/app/api/admin/merchants/[id]/default-venue/route.ts`
2. ✅ `apps/admin-web/app/api/admin/venues/route.ts`

---

## 🔍 验证方法

### 1. 验证default-venue API

```bash
# 测试获取merchant的default venue
curl -X GET "http://localhost:3002/api/admin/merchants/e23abd23-7362-4e25-92d8-53697fea77a3/default-venue" \
  -H "Cookie: your-auth-cookie"
```

**预期结果**：
- ✅ 如果merchant存在且有default_venue_id：返回200，包含venue详情
- ✅ 如果merchant存在但没有default_venue_id：返回200，`venue: null`
- ✅ 如果merchant不存在：返回404

---

### 2. 验证venues API

```bash
# 测试获取merchant的venues
curl -X GET "http://localhost:3002/api/admin/venues?merchant_id=e23abd23-7362-4e25-92d8-53697fea77a3" \
  -H "Cookie: your-auth-cookie"
```

**预期结果**：
- ✅ 如果merchant有venues：返回200，包含venues数组
- ✅ 如果merchant没有venues：返回200，`data: []`
- ✅ 如果merchant不存在：返回404（merchant查询失败）

---

## 🎯 修复后的行为

### default-venue API

1. ✅ 正确查询merchant的`default_venue_id`
2. ✅ 如果存在`default_venue_id`，查询venue详情并检查`is_active`
3. ✅ 返回格式：
   ```json
   {
     "success": true,
     "data": {
       "merchant_id": "...",
       "merchant_name": "...",
       "default_venue_id": "...",
       "venue": {
         "id": "...",
         "name": "...",
         "address": "...",
         "logo_url": "...",
         "description": "..."
       } // 或 null
     }
   }
   ```

### venues API

1. ✅ 使用内连接确保只返回有merchant关联的venues
2. ✅ 正确处理空数组情况
3. ✅ 改进的错误日志
4. ✅ 返回格式：
   ```json
   {
     "success": true,
     "data": [
       {
         "id": "...",
         "name": "...",
         "address": "...",
         "logo_url": "...",
         "description": "...",
         "merchant": {
           "id": "...",
           "name": "..."
         }
       }
     ] // 或 []
   }
   ```

---

## ✅ 状态

- ✅ default-venue API已修复
- ✅ venues API已修复
- ✅ 错误处理已改进
- ✅ 空数组处理已添加
- ✅ 错误日志已改进

**下一步**：刷新Create Event页面，验证两个API是否正常工作。
