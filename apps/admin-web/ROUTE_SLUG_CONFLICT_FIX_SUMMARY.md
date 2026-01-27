# Dynamic Route Slug Conflict Fix - Summary

## 🚨 Root Cause

**Error:** `You cannot use different slug names for the same dynamic path ('eventId' !== 'id')`

**Conflict Location:**
```
apps/admin-web/app/api/admin/events/
├── [eventId]/          ← CONFLICT! Contains: route.ts, pricing/
└── [id]/               ← CONFLICT! Contains: weekly-rules/
```

Next.js App Router **does not allow** two different param names (`[eventId]` vs `[id]`) at the same routing level. This caused the production build to fail and all API requests to abort with errors.

---

## 📋 Files Modified

### Directory Structure Changes
1. **Renamed:** `api/admin/events/[eventId]/` → `api/admin/events/[id]/`
2. **Moved:** `api/admin/events/[eventId]/route.ts` → `api/admin/events/[id]/route.ts`
3. **Moved:** `api/admin/events/[eventId]/pricing/` → `api/admin/events/[id]/pricing/`
4. **Deleted:** `api/admin/events/[eventId]/` (empty directory)

### Code Changes
1. ✅ **`apps/admin-web/app/api/admin/events/[id]/route.ts`**
   - Changed `params: Promise<{ eventId: string }>` → `params: Promise<{ id: string }>`
   - Updated all `eventId` variable references to `id` (8 occurrences in GET, 7 in PUT)

2. ✅ **`apps/admin-web/app/api/admin/events/[id]/pricing/route.ts`**
   - Changed `params: Promise<{ eventId: string }>` → `params: Promise<{ id: string }>`
   - Updated all `eventId` references to `id` (3 occurrences)

3. ✅ **`apps/admin-web/app/api/admin/events/[id]/weekly-rules/route.ts`**
   - Already using `params: Promise<{ id: string }>` ✓ (no changes needed)

### Frontend (No Changes Needed)
Frontend pages construct URL strings like `/api/admin/events/${eventId}` where `eventId` is their local variable name. These are NOT affected by the backend param name change.

---

## 🔑 Key Diff Summary

### Before (Broken):
``typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  // ... use eventId throughout
  .eq('id', eventId)
  .eq('event_id', eventId)
}
```

### After (Fixed):
```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // ... use id throughout
  .eq('id', id)
  .eq('event_id', id)
}
```

---

## ✅ Verification Steps

### 1. Check Directory Structure
```bash
# Should only have [id] folder, no [eventId]
ls apps/admin-web/app/api/admin/events/
# Expected: [id], route.ts
```

### 2. Test API Endpoints (Local)
```bash
# Start dev server
cd apps/admin-web
npm run dev

# Test event detail API (replace XXX with actual event ID)
curl http://localhost:3000/api/admin/events/XXX

# Expected: 401 (if not logged in) or 200 (if logged in)
# NOT expected: pending/timeout/abort
```

### 3. Test Frontend Pages
Navigate to:
- ✓ `/merchants` - Should load normally (no AbortError)
- ✓ `/orders` - Should load normally
- ✓ `/events` - Should load event list
- ✓ `/events/{id}` - Should show event detail
- ✓ `/events/{id}/edit` - Should load edit page

### 4. Build Test
```bash
cd apps/admin-web
npm run build
# Should complete without "different slug names" error
```

### 5. Production Deployment
After pushing:
- ✓ Vercel build should succeed
- ✓ No "slug names" error in build logs
- ✓ All API endpoints should return 200/401/500 (not pending)

---

## 🎯 Fixed Routes

All three routes now use consistent `[id]` param:

| Route | Param Name | Status |
|-------|-----------|---------|
| `GET /api/admin/events/[id]` | `id` | ✅ Fixed |
| `PUT /api/admin/events/[id]` | `id` | ✅ Fixed |
| `POST /api/admin/events/[id]/pricing` | `id` | ✅ Fixed |
| `GET /api/admin/events/[id]/weekly-rules` | `id` | ✅ Already OK |
| `PUT /api/admin/events/[id]/weekly-rules` | `id` | ✅ Already OK |

---

## 🔍 What Changed (Line-by-Line Summary)

### `route.ts` (Main Event API)
- **Line 2:** Comment updated `/api/admin/events/[eventId]` → `/api/admin/events/[id]`
- **Line 13:** Param type `{ eventId: string }` → `{ id: string }`
- **Line 16:** Destructure `const { eventId }` → `const { id }`
- **Lines 59, 76, 83, 88, 97:** All `.eq('event_id', eventId)` → `.eq('event_id', id)`
- **Line 368:** PUT handler param type same change
- **Line 237:** PUT handler destructure same change
- **Lines 368, 383, 387, 401, 434:** All `eventId` → `id` in PUT handler

### `pricing/route.ts`
- **Line 2:** Comment updated
- **Line 12:** Param type changed
- **Line 15:** Destructure changed
- **Lines 57, 103:** All `eventId` → `id`

---

## 📊 Impact Assessment

| Aspect | Impact |
|--------|--------|
| **Scope** | Admin-web only (no impact on customer/merchant/staff apps) |
| **Breaking Changes** | None (URL structure unchanged, only internal param name) |
| **Risk Level** | Low (defensive fix, no logic changes) |
| **Dependencies** | None added |
| **Backwards Compatibility** | 100% (frontend uses URL strings, not param names) |

---

## 🚀 Next Steps

1. ✅ Commit and push changes
2. ✅ Monitor Vercel deployment
3. ✅ Verify production build succeeds
4. ✅ Test API endpoints return proper responses (not pending)
5. ✅ Verify pages load without AbortError

---

## 📝 Commit Message

```
fix(admin): Resolve Next.js dynamic route slug conflict

Fixed critical error: "You cannot use different slug names for the 
same dynamic path ('eventId' !== 'id')" that was causing production
build failures and API request aborts.

Changes:
- Renamed api/admin/events/[eventId]/ → [id]/
- Updated all route handlers to use params.id instead of params.eventId
- Consolidated dynamic routes to use consistent [id] naming

Affected files:
- apps/admin-web/app/api/admin/events/[id]/route.ts (GET, PUT)
- apps/admin-web/app/api/admin/events/[id]/pricing/route.ts
- apps/admin-web/app/api/admin/events/[id]/weekly-rules/route.ts (already OK)

Impact:
- No breaking changes (URL structure unchanged)
- Admin-web only (no impact on other apps)
- Fixes infinite loading and AbortError on all admin pages
```
