# Recurring Tickets System Upgrade — Refined Design

## Executive Summary

This document refines the original Design B proposal into the smallest, safest possible implementation. The central simplification:

> **Templates are materialized into instances at creation time. Instances are the working copy. No COALESCE. No override columns. No runtime template lookups from checkout or webhook. All existing read paths remain unchanged.**

This means:
- Checkout, webhook, dashboard, and customer API routes **do not change at all**
- Only the RPC's "create new week" code path changes (from "copy previous week" to "copy templates")
- Admin can still edit any week's instances directly (same as today)
- Template editing is a separate, clearly distinct action that only affects future weeks

---

## What Was Wrong With the Original Proposal

The original Design B introduced:
- Override columns (`price_cents_override`, `inventory_limit_override`, `status_override`, `enabled_override`) on instance tables
- Runtime `COALESCE(instance_override, template_value)` logic in read paths
- Changes to checkout, webhook, and dashboard reads
- Ambiguous dual-write semantics ("save to template" vs "save to instance")

**All of this is eliminated.** The revised design is strictly additive: new tables, updated RPC, updated Stripe sync. No changes to consumer-facing read paths.

---

## 1. Final Source-of-Truth Map

After migration is complete, each field has exactly ONE authoritative source:

| Field | Source of Truth | Where It Lives | Read By |
|-------|----------------|----------------|---------|
| Recurring enabled weekday | `event_day_templates.enabled` | Template | RPC (at week creation) |
| Recurring start time | `event_day_templates.start_time` | Template | RPC (at week creation) |
| Recurring end time | `event_day_templates.end_time` | Template | RPC (at week creation) |
| Ticket name | `ticket_type_templates.name` | Template | RPC (at week creation) |
| Ticket category | `ticket_type_templates.category` | Template | RPC (at week creation) |
| Default price | `ticket_type_templates.price_cents` | Template | RPC (at week creation) |
| Default inventory limit | `ticket_type_templates.inventory_limit` | Template | RPC (at week creation) |
| Default ticket status | `ticket_type_templates.status` | Template | RPC (at week creation) |
| Stripe Product ID | `ticket_type_templates.stripe_product_id` | Template | RPC (copied to instance at creation) |
| Stripe Price ID | `ticket_type_templates.stripe_price_id` | Template | RPC (copied to instance at creation) |
| Sold count | `ticket_types_v2.sold_count` | Instance (per-week) | Checkout, webhook, dashboard |

### What Are Instances?

Instances (`event_week_days`, `ticket_types_v2`) are **materialized snapshots** of templates, created when a new week is generated. Once created, they are independent working copies. They contain all fields needed for checkout, webhook, and display — no join to templates needed at read time.

### Legacy Fields That Become Snapshots

After migration, these instance fields are populated FROM templates at creation time. They are the live data that checkout/webhook reads. They are NOT overrides — they ARE the data:

| Instance Field | Populated From | Still Read By |
|----------------|---------------|---------------|
| `event_week_days.enabled` | `event_day_templates.enabled` | upcoming-days API, week API |
| `event_week_days.start_time` | `event_day_templates.start_time` | upcoming-days API, checkout, webhook |
| `event_week_days.end_time` | `event_day_templates.end_time` | upcoming-days API, checkout, webhook |
| `ticket_types_v2.name` | `ticket_type_templates.name` | checkout, webhook, frontend |
| `ticket_types_v2.price_cents` | `ticket_type_templates.price_cents` | checkout, webhook, frontend |
| `ticket_types_v2.stripe_price_id` | `ticket_type_templates.stripe_price_id` | checkout |
| `ticket_types_v2.stripe_product_id` | `ticket_type_templates.stripe_product_id` | Stripe sync |
| `ticket_types_v2.inventory_limit` | `ticket_type_templates.inventory_limit` | checkout, frontend |
| `ticket_types_v2.status` | `ticket_type_templates.status` | upcoming-days API, frontend |

**No code path changes.** These fields are read exactly as they are today. The only difference is how they get populated (from templates instead of from the previous week).

### Code Paths That Must Stop

| Old Behavior | Replacement |
|-------------|-------------|
| RPC copies from previous week's `event_week_days` | RPC copies from `event_day_templates` |
| RPC copies from previous week's `ticket_types_v2` | RPC copies from `ticket_type_templates` |
| Stripe sync creates new Product per week | Stripe Product created once on template, ID copied to instances |
| Stripe sync creates new Price per week | Stripe Price created once on template (or on price change), ID copied to instances |
| `syncEventWeekStripeIfNeeded` creates objects per instance | Checks if instance has IDs; if not, copies from template; only creates if template also missing |

