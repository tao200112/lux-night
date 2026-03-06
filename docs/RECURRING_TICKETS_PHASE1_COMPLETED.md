# Phase 1 Completed — Recurring Tickets Template System

## Summary

Phase 1 implements the recurring ticket template system where templates are generation sources and instances are fully materialized working snapshots. No runtime template reads in checkout/webhook/customer paths. No override columns. No hidden dual-write.

---

## Exact Files Changed

### New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260226210000_add_template_tables.sql` | Schema: template tables, FK columns, RLS policies, backfill |
| `supabase/migrations/20260226220000_rpc_template_based_creation.sql` | RPC: template-first creation + ON CONFLICT concurrency safety |
| `apps/admin-web/lib/stripe/template-sync.ts` | Stripe sync for template ticket types |
| `apps/admin-web/app/api/admin/events/[id]/templates/route.ts` | Admin GET/PUT API for template CRUD |
| `supabase/tests/test_template_system.sql` | SQL verification tests (10 test scenarios) |

### Modified Files

| File | Change |
|------|--------|
| `apps/admin-web/app/(admin)/events/[id]/week/page.tsx` | Added "Recurring" tab for template editing |

### Unchanged Files (explicitly preserved)

- All customer-web files (checkout-v2, webhook, upcoming-days, week, event-week-sync)
- All internal-web files (dashboard, change-requests, week)
- Admin-web: `PUT /week` endpoint, `syncEventWeekStripe`, `syncTicketTypeStripe`, publish, approvals
- `increment_ticket_type_v2_sold` RPC
- `merchant_change_requests` table and logic
- All frontend rendering of ticket data

---

## Exact Migrations Added

### `20260226210000_add_template_tables.sql`

1. **`event_day_templates`** table with UNIQUE(event_id, dow)
2. **`ticket_type_templates`** table with FK to event_day_templates
3. **`template_id`** FK column on `event_week_days` (nullable, SET NULL on delete)
4. **`template_id`** FK column on `ticket_types_v2` (nullable, SET NULL on delete)
5. **RLS policies** mirroring existing security model:
   - Admin: `FOR ALL USING (public.is_admin())`
   - Internal: `FOR SELECT` with merchant_members join
   - Customer: `FOR SELECT` with event status check
6. **Backfill**: for each event, copies from the most recently updated week that has at least one enabled day
   - Idempotent: skips events that already have templates
   - Per-day duplicate guard: checks ticket count before inserting
   - Reuses existing Stripe IDs from source week

### `20260226220000_rpc_template_based_creation.sql`

Replaces `rpc_get_or_create_event_week` with template-aware version:
- **Template path**: copies from `event_day_templates` + `ticket_type_templates`
- **Legacy fallback**: copies from most recent previous week (for events without templates)
- **Stripe IDs inherited**: `stripe_product_id` and `stripe_price_id` copied from templates
- **`template_id` set**: on new `event_week_days` and `ticket_types_v2` rows
- **`sold_count = 0`**: on all new ticket instances
- **Concurrency safety**:
  - `event_weeks`: `INSERT ... ON CONFLICT (event_id, week_start_date) DO NOTHING` + SELECT
  - `event_week_days`: `INSERT ... ON CONFLICT (event_week_id, dow) DO NOTHING` + fallback SELECT
  - `ticket_types_v2`: existence guard (`NOT EXISTS` check before insert)
  - Concurrent callers that arrive after days exist get early return
- **Return type unchanged**: same JSONB shape as before

---

## Exact Behavior Implemented

### A. Template Tables
- `event_day_templates`: 7 rows per event (dow 0-6), stores enabled/start_time/end_time/end_next_day
- `ticket_type_templates`: N rows per day template, stores name/category/price_cents/currency/min_age/inventory_limit/status/sort_order/stripe_product_id/stripe_price_id

### B. Template-Based Week Creation
- When RPC detects no existing week, checks for templates first
- If templates exist: creates all 7 event_week_days + ticket_types_v2 from templates
- If no templates: falls back to copying from most recent previous week
- Stripe IDs inherited — no Stripe API calls during auto-creation
- All 7 days created regardless of enabled status (disabled days get ticket rows too)

