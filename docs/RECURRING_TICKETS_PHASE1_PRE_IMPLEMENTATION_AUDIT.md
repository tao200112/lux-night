# Phase 1 Pre-Implementation Audit

This document records the results of a code-level audit of the existing system, performed before any Phase 1 coding begins. Every finding is backed by exact file paths and line numbers.

---

## 1. Stripe Sync Skip Behavior — Are Existing IDs Safe to Reuse?

### Audit Target

When template Stripe IDs are copied into instance rows at RPC creation time, will existing sync functions redundantly create new Stripe objects?

### Findings

**customer-web `syncEventWeekStripeIfNeeded`** (`apps/customer-web/lib/stripe/event-week-sync.ts`, line 63):
```
if (ticket.stripe_price_id) continue;
```
Correctly skips any ticket that already has a `stripe_price_id`. Instances created from templates with inherited IDs will never trigger Stripe API calls here.

**admin-web `syncTicketTypeStripe`** (`apps/admin-web/lib/stripe/event-week-sync.ts`, lines 50–86):
- Line 55: `if (!productId)` — only creates Product when missing
- Lines 72–86: checks if `stripe_price_id` exists AND retrieves price to compare `unit_amount` vs `priceCents`. Only creates new Price when missing or when price has changed.

**admin-web `syncEventWeekStripe`** (same file, lines 194–195): iterates ticket_types_v2 rows and calls `syncTicketTypeStripe` for `status === 'active'` tickets. Sync skips if IDs exist and price matches.

### Verdict

**SAFE.** Copying template Stripe IDs to instances at creation time will NOT cause redundant Stripe object creation. All three sync entry points correctly detect and skip when IDs are present and prices match.

---

## 2. Stripe Product Names/Metadata — Week-Specificity

### Audit Target

Do existing Stripe Product names and metadata contain week-specific information? Is that acceptable for template reuse?

### Findings

**Product name** (`apps/admin-web/lib/stripe/event-week-sync.ts`, line 57 and `apps/customer-web/lib/stripe/event-week-sync.ts`, line 117):
```
name: `${eventTitle} - ${weekStartDate} - ${dayName} - ${ticketName}`
```
The name includes `weekStartDate`. This is week-specific.

**Product metadata** (admin-web line 59–64, customer-web lines 119–125):
```
metadata: {
  event_id, event_week_id, event_week_day_id, ticket_type_id, merchant_id
}
```
Contains `event_week_id` and `event_week_day_id` — week-specific values.

### Impact Assessment

- Product names are **display-only** in Stripe Dashboard — not used by checkout, webhook, or refund flows
- Product metadata is **for debugging** — not queried programmatically by any code path in this codebase
- `checkout-v2` uses `price: ticketType.stripe_price_id` (line 341 of `checkout-v2/route.ts`) — trusts the Price ID, not the Product name
- Webhook does not reference `stripe_product_id` or `stripe_price_id` at all

### Verdict

**ACCEPTABLE for Phase 1.** Reusing weekly Stripe IDs as template IDs means templates will have week-dated Product names in Stripe Dashboard. This is cosmetic. When template prices change post-Phase-1, `syncTemplateStripe` creates new Products with clean names (no week date). Existing Products remain valid.

---

## 3. Publish and Approval Stripe Re-creation Risk

### Audit Target

Can publish or approval flows accidentally recreate Stripe objects even after template-based instance creation?

### Findings

**Publish** (`apps/admin-web/app/api/admin/events/[id]/publish/route.ts`, lines 37–53):
Calls `syncEventWeekStripe(w.id)` for ALL weeks. For instances with inherited template Stripe IDs, `syncTicketTypeStripe` will find `stripe_product_id` and `stripe_price_id` already set. If `price_cents` matches the Stripe Price amount, no new objects are created. **Safe.**

**Approval** (`apps/admin-web/app/api/admin/approvals/[id]/approve/route.ts`, line 112–116):
Calls `syncEventWeekStripe(eventWeekId)` after applying approved changes. If the approval changed a ticket's price, sync correctly creates a new Price (expected behavior). If price is unchanged, sync skips. **Safe.**

**Admin week PUT** (`apps/admin-web/app/api/admin/events/[id]/week/route.ts`, lines 206–215):
Same pattern — sync after save. Detects price changes, creates new Price only when needed. **Safe.**

**Change request approval** (`apps/admin-web/app/api/admin/change-requests/[id]/approve/route.ts`):
Also calls `syncEventWeekStripe` — same safe behavior.

**Customer-web read paths** (`upcoming-days/route.ts`, `week/route.ts`):
Both call `syncEventWeekStripeIfNeeded` which checks `if (ticket.stripe_price_id) continue;`. Template-inherited IDs cause instant skip. **Safe.**

### Verdict

**NO RISK.** All sync paths correctly skip when IDs exist and prices match. Template-inherited IDs are fully compatible with every existing sync caller.

