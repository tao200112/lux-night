# Recurring Tickets System Upgrade Proposal

## Executive Summary

Following the Approach A hotfix (SECURITY DEFINER on `rpc_get_or_create_event_week`), the immediate "empty tickets every Monday" bug is mitigated. However, the core architectural problem remains: **every piece of recurring event configuration — enabled weekdays, time windows, ticket types, prices, inventory limits, and Stripe objects — is stored per-week**, creating unnecessary weekly duplication, unbounded Stripe object proliferation, and fragile cross-week copying logic.

This document proposes a durable upgrade that makes recurring events truly "configure once, run forever" while preserving per-week flexibility for overrides and sold-count tracking.

**Recommended approach**: Introduce event-level **ticket type templates** that own Stripe Products/Prices, with lightweight weekly **ticket instances** that only track `sold_count` and optional overrides. This eliminates 90%+ of weekly duplication while keeping full backward compatibility.

---

## Current System Audit

### Schema Hierarchy (Post-Approach A)

```
events_v2 (permanent event metadata)
  └── event_weeks (per-week container, auto-created by RPC)
        └── event_week_days (7 per week: dow, enabled, start/end times)
              └── ticket_types_v2 (per-week, per-day ticket definitions)
                    ├── name, category, price_cents, currency
                    ├── inventory_limit, sold_count
                    ├── status (active/hidden/sold_out)
                    ├── stripe_product_id (unique per row)
                    └── stripe_price_id (unique per row)
```

### What Gets Duplicated Every Week

When `rpc_get_or_create_event_week` creates a new week by copying from the most recent previous week:

| Data | Copied? | New Row? | New Stripe Object? |
|------|---------|----------|-------------------|
| `event_weeks` row | N/A | Yes (1 per week) | No |
| `event_week_days` rows (7) | enabled, times | Yes (7 per week) | No |
| `ticket_types_v2` rows (N per day) | name, category, price, limits | Yes (N×7 per week) | Yes — new Product + Price per row |
| `stripe_product_id` | **Not copied** | Created by sync | 1 per ticket type per week |
| `stripe_price_id` | **Not copied** | Created by sync | 1 per ticket type per week |
| `sold_count` | Reset to 0 | Correct (new week) | N/A |

**Example**: An event with 3 ticket types on 3 enabled days → 9 `ticket_types_v2` rows per week → 9 Stripe Products + 9 Stripe Prices per week → **468 Stripe objects per year** for a single event.

### Key File Dependencies on Current Structure

#### Customer-Web (Read Path)

| File | Depends On |
|------|-----------|
| `app/api/public/events-v2/[id]/upcoming-days/route.ts` | RPC → `event_week_days.enabled`, `ticket_types_v2.status`, `stripe_price_id` |
| `app/api/public/events-v2/[id]/week/route.ts` | RPC → same as above |
| `app/api/public/checkout-v2/route.ts` | `ticket_types_v2.stripe_price_id` (required), `sold_count` vs `inventory_limit` |
| `app/api/stripe/webhook/route.ts` | `ticket_types_v2.*` for snapshots, `event_week_days.*` for validity, `increment_ticket_type_v2_sold` |
| `lib/stripe/event-week-sync.ts` | Creates Stripe Product/Price per `ticket_types_v2` row |
| `lib/data/tickets.ts` | `tickets.ticket_type_id_v2` → `ticket_types_v2` FK |
| `lib/data/orders.ts` | `order_items.ticket_type_v2_id` → `ticket_types_v2` FK |
| `app/events-v2/[id]/page.tsx` | `inventory_limit`, `sold_count`, `stripe_price_id` from API |

#### Admin-Web (Write Path)

