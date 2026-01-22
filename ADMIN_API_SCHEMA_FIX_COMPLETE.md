# Admin Web Schema Fix - Complete Report

**Created**: 2026-01-22  
**Status**: ✅ COMPLETE  
**Build**: ✅ SUCCESS

---

## 🎯 Root Cause Analysis

### 1. `/api/admin/approvals` - 500 Error
**Error**: `column requests.event_id does not exist`

**Root Cause**:
- API 查询了不存在的字段 `event_id`、`payload_before`、`payload_after`
- 实际 schema 中 `requests` 表只有 `merchant_id`、`venue_id`、`payload`

**Affected Code**: `apps/admin-web/app/api/admin/approvals/route.ts` (lines 51-65)

---

### 2. `/api/admin/orders` - 500 Error
**Error**: `Could not find a relationship between 'orders' and 'profiles'`

**Root Cause**:
- API 使用了不存在的外键 `profiles!orders_customer_id_fkey`
- API 查询了不存在的字段 `customer_id`、`total_cents`
- 实际 schema 中 `orders` 表使用 `user_id`，只有 `amount_cents`

**Affected Code**: `apps/admin-web/app/api/admin/orders/route.ts` (lines 58-76)

---

### 3. `/api/admin/merchants` - 500 Error
**Error**: `Failed to fetch merchants`

**Root Cause**:
- API 查询逻辑正确，但返回响应使用 `ok` 字段
- 前端页面检查 `result.success` 导致解析失败

**Affected Code**: `apps/admin-web/app/merchants/page.tsx` (line 76)

---

## 🔧 Modifications List

### A. API Routes (Backend)

#### 1. `apps/admin-web/app/api/admin/approvals/route.ts`
**Changes**:
- ❌ 删除查询字段: `event_id`, `payload_before`, `payload_after`
- ✅ 添加查询字段: `payload`, `decided_by`
- ✅ 更新响应格式: 返回 `payload` 而非分离的 before/after

**Fixed Query**:
```typescript
.select(`
  id,
  type,
  status,
  payload,           // ← NEW (was payload_before + payload_after)
  admin_note,
  requested_by,
  decided_by,        // ← NEW
  created_at,
  decided_at,
  merchant_id,
  venue_id
  // event_id removed (doesn't exist)
`)
```

---

#### 2. `apps/admin-web/app/api/admin/orders/route.ts`
**Changes**:
- ❌ 删除外键 join: `profiles!orders_customer_id_fkey(...)`
- ❌ 删除字段: `customer_id`, `total_cents`, `payment_intent_id`
- ✅ 添加字段: `user_id`, `stripe_payment_intent_id`
- ✅ 改为两段查询:
  1. 查询 orders（无 join）
  2. 单独查询 profiles，按 `user_id` 批量获取
  3. 在代码中合并数据

**Fixed Query**:
```typescript
// Step 1: Query orders (no FK dependency)
.select(`
  id,
  status,
  amount_cents,    // ← Only this exists (not total_cents)
  user_id,         // ← Correct field (not customer_id)
  stripe_payment_intent_id,
  created_at
`)

// Step 2: Fetch profiles separately
adminClient
  .from('profiles')
  .select('id, display_name, email')
  .in('id', userIds)

// Step 3: Merge in code
const profile = profilesMap[order.user_id];
```

---

#### 3. `apps/admin-web/lib/admin/api.ts`
**Changes**:
- ✅ 添加类型字段: `hint?: string`, `route?: string` 到 `ApiErrorResponse`

**Updated Type**:
```typescript
export interface ApiErrorResponse {
  ok: false;
  error: string;
  code: string;
  message: string;
  details?: any;
  hint?: string;   // ← NEW: 提示信息
  route?: string;  // ← NEW: API 路由路径
  step?: string;
}
```

---

#### 4. `apps/admin-web/app/api/admin/schema-check/route.ts` (NEW)
**Purpose**: 启动时自检 schema，输出缺失字段/外键

**Features**:
- 检查 4 个关键表: `requests`, `orders`, `merchants`, `profiles`
- 验证已知缺失字段 (如 `event_id`, `customer_id`, `total_cents`)
- 检查外键是否存在 (如 `orders_customer_id_fkey`)
- 返回详细的缺失项列表