### C. Template Stripe Sync
- `syncTemplateStripe(eventId)`: creates/updates Stripe Products and Prices for templates
- Product names: `"{eventTitle} – {dayName} – {ticketName}"` (no week date)
- Correctly reuses existing Products/Prices when IDs already set
- Called from template PUT endpoint; failure is non-blocking

### D. Admin Template API
- `GET /api/admin/events/[id]/templates`: returns all template days + ticket types
- `PUT /api/admin/events/[id]/templates`: upserts templates, runs Stripe sync, returns updated data + sync status
- PUT writes ONLY to template tables — never writes to instance tables
- Rate limited via existing `rateLimitPolicies.sensitivePost`

### E. Admin UI
- New "Recurring" tab in the event week config page
- Same UI patterns as "This Week" tab (day toggles, ticket editor, quick-add)
- Blue banner: "Changes here apply to all future weeks only"
- Stripe sync warnings displayed inline
- Save button specific to templates
- Completely separate from "This Week" editing — no dual-write

### F. Concurrency Safety
- `event_weeks`: ON CONFLICT DO NOTHING + SELECT for ID
- `event_week_days`: ON CONFLICT DO NOTHING + fallback SELECT
- `ticket_types_v2`: NOT EXISTS guard before insert
- Early return if concurrent call already populated days

---

## Outstanding Issues Fixed

### Issue 1: Migration Filenames
**Fixed.** Using valid YYYYMMDDHHMMSS format:
- `20260226210000` = Feb 26, 2026 at 21:00:00
- `20260226220000` = Feb 26, 2026 at 22:00:00

Both sort correctly after the existing `20260226200000_fix_rpc_security_definer.sql`.

### Issue 2: RLS Policies
**Fixed.** Policies mirror the existing security model exactly:
- Admin: `FOR ALL USING (public.is_admin())` — same as `event_weeks`, `event_week_days`, `ticket_types_v2`
- Internal: `FOR SELECT` with `merchant_members` join through `events_v2` — same pattern as `event_weeks`
- Customer: `FOR SELECT` with `events_v2.status IN ('active', 'paused')` — same pattern as `event_weeks`

No overly permissive `USING (true)` policies.

### Issue 3: Backfill Idempotency / Duplicate Prevention
**Fixed.** Three layers of protection:
1. **Event-level check**: `IF EXISTS (SELECT 1 FROM event_day_templates WHERE event_id = v_event.id) THEN CONTINUE`
2. **Day-level**: `INSERT ... ON CONFLICT (event_id, dow) DO NOTHING` on `event_day_templates`
3. **Ticket-level**: `SELECT count(*) ... WHERE event_day_template_id = v_template_day_id` — only inserts tickets if count is 0

This prevents duplicates even if migration runs multiple times or fails mid-execution.

### Issue 4: DOW / Day-Name Mapping
**Fixed.** Consistent DOW convention throughout:
- Schema: dow 0=Sunday, 1=Monday, ..., 6=Saturday (matches JS/PG convention)
- Schema comment corrected from the original `0=Monday` to accurately reflect code behavior
- Template Stripe sync uses `DAY_NAMES = ['Sunday', 'Monday', ..., 'Saturday']` — matches existing `syncEventWeekStripe` and `syncEventWeekStripeIfNeeded`
- Admin UI uses the same `DAY_LABELS` array for template rendering

---

## Deviations from Plan

None. Implementation follows the approved plan exactly:
- Phase 1A: Schema + Backfill — implemented as specified
- Phase 1B: RPC Upgrade — implemented as specified
- Phase 1C: Template Stripe Sync — implemented as specified
- Phase 1D: Admin UI + API — implemented as specified

---

## Test Coverage

### SQL Verification Tests (`supabase/tests/test_template_system.sql`)

| Test | Scenario | What It Verifies |
|------|----------|-----------------|
| 1 | Migration/backfill | Template tables exist |
| 2 | Backfill completeness | All configured active events have templates |
| 3 | FK columns | `template_id` columns exist on instance tables |
| 4 | New week from templates | RPC creates week from templates with Stripe ID inheritance |
| 4b | Template linkage | Instance rows have `template_id` set |
| 5 | Concurrency safety | Second RPC call returns same week (no duplicates) |
| 5b | Day deduplication | No duplicate `event_week_days` rows |
| 6 | sold_count initialization | All new instance tickets have `sold_count = 0` |
| 7 | Legacy fallback | Events without templates use previous-week copy |
| 8 | Template/instance isolation | `ticket_type_templates` FK points to `event_day_templates` (not instances) |
| 9 | RLS | Correct number of RLS policies on template tables |
| 10 | Duplicate detection | Monitoring query for template-sourced ticket duplicates |