| File | Depends On |
|------|-----------|
| `app/api/admin/events/[id]/week/route.ts` PUT | Writes `event_week_days` + `ticket_types_v2` per week |
| `app/api/admin/events/[id]/publish/route.ts` | Validates all weeks, syncs Stripe per week |
| `app/api/admin/approvals/[id]/approve/route.ts` | Creates `ticket_types_v2` rows, syncs Stripe |
| `app/api/admin/change-requests/[id]/approve/route.ts` | Same |
| `lib/stripe/event-week-sync.ts` | Creates Stripe objects per `ticket_types_v2` row |
| `lib/events-v2/publish-validator.ts` | Validates `event_week_days.enabled` + `ticket_types_v2` |
| `app/(admin)/events/[id]/week/page.tsx` | UI for per-week configuration |

#### Internal-Web

| File | Depends On |
|------|-----------|
| `app/api/events/[id]/week/route.ts` | RPC read-only |
| `app/api/events/[id]/change-requests/route.ts` | RPC for before_snapshot |
| `lib/data/internal/dashboard.ts` | `ticket_types_v2.sold_count` per `event_week_day_id` |

#### SQL Functions

| Function | Interaction |
|----------|------------|
| `rpc_get_or_create_event_week` | Creates `event_weeks` + `event_week_days` + copies `ticket_types_v2` |
| `increment_ticket_type_v2_sold` | Updates `ticket_types_v2.sold_count` atomically |
| `calculate_day_validity_window` | Pure calculation, no table dependency |

### Concurrency Gap

The current RPC does not handle concurrent week creation. Two simultaneous requests for the same new week:
1. Both `SELECT id INTO v_event_week_id WHERE ...` → both get NULL
2. Both `INSERT INTO event_weeks` → one succeeds, one hits `UNIQUE(event_id, week_start_date)` violation
3. The losing request throws an unhandled error

---

## Architectural Problems Remaining After Approach A

### P1: Config Duplication Per Week
Every week duplicates ticket definitions, prices, inventory limits, and day schedules. Changes to the "default" config require editing the most recent week and hoping future copies inherit correctly.

### P2: Stripe Object Proliferation
Each week creates new Stripe Products and Prices. Product names embed the week date (`${eventTitle} - ${weekStartDate} - ${dayName} - ${ticketName}`), making them inherently week-specific. Stripe has no cleanup mechanism.

### P3: No Canonical Source of Truth
There is no "this event runs Thursday/Friday/Saturday with General Admission at $20 and VIP at $40" record. That information only exists as copies in the most recent `ticket_types_v2` rows.

### P4: First-Week Bootstrap Still Requires Admin
When an event has NO previous week (brand new event, or all weeks deleted), the RPC creates 7 days with `enabled = false` and zero ticket types. The admin must configure the first week manually.

### P5: Per-Week Inventory Is Correct, But Implementation Is Wasteful
`sold_count` correctly resets per week (new rows start at 0). But this is achieved by creating entirely new `ticket_types_v2` rows with all config duplicated, when only `sold_count` needs to be per-week.

### P6: Checkout Is Tightly Coupled to Per-Week Stripe IDs
`checkout-v2/route.ts` line 231: `if (!ticketType.stripe_price_id) throw new Error(...)`. This means checkout cannot work until Stripe sync runs for the current week's ticket types.

### P7: Change Request Approval Has Divergent Implementations
`admin-web/approvals/[id]/approve` calls `syncEventWeekStripe`, but `internal-web/admin/event-change-requests/[id]/approve` does NOT — risking stale Stripe data after price changes through the internal portal.

---

## Candidate Upgrade Designs

### Design A: Event-Level Defaults Table (Minimal)

**Concept**: Add `event_day_defaults` and `ticket_type_defaults` tables. The RPC falls back to defaults when no previous week exists. Admin saves update both the current week and the defaults.

```
events_v2
  ├── event_day_defaults (7 rows: dow, enabled, start_time, end_time)
  │     └── ticket_type_defaults (N per day: name, price, stripe_*)
  └── event_weeks (unchanged)
        └── event_week_days (unchanged)
              └── ticket_types_v2 (unchanged)
```