---

## 4. Disabled Days — Ticket Rows and RPC Behavior

### Audit Target

Do disabled days currently contain ticket_types_v2 rows? How should the new RPC handle disabled template days?

### Findings

**Current RPC** (`20260226200000_fix_rpc_security_definer.sql`, lines 108–150):
```sql
FOR i IN 0..6 LOOP
  -- ... creates event_week_days for ALL 7 days regardless of enabled status
  -- ... copies ticket_types_v2 for ALL days including disabled ones
END LOOP;
```
The RPC loop runs from 0 to 6 unconditionally. The `v_enabled` variable is read from the previous week but does not gate ticket copying.

**API filtering**: `upcoming-days/route.ts` and `week/route.ts` filter by `enabled` status at the application layer. Disabled days with ticket rows are invisible to customers.

**Admin UI**: The admin week page shows all 7 days. Disabled days are displayed but greyed out. Their ticket rows are preserved so re-enabling a day does not lose configuration.

### Verdict

**Confirmed: disabled days DO have ticket_types_v2 rows.** The new template-based RPC must create all 7 `event_week_days` rows and copy `ticket_types_v2` for ALL template days (including disabled ones), matching current behavior. This ensures:
1. Consistency with existing behavior
2. No data loss when admin re-enables a day
3. No change needed in API filtering logic

---

## 5. Concurrency — Unique Constraints and Duplicate Row Risk

### Audit Target

What unique constraints exist? Can concurrent RPC calls create duplicate rows?

### Findings

**Existing constraints** (`034_event_week_ticketing_v2.sql`):
- `event_weeks`: `UNIQUE(event_id, week_start_date)` — line 53
- `event_week_days`: `UNIQUE(event_week_id, dow)` — line 81
- `ticket_types_v2`: **NO unique constraint** — confirmed by schema and grep

**Current RPC**: Does NOT use `ON CONFLICT`. Two concurrent calls that both pass the `SELECT id INTO v_event_week_id` check (both find NULL) will:
1. One succeeds at `INSERT INTO event_weeks`, the other gets a unique violation error
2. For `event_week_days`: same issue — first succeeds, second fails
3. For `ticket_types_v2`: no unique constraint — both could insert, creating **duplicate ticket rows**

**Observed in production**: The `SECURITY DEFINER` fix (Approach A) makes customer traffic able to trigger RPC creation. Multiple simultaneous customer requests for the same event on a new week CAN trigger concurrent RPC execution.

### Required Fix in Phase 1

1. `INSERT INTO event_weeks ... ON CONFLICT (event_id, week_start_date) DO NOTHING` — then `SELECT id` to get the existing or newly created row
2. `INSERT INTO event_week_days ... ON CONFLICT (event_week_id, dow) DO NOTHING` — same pattern
3. For `ticket_types_v2`: check if rows already exist for the `event_week_day_id` before inserting (no unique constraint to rely on, but the `event_week_day_id` FK combined with the ON CONFLICT on `event_week_days` ensures the parent exists exactly once)

### Verdict

**CRITICAL FIX NEEDED.** The Phase 1 RPC must use `INSERT ... ON CONFLICT DO NOTHING` for `event_weeks` and `event_week_days`, and guard `ticket_types_v2` inserts against the existence of an already-populated day.

---

## 6. Checkout Stripe Price ID Usage

### Audit Target

What does checkout trust as the price source? Is `stripe_price_id` on the instance row sufficient?

### Findings

**`checkout-v2`** (`apps/customer-web/app/api/public/checkout-v2/route.ts`):
- Line 231–233: validates `ticketType.stripe_price_id` exists: `if (!ticketType.stripe_price_id) throw new Error(...)`
- Line 341: uses it directly: `price: ticketType.stripe_price_id`
- Line 250: also reads `ticketType.price_cents` for total calculation

**`create-session`** (older checkout, `apps/customer-web/app/api/checkout/create-session/route.ts`):
- Lines 220–229: uses `price_data` with inline `unit_amount: ticketType!.price_cents` — does NOT use `stripe_price_id`

**Webhook** (`apps/customer-web/app/api/stripe/webhook/route.ts`):
- Does NOT reference `stripe_price_id` or `stripe_product_id`
- Uses `orderItem.ticket_type_id` to look up `ticket_types_v2` for day/validity info
- Trusts `order_items.unit_price_cents` (price snapshot from checkout)

### Verdict

**`checkout-v2` requires valid `stripe_price_id` on instance rows.** Template-inherited IDs satisfy this requirement. No changes needed. `create-session` (legacy) does not use Stripe IDs at all. Webhook is ID-agnostic.

---

## 7. Historical Order/Ticket Flows — stripe_price_id Origin

### Audit Target

Do any order, ticket, or refund flows assume the `stripe_price_id` was created specifically for that week?

### Findings