**Usage**:
```bash
GET /api/admin/schema-check

Response:
{
  "ok": true,
  "data": {
    "tables": [...],
    "summary": {
      "missingFields": [
        { "table": "requests", "field": "event_id", "expectedType": "UUID" },
        { "table": "orders", "field": "customer_id", "expectedType": "UUID" }
      ],
      "missingForeignKeys": [
        { "table": "orders", "foreignKey": "orders_customer_id_fkey" }
      ]
    }
  }
}
```

---

### B. Frontend Pages

#### 1. `apps/admin-web/app/approvals/page.tsx`
**Changes**:
- ✅ 兼容 `ok` 和 `success` 响应字段
- ✅ 更新 Approval 接口: 移除 `payloadBefore/After`，添加 `payload`
- ✅ 修复数据访问: `result.data.approvals` (旧: `result.data.requests`)
- ✅ 更新显示逻辑: `approval.payload?.title` (旧: `approval.payloadAfter?.title`)
- ✅ 修复用户显示: `requestedBy` 现在是 UUID string，显示为 `User abc123...`

**Fixed Code**:
```typescript
interface Approval {
  // ...
  payload?: any;        // ← NEW (was payloadBefore + payloadAfter)
  requestedBy?: string; // ← Changed from object to string (UUID)
}

// Fetch
if (!result.ok && !result.success) { ... }
setApprovals(result.data?.approvals || result.data?.requests || []);

// Display
const eventName = approval.payload?.title || approval.payload?.name || 'Unknown Event';
const userId = approval.requestedBy ? `User ${approval.requestedBy.slice(0, 8)}...` : 'Unknown';
```

---

#### 2. `apps/admin-web/app/orders/page.tsx`
**Changes**:
- ✅ 兼容 `ok` 和 `success` 响应字段
- ✅ 更新 Order 接口: 添加 `userId`, `customerName`, `customerEmail`
- ✅ 修复显示逻辑:
  - 用户名: `order.customerName || order.user?.name` (向后兼容)
  - 金额: `order.amountFormatted` (API 返回格式化后的值)

**Fixed Code**:
```typescript
interface Order {
  // ...
  amountFormatted: string; // ← API returns formatted value
  userId?: string;         // ← NEW (was customer_id)
  customerName?: string;   // ← NEW (from separate profile query)
  customerEmail?: string;  // ← NEW
}

// Display
{order.customerName || order.user?.name || 'Unknown User'}
{order.customerEmail && <span>{order.customerEmail}</span>}
```

---

#### 3. `apps/admin-web/app/merchants/page.tsx`
**Changes**:
- ✅ 兼容 `ok` 和 `success` 响应字段
- ✅ 添加可选链: `result.data?.merchants`, `result.data?.regions`

**Fixed Code**:
```typescript
if (!result.ok && !result.success) { ... }
setMerchants(result.data?.merchants || []);
setRegions(result.data?.regions || []);
```

---

## 📊 Verification Checklist

### ✅ Build & Type Check
```bash
cd apps/admin-web
pnpm build
# ✅ SUCCESS: Compiled successfully
# ✅ No TypeScript errors
# ✅ All pages generated correctly
```

### 🧪 API Testing Guide

#### 1. Test Schema Check
```bash
curl https://your-admin-web.vercel.app/api/admin/schema-check \
  -H "Cookie: sb-..."

Expected: 200 JSON with missing fields list
```

#### 2. Test Approvals API
```bash
curl https://your-admin-web.vercel.app/api/admin/approvals \
  -H "Cookie: sb-..."

Expected: 200 JSON with { ok: true, data: { approvals: [...] } }
Should NOT have: event_id, payload_before, payload_after
Should HAVE: payload, decided_by
```

#### 3. Test Orders API
```bash
curl https://your-admin-web.vercel.app/api/admin/orders \
  -H "Cookie: sb-..."

Expected: 200 JSON with { ok: true, data: { orders: [...] } }
Each order should have:
- userId (not customer_id)
- amountFormatted (not totalFormatted)
- customerName (from separate query)
- customerEmail (optional)
```

#### 4. Test Merchants API
```bash
curl https://your-admin-web.vercel.app/api/admin/merchants \
  -H "Cookie: sb-..."

Expected: 200 JSON with { ok: true, data: { merchants: [...], regions: [...] } }
```