**Pros:**
- Smallest schema change
- Fixes P3 (canonical source of truth) and P4 (first-week bootstrap)
- Does NOT require changing any read path — customer API still reads from `ticket_types_v2`

**Cons:**
- Does NOT fix P2 (Stripe proliferation) — each week still gets new Stripe objects
- Does NOT fix P5 (wasteful duplication) — full `ticket_types_v2` rows still created per week
- Two sources of truth (defaults + weekly copies) can drift
- Admin UI complexity: "save to this week" vs "save as default" ambiguity

**Migration risk**: Low
**Effort**: S-M (1–2 days schema + RPC, 1 day admin UI)

---

### Design B: Template + Lightweight Instance (Recommended)

**Concept**: Introduce event-level **templates** that own all configuration and Stripe objects. Per-week **instances** are lightweight rows that only track `sold_count` and optional overrides. The RPC creates instances from templates. Checkout reads `stripe_price_id` from templates.

```
events_v2
  ├── event_day_templates (7 rows per event, permanent)
  │     ├── dow, enabled, start_time, end_time, end_next_day
  │     └── ticket_type_templates (N per day, permanent)
  │           ├── name, category, price_cents, currency, min_age
  │           ├── inventory_limit_default, status, sort_order
  │           ├── stripe_product_id (created once, reused forever)
  │           └── stripe_price_id (updated only on price change)
  └── event_weeks (per-week container, auto-created)
        └── event_week_days (per-week, inherits from template, allows overrides)
              └── ticket_instances (per-week, per-day, per-template)
                    ├── template_id → ticket_type_templates.id
                    ├── sold_count (per-week tracking)
                    ├── inventory_limit_override (NULL = use template default)
                    ├── status_override (NULL = use template default)
                    └── price_cents_override (NULL = use template default, requires new stripe_price_id)
```

**How it works:**

1. **Admin creates event**: Configures `event_day_templates` + `ticket_type_templates` once
2. **First customer visit**: RPC creates `event_weeks` → `event_week_days` (from templates) → `ticket_instances` (from templates, `sold_count = 0`)
3. **Checkout**: Reads `stripe_price_id` from `ticket_type_templates` (or from instance if price override exists)
4. **Webhook**: Increments `ticket_instances.sold_count` instead of `ticket_types_v2.sold_count`
5. **Admin override**: Can modify a specific week's instance (e.g., increase inventory for a holiday), stored as override columns
6. **Price change**: Admin updates template → new `stripe_price_id` created on template → all future weeks use it automatically

**Pros:**
- Fixes ALL identified problems (P1–P7)
- Stripe objects created once per template, not per week
- Single source of truth (templates) with optional per-week overrides
- `sold_count` correctly per-week without duplicating config
- Checkout reads from stable template data
- Backward compatible: existing `ticket_types_v2` rows kept for historical orders/tickets

**Cons:**
- Larger schema change than Design A
- Requires migrating checkout and webhook to read from templates/instances
- Override logic adds complexity (NULL = inherit from template)
- Admin UI needs redesign to distinguish template editing from weekly override

**Migration risk**: Medium (incremental rollout possible)
**Effort**: M-L (2–3 days schema + RPC, 2 days API migration, 1–2 days admin UI, 1 day testing)

---

### Design C: Eliminate Per-Week Ticket Rows Entirely

**Concept**: Remove `ticket_types_v2` and `event_week_days` from the per-week hierarchy. All configuration lives on event-level tables. A simple `event_week_sales` table tracks `sold_count` per template per week. The RPC only creates the `event_weeks` row.

```
events_v2
  ├── event_day_configs (permanent: dow, enabled, times)
  └── ticket_type_configs (permanent: name, price, stripe, inventory)
        └── event_week_sales (per-week, per-ticket-type)
              └── sold_count, inventory_limit_override
```

No `event_week_days` or `ticket_types_v2` for new weeks. Customer API reads directly from `event_day_configs` and `ticket_type_configs`.

**Pros:**
- Cleanest possible schema
- Zero per-week row creation for config
- Smallest ongoing storage footprint