- `order_items.unit_price_cents` captures price at checkout time — does not reference origin
- `tickets.price_paid_cents_snapshot` captures price at ticket creation (webhook) — does not reference origin
- No code path queries Stripe to validate that a Price ID "belongs to" a specific week or product with specific metadata
- Refund flows use `stripe_payment_intent_id` on the order, not `stripe_price_id`

### Verdict

**NO DEPENDENCY on stripe_price_id origin.** Reusing existing weekly Stripe IDs as template IDs is fully safe. No order/ticket/refund flow will break.

---

## 8. Code Paths Depending on "Copy Previous Week" Semantics

### Audit Target

Are there any code paths (outside the RPC) that depend on the concept of "copying from the previous week"?

### Findings

- **RPC SQL**: The only implementation of "copy previous week" logic is in `rpc_get_or_create_event_week` (both the current version and the Approach A version)
- **Admin UI** (`apps/admin-web/app/(admin)/events/[id]/week/page.tsx`): References to "previous week" are limited to the concept of navigating between weeks. No frontend code implements copy logic — it all goes through the RPC
- **No TypeScript file** directly reads a previous week to copy configuration

### Verdict

**Only the RPC needs to change.** The "copy previous week" logic exists solely in the SQL function. The new RPC replaces this with "copy from templates" (with legacy fallback). No TypeScript code changes needed for this behavior.

---

## 9. Missing Unique Constraints to Add

| Table | Needed Constraint | Purpose |
|-------|------------------|---------|
| `event_day_templates` | `UNIQUE(event_id, dow)` | Prevent duplicate template days per event |
| `ticket_type_templates` | None (multiple ticket types per template day is valid) | N/A |
| `event_weeks` | Already has `UNIQUE(event_id, week_start_date)` | ✅ |
| `event_week_days` | Already has `UNIQUE(event_week_id, dow)` | ✅ |
| `ticket_types_v2` | None — impractical due to legitimate duplicates across different source weeks | Accept current behavior |

---

## 10. Open Decisions — Final Resolutions

### Decision 1: Template Backfill — Reuse Weekly Stripe IDs

**REUSE existing weekly Stripe IDs.**

Rationale:
- IDs are functionally valid (Product + Price exist in Stripe, are active)
- Creating new ones risks breaking active checkout sessions or in-flight webhooks
- Product names contain week dates, but this is cosmetic (see Audit #2)
- Zero Stripe API calls needed during migration — safest possible migration
- As template prices change over time, `syncTemplateStripe` creates cleaner objects naturally

### Decision 2: Disabled Template Days — Create event_week_days Rows

**YES, create all 7 `event_week_days` rows.**

Rationale:
- Matches current behavior (RPC creates all 7, see Audit #4)
- UNIQUE(event_week_id, dow) constraint assumes all 7 exist
- Admin can re-enable a day without data inconsistency
- API layer filters disabled days — no customer impact

### Decision 3: Disabled Template Days — Create ticket_types_v2 Rows

**YES, copy ticket_types_v2 from template even for disabled days.**

Rationale:
- Matches current behavior (see Audit #4)
- Prevents data loss when admin re-enables a day mid-week
- Tickets on disabled days are invisible to customers (API filters by `enabled`)
- Small storage cost, large consistency benefit

### Decision 4: Template Save Succeeds But Stripe Sync Fails

**Template save SUCCEEDS in DB. Stripe sync failure is logged and surfaced as a non-blocking warning.**

Rationale:
- Template data is correct in DB — Stripe sync can be retried
- Blocking template save on Stripe failure makes templates unusable during Stripe outages
- Instances created from templates without Stripe IDs will trigger `syncEventWeekStripeIfNeeded` on customer read (same as today's fallback — see Audit #1)
- Admin UI shows warning: "Stripe sync incomplete — future weeks may have delayed Stripe setup"
- Admin can retry save to trigger sync again

### Decision 5: Block Template Editing Unless Stripe Sync Succeeds

**NO block. Warn only.**

Rationale:
- A block would make templates unusable if Stripe is temporarily down
- Current system already handles missing Stripe IDs gracefully (customer-web sync fills them on first read)
- Template configuration is valid without Stripe IDs — they only need IDs when an instance is used for checkout
- Warning is sufficient: "Stripe sync failed. Future weeks may experience delayed Stripe setup."

---

## Summary

All audited behaviors confirm that the refined design is safe to implement. The key guarantees:

1. **Stripe ID reuse is safe** — all sync functions skip when IDs exist and prices match
2. **No existing flow will break** — checkout, webhook, publish, approval all work with template-inherited IDs
3. **Concurrency fix is required** — RPC must use ON CONFLICT for event_weeks and event_week_days
4. **Disabled day handling matches current behavior** — create all rows, filter at API layer
5. **Week-specific Stripe metadata is cosmetic** — no functional impact on checkout or webhook
6. **Template save is non-blocking on Stripe** — graceful degradation matches existing fallback patterns