---

## 2. Override Model — Phase 1 vs Deferred

### Design Principle

Instances are materialized snapshots. An admin can edit an instance directly — this is not an "override", it's just editing the current week (same as today). The edit does NOT propagate back to the template. The template does NOT change.

There are no override columns. There is no COALESCE logic.

### Phase 1 Required

| Capability | Supported? | How |
|-----------|-----------|-----|
| Disable a day for one week | **Yes** | Admin edits `event_week_days.enabled` on that week's instance (same as today) |
| Change inventory for one week | **Yes** | Admin edits `ticket_types_v2.inventory_limit` on that week's instance (same as today) |
| Change status for one week | **Yes** | Admin edits `ticket_types_v2.status` on that week's instance (same as today) |
| Change price for one week | **No — deferred** | See below |
| Change time for one week | **Yes** | Admin edits `event_week_days.start_time/end_time` on that week's instance (same as today) |

All "per-week edits" work exactly as they do today. No new mechanism needed. Admin edits instance rows directly via the existing PUT `/api/admin/events/[id]/week` endpoint. No template columns are touched.

### Deferred to Future Phase

| Capability | Why Deferred |
|-----------|-------------|
| One-week price override | Requires creating a one-off Stripe Price for one instance. Complex, rare use case. If admin needs to change price, they should update the template (affects future weeks) and manually edit the current week's instance if needed. The existing admin save flow already handles Stripe sync for the current week. |
| "Rebuild week from template" admin action | Useful but not critical for Phase 1. Admin can manually configure the current week. |
| "Convert week to template" admin action | Unnecessary complexity. Admin should edit templates directly. |
| Template-level change requests from merchants | Current change request system targets weeks. Template editing is admin-only. |

### Why One-Week Price Override Is Deferred

Changing `ticket_types_v2.price_cents` on an existing instance is already possible today (admin PUT save does this). The existing `syncEventWeekStripe` creates a new Stripe Price for that instance. This continues to work unchanged. It is not "deferred" — it works the same as today. What is deferred is any special override column or COALESCE logic. The current direct-edit behavior is sufficient.

---

## 3. Price and Stripe Versioning Model

### Rules