**Cons:**
- **Breaking change**: Every API route that reads `ticket_types_v2` must be rewritten
- **Breaking FKs**: `tickets.ticket_type_id_v2`, `order_items.ticket_type_v2_id` all point to `ticket_types_v2`
- **No per-week day overrides**: Can't disable a specific day for one week without a separate mechanism
- **Historical data**: Existing orders/tickets reference `ticket_types_v2.id` — these rows must be preserved forever
- **Largest migration effort and risk**

**Migration risk**: High (all-or-nothing for API changes)
**Effort**: L-XL (3–5 days full rewrite of read/write paths)

---

## Detailed Tradeoff Analysis

| Criterion | Design A (Defaults) | Design B (Template + Instance) | Design C (Eliminate) |
|-----------|--------------------|-----------------------------|---------------------|
| Fixes weekly duplication | Partially | **Fully** | **Fully** |
| Fixes Stripe proliferation | No | **Yes** | **Yes** |
| Single source of truth | Partially (drift risk) | **Yes (templates)** | **Yes** |
| Per-week overrides | Via existing weekly tables | **Via override columns** | Needs separate mechanism |
| Per-week sold_count | Via existing ticket_types_v2 | **Via ticket_instances** | Via event_week_sales |
| Backward compatible | **Yes** | **Yes (incremental)** | No (breaking FKs) |
| Admin UI impact | Small | Medium | Large |
| Migration complexity | **Low** | Medium | High |
| Checkout/webhook changes | **None** | Medium | Large |
| Long-term durability | Low (drift) | **High** | Highest |
| Production rollout risk | **Lowest** | Medium | Highest |

---

## Recommended Final Design: Design B (Template + Instance)

### Target Data Model

```sql
-- LEVEL 1: Event (permanent metadata)
events_v2 (existing, no changes)

-- LEVEL 2: Event Day Templates (permanent recurring schedule)
event_day_templates
  id UUID PK
  event_id UUID FK → events_v2 (CASCADE)
  dow INT (0-6, same convention as event_week_days)
  enabled BOOLEAN DEFAULT false
  start_time TIME DEFAULT '16:00'
  end_time TIME DEFAULT '02:00'
  end_next_day BOOLEAN DEFAULT true
  UNIQUE(event_id, dow)

-- LEVEL 3: Ticket Type Templates (permanent ticket definitions)
ticket_type_templates
  id UUID PK
  event_day_template_id UUID FK → event_day_templates (CASCADE)
  name TEXT NOT NULL
  category TEXT NOT NULL CHECK (entry/vip/drink/skipline/other)
  price_cents INT NOT NULL CHECK (>= 0)
  currency TEXT DEFAULT 'usd'
  min_age INT CHECK (18 or 21)
  inventory_limit INT CHECK (>= 0)  -- default per-week limit
  status TEXT DEFAULT 'active' CHECK (active/hidden/sold_out)
  sort_order INT DEFAULT 0
  stripe_product_id TEXT        -- created once, reused across all weeks
  stripe_price_id TEXT          -- updated only when price_cents changes
  UNIQUE(event_day_template_id, name)  -- prevent duplicate ticket names per day

-- LEVEL 4: Weekly Containers (auto-created, lightweight)
event_weeks (existing, no changes)

-- LEVEL 5: Weekly Day Instances (auto-created from templates)
event_week_days (existing, add template_id)
  + template_id UUID FK → event_day_templates (SET NULL)
  + enabled_override BOOLEAN (NULL = use template.enabled)
  + start_time_override TIME (NULL = use template.start_time)
  + end_time_override TIME (NULL = use template.end_time)
  + end_next_day_override BOOLEAN (NULL = use template.end_next_day)
  -- existing columns (enabled, start_time, etc.) remain for backward compat
  -- new logic: effective_enabled = COALESCE(enabled_override, template.enabled, enabled)

-- LEVEL 6: Weekly Ticket Instances (auto-created from templates)
ticket_types_v2 (existing, add template_id)
  + template_id UUID FK → ticket_type_templates (SET NULL)
  + price_cents_override INT (NULL = use template.price_cents)
  + inventory_limit_override INT (NULL = use template.inventory_limit)
  + status_override TEXT (NULL = use template.status)
  -- existing columns remain populated for backward compat
  -- stripe_product_id / stripe_price_id: inherit from template (or own if override)
  -- sold_count: per-instance (correct, stays)
```

