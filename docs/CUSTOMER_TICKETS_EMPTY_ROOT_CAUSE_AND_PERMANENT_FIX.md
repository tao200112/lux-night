# Customer Tickets Empty: Root Cause & Permanent Fix

## Executive Summary

The customer event page shows "No tickets available" at the start of every new week. This is a **recurring production bug** caused by a compound failure of two issues:

1. **PRIMARY**: `rpc_get_or_create_event_week` is `SECURITY INVOKER` (default). When the customer-facing API calls this RPC, the INSERT path (create new week) **fails silently** because customers have no INSERT permission on `event_weeks`, `event_week_days`, or `ticket_types_v2`. The API catches the RPC error, breaks the loop, and returns empty days.

2. **ARCHITECTURAL**: All recurring configuration (enabled days, ticket types, Stripe config) is stored at the **week level** instead of the **event level**. Even when weeks ARE created successfully (by admin), each new week requires new `ticket_types_v2` rows and new Stripe Product/Price objects — creating an unnecessary weekly dependency on admin intervention.

**Impact**: Every Monday, customer-facing sales stop until an admin manually visits the admin dashboard for each event, which triggers the service-role RPC and Stripe sync. For "Ridiculous Chicken Night" and any other recurring weekly event, this means hours of lost revenue each week.

---

## Root Cause Chain

### Root Cause #1: RPC is SECURITY INVOKER — Customer API Cannot Create Weeks

**Evidence:**

The RPC function declaration in `supabase/migrations/20260217120000_rpc_include_sold_count.sql`:

```sql
CREATE OR REPLACE FUNCTION public.rpc_get_or_create_event_week(
  p_event_id UUID,
  p_for_date DATE,
  p_timezone TEXT DEFAULT 'America/New_York'
)
RETURNS TABLE (event_week_id UUID, week_start_date DATE, days JSONB)
LANGUAGE plpgsql
AS $$
-- NO "SECURITY DEFINER" declaration
```

Customer-web server client in `apps/customer-web/lib/supabase/server.ts`:

```typescript
return createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,  // ← NOT service role
  { cookies: { ... } }
);
```

RLS INSERT policies only allow admins (from `supabase/migrations/034_event_week_ticketing_v2.sql`):

```sql
-- event_weeks: only admin can INSERT
CREATE POLICY "event_weeks_admin_all" ON public.event_weeks
  FOR ALL USING (public.is_admin());

-- event_week_days: only admin can INSERT  
CREATE POLICY "event_week_days_admin_all" ON public.event_week_days
  FOR ALL USING (public.is_admin());

-- ticket_types_v2: only admin can INSERT
CREATE POLICY "ticket_types_v2_admin_all" ON public.ticket_types_v2
  FOR ALL USING (public.is_admin());
```

**Failure sequence in `apps/customer-web/app/api/public/events-v2/[id]/upcoming-days/route.ts`:**

```typescript
const supabase = await createClient();  // ← anon key, not service role

for (let w = 0; w < MAX_WEEKS_TO_FETCH && accumulatedDays.length < limit; w++) {
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'rpc_get_or_create_event_week',
    { p_event_id: id, p_for_date: toYYYYMMDD(forDate), p_timezone: timezone }
  );

  if (rpcError || !rpcResult || rpcResult.length === 0) {
    break;  // ← RLS INSERT fails, rpcError is set, loop breaks immediately
  }
  // ... never reached for new weeks
}

return NextResponse.json({ days: accumulatedDays }); // ← empty array
```

The same issue affects internal-web (`apps/internal-web/app/api/events/[id]/week/route.ts`) which also uses the user's auth client.

Only admin-web uses `createAdminClient()` (service role) which bypasses RLS.

### Root Cause #2: Configuration Lives at the Wrong Schema Level

**Current schema hierarchy:**

```
events_v2 (event-level, permanent)
  └── event_weeks (per-week, ephemeral)
        └── event_week_days (per-week per-day)
              └── ticket_types_v2 (per-week per-day per-ticket)
                    ├── stripe_product_id (per-week instance!)
                    └── stripe_price_id (per-week instance!)
```

Every setting that should be "configure once, run forever" is instead "configure once per week":