---

## 🚀 Deployment

### Required Vercel Environment Variables
All existing variables remain the same. No new env vars needed.

### Vercel Build Settings
- **Root Directory**: `apps/admin-web`
- **Framework**: Next.js
- **Build Command**: `pnpm --filter admin-web build`
- **Install Command**: `cd ../.. && pnpm install`
- **Output**: `.next`
- **Node Version**: 20.x (recommended)

---

## 🗂️ Files Changed Summary

| File | Type | Changes |
|------|------|---------|
| `apps/admin-web/app/api/admin/approvals/route.ts` | API | 删除不存在字段, 更新查询 |
| `apps/admin-web/app/api/admin/orders/route.ts` | API | 移除FK join, 改为两段查询 |
| `apps/admin-web/app/api/admin/schema-check/route.ts` | API | **NEW** - Schema 自检 API |
| `apps/admin-web/lib/admin/api.ts` | Types | 添加 hint/route 字段 |
| `apps/admin-web/app/approvals/page.tsx` | Frontend | 更新接口和显示逻辑 |
| `apps/admin-web/app/orders/page.tsx` | Frontend | 更新接口和显示逻辑 |
| `apps/admin-web/app/merchants/page.tsx` | Frontend | 兼容 ok/success 响应 |

**Total**: 7 files modified

---

## 📝 Commit Message

```
fix(admin-web): resolve schema mismatch errors in approvals/orders/merchants APIs

Schema Fixes:
- /api/admin/approvals: Remove non-existent fields (event_id, payload_before/after)
- /api/admin/orders: Replace FK join with two-stage query (user_id vs customer_id)
- Add /api/admin/schema-check for startup diagnostics

Frontend Updates:
- Update Approval/Order interfaces to match API response
- Support both 'ok' and 'success' response fields (backward compatible)
- Fix display logic for customerName/requestedBy

Types:
- Add 'hint' and 'route' fields to ApiErrorResponse

Files Changed:
- apps/admin-web/app/api/admin/approvals/route.ts
- apps/admin-web/app/api/admin/orders/route.ts
- apps/admin-web/app/api/admin/schema-check/route.ts (NEW)
- apps/admin-web/lib/admin/api.ts
- apps/admin-web/app/approvals/page.tsx
- apps/admin-web/app/orders/page.tsx
- apps/admin-web/app/merchants/page.tsx

Build: ✅ SUCCESS (TypeScript, Next.js)
```

---

## 🎉 Expected Outcome

### Before (Production Errors)
```
❌ /api/admin/approvals   → 500: column requests.event_id does not exist
❌ /api/admin/orders      → 500: Could not find relationship orders->profiles
❌ /api/admin/merchants   → 500: Failed to fetch (frontend parse error)
```

### After (All Fixed)
```
✅ /api/admin/approvals   → 200: Returns approvals with payload
✅ /api/admin/orders      → 200: Returns orders with merged profile data
✅ /api/admin/merchants   → 200: Returns merchants with regions
✅ /api/admin/schema-check → 200: Reports missing fields (for diagnostics)
```

---

## 🔍 Troubleshooting

### If APIs still return 500 after deployment:

1. **Check schema-check API first**:
   ```bash
   curl https://your-domain/api/admin/schema-check
   ```
   - If missingFields is not empty → Database schema needs migration
   - If missingForeignKeys is not empty → Add foreign keys or update query logic

2. **Check Vercel Logs**:
   - Look for `[ADMIN API]` entries with step tracking
   - Error messages now include `hint` and `route` fields

3. **Verify Database Schema**:
   ```sql
   -- Check requests table
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'requests';
   
   -- Check orders table
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'orders';
   ```

4. **Test Locally**:
   ```bash
   cd apps/admin-web
   pnpm dev
   # Visit http://localhost:3002/api/admin/schema-check
   ```

---

## ✨ Next Steps

1. ✅ Commit changes
2. ✅ Push to GitHub
3. ✅ Vercel auto-deploys
4. 🧪 Test all 4 APIs in production
5. 📊 Check `/api/admin/schema-check` for any remaining issues
6. 🎯 Fix any other admin pages that use `result.success` (see grep results earlier)

---

**Status**: Ready for deployment 🚀