### Single Source of Truth

| Data | Source of Truth | Per-Week Override? |
|------|----------------|-------------------|
| Recurring weekdays (which days are active) | `event_day_templates.enabled` | Yes, via `event_week_days.enabled_override` |
| Default start/end times | `event_day_templates.start_time/end_time` | Yes, via `event_week_days.*_override` |
| Ticket type name/category | `ticket_type_templates.name/category` | No (permanent) |
| Default price | `ticket_type_templates.price_cents` | Yes, via `ticket_types_v2.price_cents_override` |
| Default inventory per week | `ticket_type_templates.inventory_limit` | Yes, via `ticket_types_v2.inventory_limit_override` |
| Active/hidden status | `ticket_type_templates.status` | Yes, via `ticket_types_v2.status_override` |
| Stripe Product ID | `ticket_type_templates.stripe_product_id` | No (shared across all weeks) |
| Stripe Price ID | `ticket_type_templates.stripe_price_id` | Only if price_cents_override differs |
| Sold count | `ticket_types_v2.sold_count` (per-week instance) | N/A (inherently per-week) |

### How Weekly Overrides Work

Override columns use NULL = "inherit from template":

```
Effective value = COALESCE(instance_override, template_value)
```

When an admin wants to:
- **Change default price**: Update `ticket_type_templates.price_cents` → create new `stripe_price_id` on template → all future weeks inherit
- **Override one week's price**: Set `ticket_types_v2.price_cents_override` → create a week-specific `stripe_price_id` on that instance
- **Disable a day for one week**: Set `event_week_days.enabled_override = false`
- **Change recurring schedule**: Update `event_day_templates.enabled` → all future weeks inherit

### First-Time Week Generation

Updated RPC logic:

```
1. Check event exists → fail if not
2. Calculate week_start_date (Monday)
3. SELECT from event_weeks → if exists, return (unchanged)
4. INSERT event_weeks (with ON CONFLICT DO NOTHING for concurrency)
5. If just created:
   a. SELECT event_day_templates for this event
   b. For each template day:
      - INSERT event_week_day with template_id, copying enabled/times from template
      - For each ticket_type_template on that day:
        - INSERT ticket_types_v2 with template_id, sold_count=0,
          copying name/category/price/etc from template
        - Inherit stripe_product_id and stripe_price_id from template
6. If templates exist: new week is fully configured on creation
7. If no templates exist (legacy event): fall back to copying from most recent week
8. Return week config
```

### Gap Handling (Multiple Weeks)

With templates, gaps are irrelevant. The RPC always creates from templates, not from the previous week. Even if 6 months pass without a visit, the next week auto-creates perfectly from templates.

For legacy events without templates, the existing "copy from most recent week" logic serves as fallback.

### Concurrency Handling

```sql
-- Use INSERT ... ON CONFLICT for the event_weeks creation:
INSERT INTO event_weeks (event_id, week_start_date, timezone, status)
VALUES (p_event_id, v_week_start_date, p_timezone, 'active')
ON CONFLICT (event_id, week_start_date) DO NOTHING
RETURNING id INTO v_event_week_id;

-- If v_event_week_id IS NULL, another concurrent request won the race:
IF v_event_week_id IS NULL THEN
  SELECT id INTO v_event_week_id
  FROM event_weeks WHERE event_id = p_event_id AND week_start_date = v_week_start_date;
END IF;

-- Similarly for event_week_days and ticket_types_v2:
-- Use ON CONFLICT DO NOTHING to handle race conditions
```

