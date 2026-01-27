# Merchants API Test Script

## Test 1: Unauthenticated Request (Should Return 401)

```bash
curl -X GET http://localhost:3000/api/admin/merchants \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected Result:**
- HTTP Status: 401
- Response body: `{"ok":false,"error":"Unauthorized","code":"UNAUTHENTICATED","message":"Must be logged in"}`

---

## Test 2: Authenticated Request (Should Return 200)

**Prerequisites:** You must be logged in as an admin user in your browser.

1. Open browser DevTools (F12)
2. Go to Application > Cookies
3. Copy the value of `sb-<project-ref>-auth-token` cookie
4. Run:

```bash
curl -X GET http://localhost:3000/api/admin/merchants \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-<project-ref>-auth-token=<YOUR_TOKEN_HERE>" \
  -w "\nHTTP Status: %{http_code}\n"
```

**Expected Result:**
- HTTP Status: 200
- Response body: `{"ok":true,"data":{"merchants":[...],"regions":[...]},"step":"success","debugId":"<8-char-id>"}`

---

## Test 3: Timeout Test (Manual)

1. Open browser
2. Navigate to `/merchants` page
3. Open Network tab in DevTools
4. Check that `/api/admin/merchants` request:
   - Completes within 10 seconds
   - Returns 200 or error (never pending forever)
   - Frontend shows either data, error message, or empty state (never infinite skeleton)

---

## Test 4: Browser Direct Access

1. Open browser while logged in as admin
2. Navigate to: `http://localhost:3000/api/admin/merchants`
3. Should see JSON response immediately (not spinning forever)

---

## Verification Checklist

- [ ] Unauthenticated request returns 401 JSON (not pending)
- [ ] Authenticated request returns 200 with data array
- [ ] Request completes within 10 seconds (timeout protection works)
- [ ] Frontend skeleton disappears after loading (no infinite loading)
- [ ] Error state shows "Retry" button when API fails
- [ ] Empty state shows when no merchants exist
- [ ] Response includes `debugId` field for log tracing