#### When a Stripe Product Is Created
- **Once per `ticket_type_templates` row**, when the template is first saved with `status = 'active'`
- Product name format: `{eventTitle} – {dayName} – {ticketName}` (no week date)
- Product metadata: `{ event_id, ticket_type_template_id, merchant_id }`
- Stored on `ticket_type_templates.stripe_product_id`
- Never created per-week (unless admin edits an instance's price, which triggers the existing per-instance sync)

#### When a Stripe Price Is Created
- **Once per `ticket_type_templates` row**, when the template is first saved
- **Again when `ticket_type_templates.price_cents` changes** — new Price on same Product, old Price deactivated
- Stored on `ticket_type_templates.stripe_price_id`
- Never created per-week during normal auto-creation

#### Whether Future Weeks Inherit a Template Price Change
- **Yes.** When a new week is created, the RPC copies `ticket_type_templates.stripe_price_id` into the new `ticket_types_v2.stripe_price_id`. The new instance gets the latest price.

#### Whether Already-Created Week Instances Keep Their Old Price
- **Yes.** Once an instance row exists, its `price_cents` and `stripe_price_id` are frozen at the values they had when created (or when admin last edited that specific instance). Template changes do not retroactively modify existing instances.

#### How One-Week Price Editing Works (Current Behavior, Unchanged)
1. Admin opens week config, changes a ticket's price, saves
2. PUT `/api/admin/events/[id]/week` updates `ticket_types_v2.price_cents` on that instance
3. `syncEventWeekStripe` runs, detects price mismatch, creates new Stripe Price on that instance's Product
4. Instance gets its own `stripe_price_id`
5. This is the EXISTING behavior. No new code needed.

#### What Checkout Trusts as the Effective Price Source
- **`ticket_types_v2.stripe_price_id`** (the instance row) — unchanged from today
- **`ticket_types_v2.price_cents`** (the instance row) — for display and validation
- No template lookup at checkout time

#### What Order/Webhook/Refund Flows Trust
- **`order_items.unit_price_cents`** — price snapshotted at checkout creation time
- **`tickets.price_paid_cents_snapshot`** — price snapshotted at ticket creation time (webhook)
- These are already immutable snapshots. No change needed.

### Stripe Lifecycle Summary

```
TEMPLATE CREATION:
  ticket_type_templates row created
    → Stripe Product created (once, permanent)
    → Stripe Price created (once, updated on price change)
    → template.stripe_product_id = prod_xxx
    → template.stripe_price_id = price_yyy

NEW WEEK AUTO-CREATION (RPC):
  ticket_types_v2 row created from template
    → instance.stripe_product_id = template.stripe_product_id (copied)
    → instance.stripe_price_id = template.stripe_price_id (copied)
    → instance.price_cents = template.price_cents (copied)
    → instance.sold_count = 0
    → NO Stripe API call needed

TEMPLATE PRICE CHANGE:
  admin updates template.price_cents
    → new Stripe Price created on same Product
    → old Price deactivated
    → template.stripe_price_id = price_zzz (updated)
    → existing instances untouched
    → future instances get price_zzz

ADMIN EDITS CURRENT WEEK (existing behavior, unchanged):
  admin changes instance.price_cents via week save
    → syncEventWeekStripe detects mismatch
    → creates new Stripe Price on instance's Product
    → instance.stripe_price_id = price_www (per-instance)
```

---

## 4. Admin Editing Model

### Two Clearly Separate Actions

| Action | What It Edits | What It Affects | API |
|--------|-------------|----------------|-----|
| **"Edit Recurring Schedule"** | `event_day_templates` + `ticket_type_templates` | All future weeks (not current/past) | New endpoint: `PUT /api/admin/events/[id]/templates` |
| **"Edit This Week"** | `event_week_days` + `ticket_types_v2` (instances) | Only this week | Existing endpoint: `PUT /api/admin/events/[id]/week` (unchanged) |

### No Hidden Dual-Write

- Saving templates NEVER writes to instances
- Saving instances NEVER writes to templates
- There is no "Apply to template" or "Save as default" option in Phase 1
- The admin UI presents two clearly labeled tabs or sections

### Admin UX Specification

**Tab 1: "This Week" (default view, same as today)**
- Shows the current week's configuration
- All edits save to instance rows
- Same behavior as the existing admin page
- No visual indication of "differs from template" in Phase 1

**Tab 2: "Recurring Defaults" (new)**
- Shows template configuration
- All edits save to template rows
- Stripe sync runs on template save (create/update Product/Price)
- Clear label: "Changes apply to all future weeks"

### What Admin Actions Are NOT Supported in Phase 1

| Action | Status | Reason |
|--------|--------|--------|
| "Apply template to this week" / rebuild | Deferred | Admin can manually edit the current week. Rebuild is a convenience, not a requirement. |
| "Save this week as new template" | Deferred | Confusing semantics. Admin should edit templates directly. |
| Visual diff between template and instance | Deferred | Nice-to-have, not critical. |

---

## 5. Change Request / Approval Model

### Phase 1: Change Requests Target Weekly Instances Only

| Actor | Targets | Reason |
|-------|---------|--------|
| Merchant (internal-web) | Weekly instances | Matches current business process exactly. Merchants request changes for a specific upcoming week. |
| Admin (admin-web) approval | Weekly instances | Approval writes to instance rows (same as today). |
| Admin template editing | Templates directly | Not through change request system. Admin edits templates directly via the new "Recurring Defaults" UI. |

### Why Not Template Change Requests?

- Templates are an admin-only concept in Phase 1
- Merchants don't need to change recurring defaults — they request specific week changes
- Adding template change requests would require new payload formats, new approval logic, and new UI
- All unnecessary complexity for Phase 1

### No Changes to Existing Change Request Tables or Logic

`merchant_change_requests` continues to work exactly as today:
- `target_week_start_date` identifies the target week
- `payload` contains day/ticket changes
- Approval writes to `event_week_days` and `ticket_types_v2` instances
- No template awareness needed

---

## 6. Revised Phased Rollout

### Phase 1: Implement Now

**Scope**: Add template tables, backfill data, update RPC to create from templates, add template Stripe sync, add admin template editing UI.

**Step 1: Migration — Schema + Backfill** (0.5 day, zero risk)

New tables:
```
event_day_templates
  id UUID PK DEFAULT gen_random_uuid()
  event_id UUID NOT NULL FK → events_v2 (CASCADE)
  dow INT NOT NULL CHECK (0-6)
  enabled BOOLEAN NOT NULL DEFAULT false
  start_time TIME NOT NULL DEFAULT '16:00'
  end_time TIME NOT NULL DEFAULT '02:00'
  end_next_day BOOLEAN NOT NULL DEFAULT true
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  UNIQUE(event_id, dow)

ticket_type_templates
  id UUID PK DEFAULT gen_random_uuid()
  event_day_template_id UUID NOT NULL FK → event_day_templates (CASCADE)
  name TEXT NOT NULL
  category TEXT NOT NULL CHECK (entry/vip/drink/skipline/other)
  price_cents INT NOT NULL CHECK (>= 0)
  currency TEXT NOT NULL DEFAULT 'usd'
  min_age INT CHECK (18 or 21)
  inventory_limit INT CHECK (>= 0)
  status TEXT NOT NULL DEFAULT 'active' CHECK (active/hidden/sold_out)
  sort_order INT NOT NULL DEFAULT 0
  stripe_product_id TEXT
  stripe_price_id TEXT
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

New columns on existing tables:
```
event_week_days + template_id UUID FK → event_day_templates (SET NULL, NULLABLE)
ticket_types_v2 + template_id UUID FK → ticket_type_templates (SET NULL, NULLABLE)
```

RLS policies: mirror existing policies on `event_week_days` and `ticket_types_v2`.

Backfill logic (in migration SQL):
```
For each event in events_v2:
  Find the event_weeks row with the MAX(updated_at) that has at least one enabled day
  If found:
    For each event_week_days row in that week:
      INSERT INTO event_day_templates (event_id, dow, enabled, start_time, end_time, end_next_day)
      For each ticket_types_v2 row on that day:
        INSERT INTO ticket_type_templates (...all config fields + stripe_product_id, stripe_price_id...)
  If not found:
    Skip (legacy event with no configuration — RPC will fall back to previous-week copy)
```

Rollback: `DROP TABLE ticket_type_templates CASCADE; DROP TABLE event_day_templates CASCADE; ALTER TABLE event_week_days DROP COLUMN IF EXISTS template_id; ALTER TABLE ticket_types_v2 DROP COLUMN IF EXISTS template_id;`

**Step 2: RPC Upgrade** (0.5 day, low risk)

Replace `rpc_get_or_create_event_week` with new logic:

```
When creating a new week:
  1. INSERT event_weeks ON CONFLICT DO NOTHING (concurrency safe)
  2. Check if event_day_templates exist for this event
  3a. If templates exist:
      For each template day:
        INSERT event_week_days copying from template, setting template_id
        For each ticket_type_template on that day:
          INSERT ticket_types_v2 copying all fields including stripe IDs, setting template_id, sold_count=0
  3b. If no templates (legacy fallback):
      Copy from most recent previous week (current behavior)
  4. Return same JSONB shape as before

When returning an existing week:
  Unchanged — same SELECT logic
```

The RPC return type does not change. No consumer code changes.

Rollback: revert to current RPC. Templates exist but are unused.

**Step 3: Template Stripe Sync** (0.5 day, low risk)

New function: `syncTemplateStripe(eventId)`
- For each `ticket_type_templates` row where `status = 'active'` and `stripe_price_id IS NULL`:
  - Create Stripe Product (if `stripe_product_id` is NULL)
  - Create Stripe Price
  - Update template row with IDs
- Product name: `{eventTitle} – {dayName} – {ticketName}` (no week date)

Called from:
- Admin template save endpoint (new)
- Backfill (one-time, for templates that inherited Stripe IDs from the source week — no sync needed since IDs are already set)

Existing `syncEventWeekStripe` and `syncEventWeekStripeIfNeeded` are NOT modified. They continue to work on instances. For instances created from templates, they will find `stripe_price_id` already populated and skip.

Rollback: remove the new function. Template stripe_price_id stays as backfilled values.

**Step 4: Admin Template UI + API** (1-1.5 days, low risk)

New API: `GET/PUT /api/admin/events/[id]/templates`
- GET: returns all `event_day_templates` and `ticket_type_templates` for the event
- PUT: upserts templates, runs `syncTemplateStripe`

Admin frontend:
- New tab "Recurring Defaults" on the event week config page
- Same UI structure as the existing week editor (day enable/disable, ticket list)
- Clear label: "These settings apply to all future weeks"
- Save calls `PUT /api/admin/events/[id]/templates`

Rollback: remove the new endpoint and UI tab.

### Defer to Phase 2

| Feature | Why Deferred |
|---------|-------------|
| "Rebuild this week from template" button | Convenience, not correctness. Admin can edit week manually. |
| Template vs instance diff visualization | Nice UX but not needed for correctness. |
| Template-level merchant change requests | Current change request system targets weeks. Template editing is admin-only. |
| `syncEventWeekStripeIfNeeded` template awareness | Current sync already handles instances. Templates have IDs set at backfill time. Low urgency. |
| `publishValidator` template validation | Current validator checks existing weeks. Template validation is admin-side only. Low urgency. |

### Avoid Entirely Unless Proven Necessary

| Feature | Why Avoided |
|---------|------------|
| Override columns on `event_week_days` or `ticket_types_v2` | Unnecessary. Direct editing of instance rows already provides per-week customization. Override columns add COALESCE complexity with zero benefit. |
| Runtime template lookups from checkout or webhook | Unnecessary. Instances are fully materialized. No read-path changes needed. |
| Automatic template-to-instance propagation for existing weeks | Dangerous. Retroactive changes to existing weeks could invalidate ongoing checkouts. Template changes only affect future weeks. |
| Multi-source `stripe_price_id` resolution | Unnecessary. Instance has the stripe_price_id it was created with. Checkout reads from instance. Done. |

---

## Explicit "Not in Scope for Phase 1"

1. No override columns on any table
2. No COALESCE logic in any read path
3. No changes to checkout-v2 code
4. No changes to webhook code
5. No changes to `increment_ticket_type_v2_sold` RPC
6. No changes to dashboard queries
7. No changes to customer-web frontend
8. No changes to `merchant_change_requests` table or logic
9. No template-level change requests
10. No "rebuild from template" admin action
11. No "save as template" admin action
12. No visual diff between template and instance
13. No automatic propagation of template changes to existing weeks
14. No multi-timezone template support

---

## Summary of All Files Changed in Phase 1

| File | Change Type | Description |
|------|------------|-------------|
| New migration SQL | New | Schema: `event_day_templates`, `ticket_type_templates`, FK columns, backfill, RLS |
| New migration SQL | New | RPC: `rpc_get_or_create_event_week` v2 (template-first, concurrency-safe) |
| `apps/admin-web/lib/stripe/template-sync.ts` | New | `syncTemplateStripe(eventId)` function |
| `apps/admin-web/app/api/admin/events/[id]/templates/route.ts` | New | GET/PUT for template CRUD |
| `apps/admin-web/app/(admin)/events/[id]/week/page.tsx` | Modified | Add "Recurring Defaults" tab |
| Admin-web existing files | **Unchanged** | `PUT /week`, `syncEventWeekStripe`, `publish`, `approvals` — all unchanged |
| Customer-web files | **Unchanged** | `upcoming-days`, `week`, `checkout-v2`, `webhook`, `event-week-sync` — all unchanged |
| Internal-web files | **Unchanged** | `week`, `change-requests`, `dashboard` — all unchanged |

**Total new files**: 3 (migration, template sync lib, template API route)
**Total modified files**: 1 (admin week page — add tab)
**Total unchanged files**: Everything else

---

## Verification Criteria

Phase 1 is complete and correct when:

1. Every existing event has `event_day_templates` and `ticket_type_templates` rows populated from backfill
2. Templates that were backfilled from weeks with Stripe IDs have `stripe_product_id` and `stripe_price_id` set
3. When a new week is auto-created (by customer visit or admin visit), it copies from templates and has all fields populated including Stripe IDs
4. When a new week is auto-created, no Stripe API call is needed (IDs inherited from template)
5. Admin can edit templates via the new "Recurring Defaults" tab
6. Admin template save triggers `syncTemplateStripe` if Stripe IDs are missing
7. All existing customer flows (browse, checkout, webhook, ticket display) work identically to today
8. All existing admin flows (week edit, publish, approvals) work identically to today
9. All existing internal flows (week view, change requests, dashboard) work identically to today
10. Concurrent RPC calls for the same new week do not throw errors (ON CONFLICT handling)
11. Legacy events without templates fall back to previous-week copy (unchanged behavior)
12. Template changes do NOT modify existing week instances