### Stripe Object Reuse/Versioning

**Current**: Stripe Product name = `${eventTitle} - ${weekStartDate} - ${dayName} - ${ticketName}` (week-specific)

**Proposed**: Stripe Product name = `${eventTitle} - ${dayName} - ${ticketName}` (permanent)

**Price change workflow**:
1. Admin updates `ticket_type_templates.price_cents`
2. System creates new Stripe Price on the same Product
3. Old Price deactivated
4. `ticket_type_templates.stripe_price_id` updated to new Price
5. All future weeks inherit the new Price automatically
6. Existing weeks with active checkouts continue using the old Price (snapshotted in `order_items.unit_price_cents`)

**Per-week price override**:
1. Admin sets `ticket_types_v2.price_cents_override` on a specific week's instance
2. System creates a one-off Stripe Price for that instance
3. That Price is stored on the instance row, not the template
4. Only that week uses the override Price

### How Checkout Reads Pricing

```typescript
// Current (per-week):
const ticketType = await supabase.from('ticket_types_v2').select('*, event_week_days!inner(...)').eq('id', ticketTypeId).single();
const priceId = ticketType.stripe_price_id; // per-week

// Proposed (template-first with override):
const ticketType = await supabase.from('ticket_types_v2').select('*, ticket_type_templates(stripe_price_id, stripe_product_id, price_cents)').eq('id', ticketTypeId).single();
const effectivePriceId = ticketType.stripe_price_id || ticketType.ticket_type_templates?.stripe_price_id;
const effectivePrice = ticketType.price_cents_override ?? ticketType.ticket_type_templates?.price_cents ?? ticketType.price_cents;
```

### How sold_count Is Tracked

`sold_count` stays on `ticket_types_v2` (the per-week instance). No change needed. Each week's instance starts at `sold_count = 0`. The `increment_ticket_type_v2_sold` RPC continues to work unchanged.

Inventory check:
```
effective_limit = COALESCE(instance.inventory_limit_override, template.inventory_limit, instance.inventory_limit)
available = effective_limit - instance.sold_count
```

---

## Migration Strategy

### Phase 1: Schema Addition (Non-Breaking)

**New tables:**
- `event_day_templates` (7 rows per event)
- `ticket_type_templates` (N per day template)

**New columns on existing tables:**
- `event_week_days.template_id` UUID FK → `event_day_templates` (NULLABLE, SET NULL)
- `ticket_types_v2.template_id` UUID FK → `ticket_type_templates` (NULLABLE, SET NULL)

**Data backfill:**
For each existing event with at least one `event_weeks` row:
1. Find the most recent week with enabled days
2. Create `event_day_templates` from that week's `event_week_days`
3. Create `ticket_type_templates` from that week's `ticket_types_v2`
4. Set `template_id` on the source rows (the ones used for backfill)

**No reads or writes change yet.** The system continues using the existing per-week tables. Templates are populated but not read.

**RLS:**
- `event_day_templates`: same policies as `event_week_days` (admin all, internal select own merchant, customer select active events)
- `ticket_type_templates`: same policies as `ticket_types_v2`

**Rollback**: DROP the new tables and columns. Zero impact on existing functionality.

### Phase 2: RPC Upgrade (Backward Compatible)

Update `rpc_get_or_create_event_week` to:
1. When creating a new week, prefer templates over copying from previous week
2. Set `template_id` on newly created `event_week_days` and `ticket_types_v2`
3. Copy `stripe_product_id` and `stripe_price_id` from templates to instances
4. Fall back to previous-week copy if no templates exist (legacy compat)
5. Use `ON CONFLICT` for concurrency safety

**The RPC still returns the same shape** — `event_week_id`, `week_start_date`, `days` JSONB. No consumer changes needed.

**Rollback**: Revert the RPC to the previous version. Data in new tables is unused.

### Phase 3: Stripe Sync Upgrade