| Setting | Current Location | Correct Location |
|---------|-----------------|-----------------|
| Which weekdays are active | `event_week_days.enabled` (per week) | Event template |
| Start/end time per day | `event_week_days.start_time/end_time` (per week) | Event template |
| Ticket type name/category/price | `ticket_types_v2` rows (per week) | Event template |
| Ticket inventory limit | `ticket_types_v2.inventory_limit` (per week) | Template + per-week override |
| Ticket sold_count | `ticket_types_v2.sold_count` (per week) | Per-week (correct) |
| Stripe Product ID | `ticket_types_v2.stripe_product_id` (per week) | Template (reusable) |
| Stripe Price ID | `ticket_types_v2.stripe_price_id` (per week) | Template (reusable unless price changes) |

### Root Cause #3: Copy Logic Only Looks Exactly 7 Days Back

In `rpc_get_or_create_event_week` (line 72-76 of latest migration):

```sql
v_prev_week_start := v_week_start_date - INTERVAL '7 days';
SELECT id INTO v_prev_week_id
FROM public.event_weeks ew
WHERE ew.event_id = p_event_id AND ew.week_start_date = v_prev_week_start
LIMIT 1;
```

If no week exists for exactly 7 days ago (e.g., event was dormant for 2+ weeks), `v_prev_week_id` is NULL. The loop then uses defaults:

```sql
DECLARE
  v_enabled BOOLEAN := false;           -- ← all days disabled!
  v_start_time TIME := '16:00';
  v_end_time TIME := '02:00';
  v_end_next_day BOOLEAN := true;
BEGIN
  IF v_prev_week_id IS NOT NULL THEN    -- ← NULL, skipped entirely
    -- copy from previous week...
  END IF;
```

Result: 7 days created with `enabled = false` and zero ticket types.

### Root Cause #4: Stripe Objects Are Intentionally Not Copied

The RPC copy logic explicitly excludes Stripe IDs (line 106-115 of latest migration):

```sql
INSERT INTO public.ticket_types_v2 (
  event_week_day_id, name, category, price_cents, currency,
  min_age, inventory_limit, status, sort_order
  -- 注意：不复制 stripe_product_id 和 stripe_price_id，需要重新创建
)
VALUES (
  v_new_day_id, v_ticket_record.name, ...
);
```

Stripe Product names embed the week date (`apps/admin-web/lib/stripe/event-week-sync.ts` line 57):

```typescript
name: `${eventTitle} - ${weekStartDate} - ${dayName} - ${ticketName}`,
```

This means:
- Each week → new `ticket_types_v2` rows → new Stripe Products + Prices
- The `syncEventWeekStripe` or `syncEventWeekStripeIfNeeded` must run after copy
- Stripe object count grows linearly with weeks (unbounded)

### Root Cause #5: No Background Week Pre-Creation

There is no cron job, background worker, or scheduled function that pre-creates upcoming weeks. Weeks are ONLY created when:
- A customer visits the event page (→ fails due to RLS)
- An admin visits the admin dashboard (→ works, but requires manual action)
- The internal/merchant portal accesses the event (→ also fails due to RLS)

---

## Complete Failure Timeline (Monday Morning)

```
06:00 AM — New week starts. No event_weeks row exists for this week.

07:15 AM — First customer visits /events-v2/[event-id]
  → Frontend calls GET /api/public/events-v2/[id]/upcoming-days?limit=3
  → API calls rpc_get_or_create_event_week via anon key
  → RPC checks: SELECT id FROM event_weeks WHERE ... → NOT FOUND
  → RPC tries: INSERT INTO event_weeks → RLS BLOCKS (authenticated ≠ admin)
  → RPC throws error → API catches it → break
  → API returns { days: [] }
  → Frontend renders "No tickets available"

07:16 AM — All subsequent customers see "No tickets available"

10:30 AM — Admin notices reports, visits admin dashboard
  → Admin API calls rpc_get_or_create_event_week via SERVICE ROLE
  → INSERT succeeds → week created, config copied from last week
  → Admin saves config → syncEventWeekStripe runs → Stripe Products/Prices created
  → Customers can now see tickets

Next Monday — Cycle repeats
```

---

## Why Stripe Config Also Repeats

The checkout flow (`apps/customer-web/app/api/public/checkout-v2/route.ts`) requires `stripe_price_id` to create a Stripe Checkout Session:

```typescript
// Line 231
if (!ticketType.stripe_price_id) {
  throw new Error(`Ticket type ${ticketType.name} is missing Stripe Price ID`);
}

// Line 340
line_items: items.map((item) => {
  const ticketType = ticketTypes.find((tt) => tt.id === item.ticketTypeId)!;
  return { price: ticketType.stripe_price_id, quantity: item.quantity };
}),
```