### Implicit Coverage (unchanged code paths)

| Scenario | Why Covered |
|----------|-------------|
| Customer checkout path unchanged | checkout-v2 reads `ticket_types_v2` directly — no code changes |
| Webhook path unchanged | webhook reads `ticket_types_v2` and order_items — no code changes |
| Template edit does not modify current week | PUT `/templates` writes to template tables only; PUT `/week` writes to instance tables only |
| Future week reflects template changes | RPC reads current template state at creation time |

---

## Rollout / Verification Checklist

### Pre-Deployment

- [ ] Review migration SQL for correctness
- [ ] Verify `set_updated_at()` function exists in target DB
- [ ] Verify `is_admin()` function exists in target DB

### Deploy Phase 1A (Schema + Backfill)

```bash
npx supabase db push --include-all
```

- [ ] Verify tables exist: `SELECT count(*) FROM event_day_templates;`
- [ ] Verify backfill: active events with configured weeks have 7 template days each
- [ ] Verify Stripe IDs on templates: `SELECT count(*) FROM ticket_type_templates WHERE stripe_price_id IS NOT NULL;`
- [ ] Verify RLS: `SELECT tablename, policyname FROM pg_policies WHERE tablename LIKE '%template%';`

### Verify Phase 1B (RPC)

- [ ] Customer-web: visit an event page for a future week — confirm tickets display correctly
- [ ] Check new week's `ticket_types_v2` rows have `template_id` set and `stripe_price_id` inherited
- [ ] Confirm no new Stripe Products/Prices created (check Stripe Dashboard activity log)
- [ ] Run concurrency test: call RPC twice for same new week — confirm same result, no duplicates

### Verify Phase 1C + 1D (Template Sync + Admin UI)

- [ ] Admin: navigate to event > "Recurring" tab — confirm template data loads
- [ ] Admin: edit a template ticket name, save — confirm template updated, current week unchanged
- [ ] Admin: verify Stripe sync status in save response
- [ ] Navigate to a future week — confirm it picks up template changes

### Post-Deploy Monitoring (1 week)

Run daily:
```sql
-- Duplicate day detection
SELECT event_week_id, dow, count(*) FROM event_week_days
GROUP BY event_week_id, dow HAVING count(*) > 1;

-- Duplicate template-sourced ticket detection
SELECT ewd.event_week_id, tt.template_id, count(*)
FROM ticket_types_v2 tt
JOIN event_week_days ewd ON tt.event_week_day_id = ewd.id
WHERE tt.template_id IS NOT NULL
GROUP BY ewd.event_week_id, tt.template_id
HAVING count(*) > 1;

-- New week creation source tracking
SELECT
  ewd.event_week_id,
  CASE WHEN ewd.template_id IS NOT NULL THEN 'template' ELSE 'legacy' END as source,
  count(*)
FROM event_week_days ewd
JOIN event_weeks ew ON ewd.event_week_id = ew.id
WHERE ew.created_at > NOW() - INTERVAL '7 days'
GROUP BY ewd.event_week_id, source;
```

### Run SQL Tests

```bash
psql $DATABASE_URL -f supabase/tests/test_template_system.sql
```

---

## Remaining Follow-Up Items (Phase 2 Only)

| Item | Priority | Complexity |
|------|----------|------------|
| "Rebuild this week from template" admin button | Low | S |
| Template vs instance diff visualization | Low | M |
| Template-level merchant change requests | Low | L |
| `syncEventWeekStripeIfNeeded` template awareness (fallback to template IDs if instance IDs missing) | Low | S |
| Publish validator template validation | Low | S |
| Automatic template creation for new events (admin event creation flow) | Medium | S |
| Clean up old Stripe Products with week-dated names (batch rename) | Low | M |