Update `syncEventWeekStripe` / `syncEventWeekStripeIfNeeded`:
1. When a `ticket_types_v2` row has a `template_id`, check if the template already has `stripe_product_id` and `stripe_price_id`
2. If yes, copy from template to instance (no Stripe API call needed)
3. If no, create Stripe objects on the **template** (not the instance), then copy to instance
4. Product name format: `${eventTitle} - ${dayName} - ${ticketName}` (no week date)

**Rollback**: Revert sync functions. New Stripe objects created on templates are harmless.

### Phase 4: Admin Write Path Migration

Update admin week save (`PUT /api/admin/events/[id]/week`):
1. When saving, also upsert corresponding `event_day_templates` and `ticket_type_templates`
2. Add "Apply to all future weeks" option in admin UI (updates templates)
3. Add "Override this week only" option (sets override columns on instances)

Add template management to admin UI:
- New tab/section: "Default Schedule" (edits templates directly)
- Existing "Weekly Config" tab: shows inherited values with override capability

**Rollback**: Remove template-writing code from save path. Templates become stale but unused.

### Phase 5: Customer Read Path Migration

Update checkout-v2:
1. When reading `ticket_types_v2`, also join `ticket_type_templates` for `stripe_price_id`
2. Use `COALESCE(instance.stripe_price_id, template.stripe_price_id)` for Stripe checkout
3. Use `COALESCE(instance.price_cents_override, template.price_cents, instance.price_cents)` for price validation

Update webhook:
1. `increment_ticket_type_v2_sold` continues unchanged (operates on instance)
2. Snapshot fields still come from the instance row (which inherits from template)

**Rollback**: Remove COALESCE logic, revert to reading directly from `ticket_types_v2`. Everything still works since instances still have full data.

### Phase 6: Cleanup (Deferred)

After all reads and writes use templates:
1. Stop populating `stripe_product_id` / `stripe_price_id` on `ticket_types_v2` (only on templates)
2. Stop copying full config to `ticket_types_v2` (only copy `template_id` + `sold_count = 0`)
3. Old `ticket_types_v2` rows remain for historical FK integrity (`tickets.ticket_type_id_v2`, `order_items.ticket_type_v2_id`)
4. Consider adding views for backward-compatible reads

**This phase is optional and can be deferred indefinitely.**

### What Old Tables Remain

| Table | Status | Reason |
|-------|--------|--------|
| `event_weeks` | **Kept permanently** | Still needed as weekly container for `sold_count` tracking |
| `event_week_days` | **Kept permanently** | Still needed for per-week overrides and `ticket_types_v2` FK |
| `ticket_types_v2` | **Kept permanently** | Historical FKs from `tickets` and `order_items`; `sold_count` lives here |

Nothing is deleted. New tables are additive. Old rows serve as historical records.

---

## Rollout Phases

| Phase | What | Risk | Rollback | Duration |
|-------|------|------|----------|----------|
| 1 | Add tables + backfill | **None** (additive only) | DROP tables/columns | 0.5 day |
| 2 | Upgrade RPC | **Low** (same return shape) | Revert RPC | 0.5 day |
| 3 | Upgrade Stripe sync | **Low** (template-first) | Revert sync functions | 0.5 day |
| 4 | Upgrade admin writes | **Medium** (dual writes) | Remove template writes | 1–2 days |
| 5 | Upgrade customer reads | **Medium** (COALESCE) | Remove COALESCE | 1 day |
| 6 | Cleanup (optional) | **Low** | N/A | Deferred |

Each phase is independently deployable and reversible. The system works correctly at every intermediate state.

---

## Risks

### R1: Template-Instance Drift
If admin updates a template but doesn't regenerate existing week instances, the current week shows old data. **Mitigation**: Template changes only affect future weeks. Current week retains its values (which were correct when created).