Since `stripe_price_id` is stored on `ticket_types_v2` (per-week rows), and new week's rows don't have it, the sync must run before checkout can work. Even with `syncEventWeekStripeIfNeeded` in the customer API:

1. The sync requires an existing week with ticket type rows (which can't be created by customers)
2. The sync creates NEW Stripe Products per week (wasteful, creates hundreds over time)
3. Product names include week dates, making them non-reusable

---

## All Callers of `rpc_get_or_create_event_week`

| File | Client Type | Can INSERT? |
|------|-------------|-------------|
| `customer-web/api/public/events-v2/[id]/upcoming-days/route.ts` | `createClient()` (anon key) | **NO** |
| `customer-web/api/public/events-v2/[id]/week/route.ts` | `createClient()` (anon key) | **NO** |
| `internal-web/api/events/[id]/week/route.ts` | `createClient()` (user auth) | **NO** |
| `internal-web/api/events/[id]/change-requests/route.ts` | `createClient()` (user auth) | **NO** |
| `admin-web/api/admin/events/[id]/week/route.ts` (GET & PUT) | `createAdminClient()` (service role) | **YES** |
| `admin-web/api/admin/change-requests/[id]/approve/route.ts` | `createAdminClient()` (service role) | **YES** |
| `admin-web/api/admin/approvals/[id]/approve/route.ts` | `createAdminClient()` (service role) | **YES** |

**5 out of 7 callers CANNOT create new weeks.** Only admin-web routes work.

---

## Proposed Fixes

### Approach A: Minimal Patch (Deploy Today)

**Goal**: Fix the immediate "empty page" symptom with minimum risk.

**Changes:**

1. **Make RPC `SECURITY DEFINER`** with `SET search_path = public` and add event existence validation inside the function.

2. **Improve copy logic** to find the most recent previous week (not just exactly -7 days).

**New migration file**: `supabase/migrations/YYYYMMDDHHMMSS_fix_rpc_security_definer.sql`

```sql
CREATE OR REPLACE FUNCTION public.rpc_get_or_create_event_week(
  p_event_id UUID,
  p_for_date DATE,
  p_timezone TEXT DEFAULT 'America/New_York'
)
RETURNS TABLE (event_week_id UUID, week_start_date DATE, days JSONB)
LANGUAGE plpgsql
SECURITY DEFINER          -- ← FIX: bypass RLS for INSERT operations
SET search_path = public  -- ← Required for SECURITY DEFINER safety
AS $$
DECLARE
  v_week_start_date DATE;
  v_event_week_id UUID;
  v_prev_week_id UUID;
  v_days JSONB := '[]'::JSONB;
  v_new_day_id UUID;
  v_ticket_record RECORD;
  v_event_exists BOOLEAN;
BEGIN
  -- Validate event exists (security check since we're SECURITY DEFINER)
  SELECT EXISTS(SELECT 1 FROM public.events_v2 WHERE id = p_event_id)
  INTO v_event_exists;
  IF NOT v_event_exists THEN
    RAISE EXCEPTION 'Event not found: %', p_event_id;
  END IF;

  v_week_start_date := p_for_date - (EXTRACT(DOW FROM p_for_date)::INT - 1 + 7) % 7;

  -- Check if week already exists
  SELECT id INTO v_event_week_id
  FROM public.event_weeks ew
  WHERE ew.event_id = p_event_id AND ew.week_start_date = v_week_start_date;

  IF v_event_week_id IS NOT NULL THEN
    -- ... (existing SELECT logic, unchanged) ...
    RETURN;
  END IF;

  -- Create new week
  INSERT INTO public.event_weeks (event_id, week_start_date, timezone, status)
  VALUES (p_event_id, v_week_start_date, p_timezone, 'active')
  RETURNING id INTO v_event_week_id;

  -- FIX: Find MOST RECENT previous week (not just exactly -7 days)
  SELECT id INTO v_prev_week_id
  FROM public.event_weeks ew
  WHERE ew.event_id = p_event_id
    AND ew.week_start_date < v_week_start_date
  ORDER BY ew.week_start_date DESC
  LIMIT 1;

  -- ... (rest of copy logic unchanged) ...
END;
$$;
```

**Files changed:**
- `supabase/migrations/YYYYMMDDHHMMSS_fix_rpc_security_definer.sql` (new)

**Schema changes:** None (function replacement only)

**Backward compatibility:** Full. The SELECT path is unchanged. The INSERT path now works for all callers.

**Risk:** Low. The RPC already performs writes when called from admin; we're just allowing all callers to trigger the same logic. The event existence check prevents abuse.

**What happens to "Ridiculous Chicken Night":** Next Monday, when the first customer visits, the RPC will successfully create the new week by copying from the most recent previous week. Stripe sync runs automatically via `syncEventWeekStripeIfNeeded`. No admin intervention needed.

---

### Approach B: Medium-Term Fix (This Sprint)

**Goal**: Eliminate weekly Stripe object churn and provide a fallback when no previous week exists.

**Changes (in addition to Approach A):**

1. **Add `event_day_defaults` table** at event level:

```sql
CREATE TABLE IF NOT EXISTS public.event_day_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events_v2(id) ON DELETE CASCADE,
  dow INT NOT NULL CHECK (dow >= 0 AND dow <= 6),
  enabled BOOLEAN NOT NULL DEFAULT false,
  start_time TIME NOT NULL DEFAULT '16:00',
  end_time TIME NOT NULL DEFAULT '02:00',
  end_next_day BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, dow)
);
```

2. **Add `ticket_type_defaults` table** at event level:

```sql
CREATE TABLE IF NOT EXISTS public.ticket_type_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events_v2(id) ON DELETE CASCADE,
  dow INT NOT NULL CHECK (dow >= 0 AND dow <= 6),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  min_age INT CHECK (min_age IN (18, 21)),
  inventory_limit INT CHECK (inventory_limit >= 0),
  status TEXT NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  stripe_product_id TEXT,   -- reused across all weeks
  stripe_price_id TEXT,     -- reused unless price changes
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

3. **Modify RPC fallback**: When no previous week exists, copy from `event_day_defaults` and `ticket_type_defaults`.

4. **Copy `stripe_product_id`** from defaults/previous week to new ticket types. Only create new `stripe_price_id` if price changed.

5. **Migration**: Populate `event_day_defaults` and `ticket_type_defaults` from the most recent configured week for each existing event.

6. **Admin UI**: When admin saves weekly config, also update `event_day_defaults` and `ticket_type_defaults` (or add a separate "Set as Default" button).

**Files changed:**
- New migration (schema + RPC + data backfill)
- `apps/admin-web/app/api/admin/events/[id]/week/route.ts` (update defaults on save)
- `apps/admin-web/lib/stripe/event-week-sync.ts` (reuse stripe_product_id)
- `apps/customer-web/lib/stripe/event-week-sync.ts` (reuse stripe_product_id)
- Admin frontend (optional: template editor)

**Schema changes:** 2 new tables, updated RPC

**Backward compatibility:** Full. Existing events get defaults populated from migration. New events get defaults when first configured.

**Risk:** Medium. Need to ensure the template-to-weekly copy logic is well-tested. Two sources of truth (template + weekly overrides) adds complexity.

**What happens to "Ridiculous Chicken Night":** Migration populates defaults from its most recent week. All future weeks auto-create from defaults with working Stripe config. Zero admin intervention ever needed for standard weeks.

---

### Approach C: Correct Long-Term Architecture

**Goal**: Eliminate the per-week proliferation entirely. Weeks become lightweight instance records.

**Changes:**

1. **Restructure schema:**

```
events_v2 (permanent)
  ├── event_day_configs (permanent, event-level)
  │     └── ticket_type_configs (permanent, event-level)
  │           ├── stripe_product_id (shared)
  │           └── stripe_price_id (shared, updated on price change)
  └── event_weeks (lightweight weekly instances)
        └── event_week_day_instances (only stores sold_count, overrides)
              └── ticket_instances (only stores sold_count, weekly overrides)
```

2. **`ticket_type_configs`** (event-level, permanent):
   - All ticket metadata (name, category, price, min_age, inventory_limit)
   - Stripe Product/Price IDs (reused across weeks)
   - `status` (active/hidden)

3. **`ticket_instances`** (per-week, lightweight):
   - References `ticket_type_configs.id`
   - Only stores: `sold_count`, optional weekly overrides (inventory_limit_override, status_override)

4. **Customer API reads from `ticket_type_configs`** directly, with `sold_count` from the weekly instance.

5. **Checkout uses `stripe_price_id` from `ticket_type_configs`** (never changes per-week).

6. **RPC becomes `rpc_ensure_event_week`**: Creates the lightweight week record and instance rows, but config comes from permanent tables.

**Files changed (major):**
- New migration (create new tables, migrate data, update RPC)
- All customer-web API routes that read ticket data
- All admin-web API routes that write ticket data
- Admin frontend (event configuration page)
- Checkout flow (reference config instead of instances)
- Stripe sync (sync configs once, not per-week)
- Webhook (update sold_count on correct instance)

**Schema changes:** 2-3 new tables, significant data migration, RPC rewrite

**Backward compatibility:** Breaking. Requires coordinated deployment with frontend changes.

**Risk:** High. Full schema restructuring with data migration. Requires thorough testing.

**What happens to "Ridiculous Chicken Night":** Migration converts all existing data to the new schema. Config is set once, reused forever. Stripe objects created once per ticket type, never duplicated.

---

## Recommendation

### Deploy Approach A immediately (today).

It fixes the production bug with a single migration file and zero application code changes. The RPC already performs the exact same writes when called from admin — we're just allowing it to work for all callers with proper input validation.

### Plan Approach B for this sprint.

It addresses the root architectural issue (config at wrong level) with moderate risk. The key wins:
- Events work forever after first configuration
- Stripe objects stop proliferating
- No weekly admin intervention needed
- Backward compatible with existing data

### Consider Approach C for next quarter.

Only if the team has bandwidth and the event model needs fundamental changes (e.g., supporting non-weekly recurrence, per-week pricing overrides, etc.).

---

## Implementation Plan for Approach A

### Step 1: Create Migration

File: `supabase/migrations/YYYYMMDDHHMMSS_fix_rpc_security_definer.sql`

The migration replaces the existing RPC with a `SECURITY DEFINER` version that:
- Validates event existence before any writes
- Finds the most recent previous week (not just -7 days)
- Copies all settings (enabled, times, ticket types) from the most recent week
- Uses `SET search_path = public` for security

### Step 2: Deploy

```bash
npx supabase db push
```

### Step 3: Verify

```sql
-- Check function security type
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'rpc_get_or_create_event_week';
-- Expected: prosecdef = true
```

Test from customer API:
```bash
curl -s "https://[app-url]/api/public/events-v2/[event-id]/upcoming-days?limit=3" \
  | jq '.days | length'
# Expected: > 0 (not 0)
```

---

## Regression Test Plan

### Test 1: New Week Auto-Creation (Customer)
1. Delete the current week's `event_weeks` row for a test event
2. Visit the customer event page (unauthenticated or as regular user)
3. Verify tickets are displayed (not "No tickets available")
4. Verify the new `event_weeks` row was created
5. Verify `event_week_days` has correct `enabled` flags from the previous week
6. Verify `ticket_types_v2` rows were copied with correct config

### Test 2: Stripe Sync After Auto-Creation
1. After Test 1, verify `stripe_price_id` is populated on the new ticket types
2. Attempt a checkout flow — should succeed without errors

### Test 3: Gap Handling (2+ Week Gap)
1. Create a test event with config in week N
2. Skip week N+1 (don't create it)
3. Call the RPC for week N+2
4. Verify it copies from week N (most recent, not just N+1)

### Test 4: First-Ever Week (No Previous)
1. Create a brand new event with no weeks
2. Call the RPC — should create a week with default disabled days
3. Admin configures the week — should work normally

### Test 5: Existing Events Unaffected
1. Visit an event that already has this week configured
2. Verify it returns the existing config (no duplicate creation)
3. Verify sold_count is preserved

### Test 6: Internal Portal
1. Visit the internal/merchant portal for an event
2. Verify the week is visible (same RPC now works for internal users)

### Test 7: Admin Portal
1. Verify admin can still create/edit weeks normally
2. Verify Stripe sync still works via admin save

### Test 8: Security
1. Attempt to call the RPC with a non-existent event ID
2. Verify it returns an error (not a crash or leak)
3. Attempt to call the RPC without authentication
4. Verify RLS still prevents reading sensitive data

---

## Appendix: DOW Convention Note

The schema comment says `-- 0=Monday, 1=Tuesday, ..., 6=Sunday` but the actual convention used throughout the codebase matches PostgreSQL's `EXTRACT(DOW)`: `0=Sunday, 1=Monday, ..., 6=Saturday`. The code handles this correctly via the offset formula `(day.dow + 6) % 7` to convert from Sunday-based DOW to Monday-based offset. The comment is incorrect documentation, not a code bug.
