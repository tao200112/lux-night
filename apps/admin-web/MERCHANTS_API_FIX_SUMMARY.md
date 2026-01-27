# Merchants API Infinite Loading Fix - Summary

## Root Cause Analysis

**Verdict:** No obvious pending bugs found in backend, but **frontend lacked timeout protection**.

### Potential Issues Identified:

1. **Frontend Missing Timeout** (PRIMARY FIX)
   - `fetch()` call had no `AbortController`
   - Could hang forever if network/server issues occurred
   - No way to cancel stuck requests

2. **Missing Cache Headers** (SECONDARY FIX)
   - No `Cache-Control` headers on API response
   - Could cause Next.js RSC caching issues
   - Stale data might be served

3. **Insufficient Error Handling** (TERTIARY FIX)
   - Frontend didn't distinguish 401 (auth) from 500 (server error)
   - Generic error messages weren't helpful for debugging

## Files Modified

### 1. `apps/admin-web/app/merchants/page.tsx`

**Changes:**
- Added `AbortController` with 10-second timeout to `fetchMerchants()`
- Added explicit 401 handling with "Please log in again" message
- Improved error messages for timeout vs server errors
- Added `cache: 'no-store'` to fetch options
- Ensured `clearTimeout()` in finally block

**Key Code:**
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000);

const response = await fetch(`/api/admin/merchants?${params.toString()}`, {
  signal: controller.signal,
  cache: 'no-store',
});

// Handle 401 explicitly
if (response.status === 401) {
  setError('Unauthorized. Please log in again.');
  return;
}
```

### 2. `apps/admin-web/app/api/admin/merchants/route.ts`

**Changes:**
- Added `debugId` (8-char UUID) to all responses for log tracing
- Added `Cache-Control` and `Pragma` headers to prevent caching
- Included `debugId` in error logs for easier debugging

**Key Code:**
```typescript
const debugId = randomUUID().substring(0, 8);

const response = NextResponse.json({
  ok: true,
  data: { merchants, regions },
  debugId,
});

response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
response.headers.set('Pragma', 'no-cache');
```

## Backend Already Had (No Changes Needed)

✅ `handlerWrapper` catches all uncaught errors  
✅ `withTimeout` protection on auth and queries (10s)  
✅ All branches return `NextResponse.json()`  
✅ Try/catch around all async operations  
✅ Frontend has `finally` block to stop loading  

## Verification Steps

### 1. Test Unauthenticated Request
```bash
curl http://localhost:3000/api/admin/merchants
```
**Expected:** 401 JSON response (not pending)

### 2. Test Authenticated Request
1. Log in as admin
2. Visit `/merchants` page
3. Check Network tab: request completes within 10s
4. Skeleton disappears, shows data or error

### 3. Test Timeout Protection
1. Simulate slow network (DevTools > Network > Slow 3G)
2. Visit `/merchants` page
3. After 10 seconds, should show "Request timed out" error (not infinite loading)

## How to Verify Fix

1. **Start dev server:**
   ```bash
   cd apps/admin-web
   npm run dev
   ```

2. **Open browser:**
   - Navigate to `http://localhost:3000/merchants`
   - Check Network tab for `/api/admin/merchants` request

3. **Verify behaviors:**
   - ✅ Request completes (200/401/500) within 10 seconds
   - ✅ Skeleton loading stops (no infinite spinner)
   - ✅ Error state shows "Retry" button if failed
   - ✅ Empty state shows if no merchants
   - ✅ Response includes `debugId` field

## Regression Prevention

### For Future API Endpoints:

1. **Always use `AbortController`** with timeout (10s recommended)
2. **Always add cache headers** (`no-store` for dynamic data)
3. **Always handle 401 explicitly** (redirect to login or show message)
4. **Always include `debugId`** in responses for log correlation
5. **Always use `finally`** to stop loading states

### Code Template:

```typescript
// Frontend
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000);

try {
  setLoading(true);
  const response = await fetch('/api/...', {
    signal: controller.signal,
    cache: 'no-store',
  });
  
  if (response.status === 401) {
    setError('Please log in again');
    return;
  }
  
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  
  const result = await response.json();
  // Handle success
} catch (err) {
  if (err.name === 'AbortError') {
    setError('Request timed out');
  } else {
    setError(err.message);
  }
} finally {
  clearTimeout(timeoutId);
  setLoading(false);
}
```

## Impact Assessment

- **Risk:** Low (defensive fixes, no breaking changes)
- **Scope:** Admin-web only (no impact on customer/merchant/staff apps)
- **Dependencies:** None added
- **Breaking Changes:** None

## Next Steps

1. Test locally with above verification steps
2. Deploy to staging
3. Monitor Vercel logs for `debugId` correlation
4. Apply same pattern to other admin API endpoints if needed