### R2: Stripe Price Mismatch
If `ticket_type_templates.stripe_price_id` is updated but some instances still reference the old price. **Mitigation**: Instances always have their own `stripe_price_id` (copied from template at creation time). Only newly created instances get the new price. Existing checkout sessions use the price from `order_items.unit_price_cents` (snapshotted).

### R3: Legacy Events Without Templates
Events created before the migration that never had templates backfilled. **Mitigation**: Phase 1 backfill covers all events with at least one configured week. The RPC falls back to previous-week copy for events without templates.

### R4: Override Complexity in Admin UI
Admins might be confused by "template" vs "this week only" distinction. **Mitigation**: Default to "apply to all future weeks" (template edit). Offer "override this week only" as an advanced option.

### R5: Migration Backfill Picks Wrong Week
The backfill uses the most recent configured week as the template source. If the most recent week had unusual overrides, those become the template. **Mitigation**: Allow admins to review and edit templates after migration. The backfill is a best-effort starting point.

---

## Test Plan

### Unit Tests

1. **Template CRUD**: Create, read, update, delete templates via admin API
2. **RPC with templates**: Verify new week creates instances from templates
3. **RPC without templates**: Verify fallback to previous-week copy (legacy)
4. **RPC concurrency**: Simulate 10 concurrent requests for the same new week
5. **Override logic**: Verify COALESCE produces correct effective values
6. **Stripe sync**: Verify template-first sync creates objects on templates, copies to instances

### Integration Tests

7. **Full customer flow**: Browse event → see tickets → checkout → webhook → ticket created
8. **Price change flow**: Admin changes template price → new Stripe Price created → new week uses new price → old week keeps old price
9. **Weekly override**: Admin overrides one week's inventory → only that week affected
10. **Gap handling**: No week for 3 weeks → customer visits → week auto-creates from templates
11. **Backfill verification**: Run migration on staging → verify all existing events have correct templates

### Regression Tests

12. **Existing events**: All currently working events continue to work identically
13. **Historical tickets**: `tickets.ticket_type_id_v2` FK still resolves
14. **Historical orders**: `order_items.ticket_type_v2_id` FK still resolves
15. **Dashboard**: `ticket_types_v2.sold_count` still aggregated correctly
16. **Webhook**: `increment_ticket_type_v2_sold` still updates correct row

---

## Unanswered Questions / Assumptions

### Q1: Multi-Timezone Support
Currently hardcoded to `America/New_York`. Templates inherit this assumption. If multi-timezone support is needed later, `event_day_templates.timezone` could be added. **Assumption**: Single timezone is acceptable for now.

### Q2: Non-Weekly Recurrence
The current model assumes weekly recurrence (7 DOW values). If biweekly or monthly events are needed, the template model would need extension. **Assumption**: Weekly recurrence covers all current use cases.

### Q3: Stripe Connect Accounts
The current sync creates Products/Prices on the platform account. If merchants need their own Stripe Connect accounts, the template model would need `stripe_account_id`. **Assumption**: Platform-level Stripe is acceptable.

### Q4: Ticket Type Deletion
Currently, deleting a ticket type with existing orders falls back to `status = 'hidden'`. With templates, deleting a template should hide all future instances but not affect existing ones. **Assumption**: Template deletion = soft delete (status change).

### Q5: Change Request System Compatibility
`merchant_change_requests.payload` contains `{ days: { "0": { enabled, tickets: [...] } } }`. With templates, change requests could target either templates or weekly overrides. **Assumption**: Change requests continue to target weekly instances for now. Template editing is admin-only.

### Q6: DOW Convention
The schema comment says `0=Monday` but actual usage follows `EXTRACT(DOW)` where `0=Sunday`. The code handles this correctly via offset formulas. Templates should follow the same convention. **Assumption**: `dow` 0=Sunday (matching PostgreSQL and JavaScript conventions).

### Q7: Backfill Strategy for Events with Multiple Weeks
Which week's config should become the template? **Assumption**: Use the most recently modified week (highest `updated_at`). This is most likely to represent the admin's intended "default" configuration.
