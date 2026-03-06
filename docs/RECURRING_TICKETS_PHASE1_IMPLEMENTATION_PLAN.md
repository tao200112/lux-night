# Phase 1 Implementation Plan — Recurring Tickets Template System

## Prerequisites

Before starting any phase, all items in `RECURRING_TICKETS_PHASE1_PRE_IMPLEMENTATION_AUDIT.md` must be reviewed and accepted. Key pre-conditions:

- Stripe ID reuse during backfill is confirmed safe (Audit #1, #2, #6, #7)
- Concurrency fix via ON CONFLICT is required (Audit #5)
- Disabled days create all rows including tickets (Audit #4, Decision #2, #3)
- Template save does NOT block on Stripe sync failure (Decision #4, #5)

---

## Phase 1A: Migration — Schema + Backfill

### Goal

Add `event_day_templates` and `ticket_type_templates` tables. Add `template_id` FK columns to instance tables. Backfill templates from the most recent configured week of each event. Add missing RLS policies.

### Production Risk Level: ZERO

Schema-only changes. No existing code reads these tables. Backfill is additive (INSERT only). No existing rows are modified.

### File: New Migration

**Create**: `supabase/migrations/20260226300000_add_template_tables.sql`

### Exact Database Changes

```sql
-- 1. event_day_templates
CREATE TABLE public.event_day_templates (
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

CREATE INDEX idx_event_day_templates_event ON public.event_day_templates(event_id);

-- 2. ticket_type_templates
CREATE TABLE public.ticket_type_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_day_template_id UUID NOT NULL REFERENCES public.event_day_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('entry','vip','drink','skipline','other')),
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  min_age INT CHECK (min_age IN (18, 21)),
  inventory_limit INT CHECK (inventory_limit >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','sold_out')),
  sort_order INT NOT NULL DEFAULT 0,
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ticket_type_templates_day ON public.ticket_type_templates(event_day_template_id);

-- 3. FK columns on instance tables
ALTER TABLE public.event_week_days
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.event_day_templates(id) ON DELETE SET NULL;

ALTER TABLE public.ticket_types_v2
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.ticket_type_templates(id) ON DELETE SET NULL;

-- 4. updated_at triggers
CREATE TRIGGER trg_event_day_templates_updated_at
  BEFORE UPDATE ON public.event_day_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_ticket_type_templates_updated_at
  BEFORE UPDATE ON public.ticket_type_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. RLS policies (mirror instance table patterns)
ALTER TABLE public.event_day_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_type_templates ENABLE ROW LEVEL SECURITY;

-- Admin full access (service role bypasses RLS, but explicit policies for completeness)
CREATE POLICY event_day_templates_admin_all ON public.event_day_templates
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY ticket_type_templates_admin_all ON public.ticket_type_templates
  FOR ALL USING (true) WITH CHECK (true);

-- Anon/authenticated read-only (for RPC SECURITY DEFINER reads)
CREATE POLICY event_day_templates_read ON public.event_day_templates
  FOR SELECT USING (true);

CREATE POLICY ticket_type_templates_read ON public.ticket_type_templates
  FOR SELECT USING (true);

-- 6. Backfill: for each event, copy from the most recently updated week
--    that has at least one enabled day
DO $$
DECLARE
  v_event RECORD;
  v_source_week_id UUID;
  v_template_day_id UUID;
  v_day RECORD;
  v_ticket RECORD;
BEGIN
  FOR v_event IN SELECT id FROM public.events_v2 LOOP
    -- Find the most recently updated week with at least one enabled day
    SELECT ew.id INTO v_source_week_id
    FROM public.event_weeks ew
    WHERE ew.event_id = v_event.id
      AND EXISTS (
        SELECT 1 FROM public.event_week_days ewd
        WHERE ewd.event_week_id = ew.id AND ewd.enabled = true
      )
    ORDER BY ew.updated_at DESC
    LIMIT 1;

    IF v_source_week_id IS NULL THEN
      -- No configured week found — skip this event
      -- RPC will use legacy fallback (copy previous week)
      CONTINUE;
    END IF;

    -- Skip if templates already exist for this event (idempotent)
    IF EXISTS (
      SELECT 1 FROM public.event_day_templates WHERE event_id = v_event.id
    ) THEN
      CONTINUE;
    END IF;

    -- Copy all 7 days from source week to templates
    FOR v_day IN
      SELECT * FROM public.event_week_days
      WHERE event_week_id = v_source_week_id
      ORDER BY dow
    LOOP
      INSERT INTO public.event_day_templates (
        event_id, dow, enabled, start_time, end_time, end_next_day
      ) VALUES (
        v_event.id, v_day.dow, v_day.enabled,
        v_day.start_time, v_day.end_time, v_day.end_next_day
      )
      ON CONFLICT (event_id, dow) DO NOTHING
      RETURNING id INTO v_template_day_id;

      -- If ON CONFLICT hit, fetch existing ID
      IF v_template_day_id IS NULL THEN
        SELECT id INTO v_template_day_id
        FROM public.event_day_templates
        WHERE event_id = v_event.id AND dow = v_day.dow;
      END IF;

      -- Copy ticket types (including Stripe IDs)
      FOR v_ticket IN
        SELECT * FROM public.ticket_types_v2
        WHERE event_week_day_id = v_day.id
        ORDER BY sort_order
      LOOP
        INSERT INTO public.ticket_type_templates (
          event_day_template_id, name, category, price_cents, currency,
          min_age, inventory_limit, status, sort_order,
          stripe_product_id, stripe_price_id
        ) VALUES (
          v_template_day_id, v_ticket.name, v_ticket.category,
          v_ticket.price_cents, v_ticket.currency,
          v_ticket.min_age, v_ticket.inventory_limit,
          v_ticket.status, v_ticket.sort_order,
          v_ticket.stripe_product_id, v_ticket.stripe_price_id
        );
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;
```

### API Changes

None.

### UI Changes

None.

### Rollback Steps

```sql
DROP TABLE IF EXISTS public.ticket_type_templates CASCADE;
DROP TABLE IF EXISTS public.event_day_templates CASCADE;
ALTER TABLE public.event_week_days DROP COLUMN IF EXISTS template_id;
ALTER TABLE public.ticket_types_v2 DROP COLUMN IF EXISTS template_id;
```

### Verification Steps

1. Confirm tables exist:
   ```sql
   SELECT count(*) FROM public.event_day_templates;
   SELECT count(*) FROM public.ticket_type_templates;
   ```

2. Confirm every active event has 7 template days:
   ```sql
   SELECT e.id, e.title, count(edt.id) as template_days
   FROM events_v2 e
   LEFT JOIN event_day_templates edt ON edt.event_id = e.id
   WHERE e.status = 'active'
   GROUP BY e.id, e.title
   ORDER BY template_days ASC;
   ```
   Expected: all active events with configured weeks have 7 template days.

3. Confirm templates have Stripe IDs where source week had them:
   ```sql
   SELECT ttt.id, ttt.name, ttt.stripe_product_id, ttt.stripe_price_id
   FROM ticket_type_templates ttt
   WHERE ttt.status = 'active'
   ORDER BY ttt.stripe_price_id NULLS FIRST;
   ```
   Expected: most active templates have Stripe IDs. NULLs only for ticket types that were never synced.

4. Confirm FK columns exist on instance tables:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'event_week_days' AND column_name = 'template_id';
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'ticket_types_v2' AND column_name = 'template_id';
   ```

5. Confirm RLS is enabled:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables
   WHERE tablename IN ('event_day_templates', 'ticket_type_templates');
   ```

---

## Phase 1B: RPC Upgrade — Template-First Creation

### Goal

Replace the "copy previous week" logic in `rpc_get_or_create_event_week` with "copy templates" logic. Add `ON CONFLICT` handling for concurrency safety. Maintain legacy fallback for events without templates.

### Production Risk Level: LOW

The RPC return type and shape are identical. All consumer code (frontend, checkout, webhook) reads the same JSONB structure. The only behavioral change is the SOURCE of copied data (templates instead of previous week).

### File: New Migration

**Create**: `supabase/migrations/20260226310000_rpc_template_based_creation.sql`

### Exact Database Changes

Replace `rpc_get_or_create_event_week` with a new version that:

1. **Existing week found**: return it unchanged (identical to current behavior)
2. **New week needed**:
   a. `INSERT INTO event_weeks ... ON CONFLICT (event_id, week_start_date) DO NOTHING`
   b. `SELECT id` to get the row (handles both fresh insert and conflict cases)
   c. Check if `event_week_days` already exist for this week (concurrent creation guard)
   d. If days already exist, return the existing configuration
   e. Check if `event_day_templates` exist for this event
   f. **If templates exist**: copy from templates, set `template_id` on instances, copy Stripe IDs, set `sold_count = 0`
   g. **If no templates (legacy fallback)**: copy from most recent previous week (current behavior, unchanged)
   h. Use `INSERT INTO event_week_days ... ON CONFLICT (event_week_id, dow) DO NOTHING` for safety
   i. Guard `ticket_types_v2` inserts: only insert if no ticket rows exist for this `event_week_day_id`
3. **Return**: same JSONB shape (event_week_id, week_start_date, days[])

### Key RPC Logic (pseudocode)

```
-- Insert week (concurrency safe)
INSERT INTO event_weeks (event_id, week_start_date, timezone, status)
VALUES (p_event_id, v_week_start_date, p_timezone, 'active')
ON CONFLICT (event_id, week_start_date) DO NOTHING;

-- Get the week ID (whether just inserted or already existed)
SELECT id INTO v_event_week_id
FROM event_weeks WHERE event_id = p_event_id AND week_start_date = v_week_start_date;

-- Check if days already populated (another concurrent call may have done this)
IF EXISTS (SELECT 1 FROM event_week_days WHERE event_week_id = v_event_week_id) THEN
  -- Days exist — return existing config (skip creation)
  RETURN existing config;
END IF;

-- Check for templates
v_has_templates := EXISTS (
  SELECT 1 FROM event_day_templates WHERE event_id = p_event_id
);

IF v_has_templates THEN
  -- TEMPLATE PATH: copy from templates
  FOR v_template_day IN SELECT * FROM event_day_templates WHERE event_id = p_event_id LOOP
    INSERT INTO event_week_days (event_week_id, dow, enabled, start_time, end_time, end_next_day, template_id)
    VALUES (v_event_week_id, v_template_day.dow, v_template_day.enabled, ...)
    ON CONFLICT (event_week_id, dow) DO NOTHING
    RETURNING id INTO v_new_day_id;

    -- Handle ON CONFLICT case
    IF v_new_day_id IS NULL THEN
      SELECT id INTO v_new_day_id FROM event_week_days
      WHERE event_week_id = v_event_week_id AND dow = v_template_day.dow;
    END IF;

    -- Only insert tickets if day has no tickets yet
    IF NOT EXISTS (SELECT 1 FROM ticket_types_v2 WHERE event_week_day_id = v_new_day_id) THEN
      FOR v_template_ticket IN
        SELECT * FROM ticket_type_templates WHERE event_day_template_id = v_template_day.id
      LOOP
        INSERT INTO ticket_types_v2 (
          event_week_day_id, name, category, price_cents, currency,
          min_age, inventory_limit, status, sort_order,
          stripe_product_id, stripe_price_id, template_id, sold_count
        ) VALUES (
          v_new_day_id, ... all fields from template ..., v_template_ticket.id, 0
        );
      END LOOP;
    END IF;
  END LOOP;
ELSE
  -- LEGACY PATH: copy from most recent previous week (current behavior)
  ... existing code ...
END IF;
```

### API Changes

None. All callers of the RPC (`customer-web/upcoming-days`, `customer-web/week`, `admin-web/week GET`, `admin-web/week PUT`) receive the same response shape.

### UI Changes

None.

### Rollback Steps

Revert the RPC to the Approach A version (`20260226200000_fix_rpc_security_definer.sql`). Templates exist in DB but are unused.

```sql
-- Re-apply the Approach A RPC
CREATE OR REPLACE FUNCTION public.rpc_get_or_create_event_week(...)
-- ... paste Approach A version ...
```

### Verification Steps

1. **New week creation from templates**: Navigate to customer-web for an event in a future week that doesn't exist yet. Confirm the week is created with configuration matching the template.

2. **Stripe IDs inherited**: Query the newly created `ticket_types_v2` rows:
   ```sql
   SELECT tt.id, tt.name, tt.stripe_product_id, tt.stripe_price_id, tt.template_id
   FROM ticket_types_v2 tt
   JOIN event_week_days ewd ON tt.event_week_day_id = ewd.id
   JOIN event_weeks ew ON ewd.event_week_id = ew.id
   WHERE ew.week_start_date = '[NEW_WEEK_DATE]'
   ORDER BY ewd.dow, tt.sort_order;
   ```
   Confirm `stripe_product_id` and `stripe_price_id` are non-NULL for active tickets, and `template_id` is set.

3. **No Stripe API calls**: Check Stripe Dashboard activity log — no new Products or Prices should be created during automatic week creation.

4. **Concurrency safety**: Simulate by calling the RPC twice in quick succession for a new week:
   ```sql
   SELECT * FROM rpc_get_or_create_event_week('EVENT_ID', '2026-03-16');
   SELECT * FROM rpc_get_or_create_event_week('EVENT_ID', '2026-03-16');
   ```
   Both should return the same result without errors or duplicate rows.

5. **Legacy fallback**: For an event without templates, confirm the RPC still copies from the most recent previous week.

6. **Existing weeks unaffected**: Confirm that requesting an already-existing week returns the existing data without modification.

7. **sold_count = 0**: Confirm all newly created `ticket_types_v2` rows have `sold_count = 0`.

---

## Phase 1C: Template Stripe Sync

### Goal

Create a `syncTemplateStripe` function that ensures all active `ticket_type_templates` have valid Stripe Product/Price IDs. Called when admin saves templates.

### Production Risk Level: LOW

New code, no changes to existing files. Only called from the new admin template endpoint (Phase 1D). Existing sync functions are untouched.

### File Changes

**Create**: `apps/admin-web/lib/stripe/template-sync.ts`

### Exact Implementation

```typescript
/**
 * Stripe Template Sync
 * Creates/updates Stripe Products and Prices for ticket_type_templates.
 * Product name format: "{eventTitle} – {dayName} – {ticketName}" (no week date)
 * Called from admin template save endpoint.
 */

import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export async function syncTemplateStripe(eventId: string): Promise<{
  synced: number;
  errors: string[];
}> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { synced: 0, errors: ['STRIPE_SECRET_KEY not configured'] };
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
  });
  const supabase = createAdminClient();

  const { data: event } = await supabase
    .from('events_v2')
    .select('id, title, merchant_id')
    .eq('id', eventId)
    .single();

  if (!event) {
    return { synced: 0, errors: ['Event not found'] };
  }

  const { data: templateDays } = await supabase
    .from('event_day_templates')
    .select(`
      id, dow,
      ticket_type_templates (
        id, name, category, price_cents, status,
        stripe_product_id, stripe_price_id
      )
    `)
    .eq('event_id', eventId);

  if (!templateDays) {
    return { synced: 0, errors: ['No template days found'] };
  }

  let synced = 0;
  const errors: string[] = [];

  for (const day of templateDays) {
    const dayName = DAY_NAMES[day.dow] || `Day ${day.dow}`;

    for (const ticket of day.ticket_type_templates || []) {
      if (ticket.status !== 'active') continue;

      try {
        let productId = ticket.stripe_product_id;
        let priceId = ticket.stripe_price_id;

        // Create Product if missing
        if (!productId) {
          const product = await stripe.products.create({
            name: `${event.title} – ${dayName} – ${ticket.name}`,
            description: ticket.name,
            metadata: {
              event_id: eventId,
              ticket_type_template_id: ticket.id,
              merchant_id: event.merchant_id,
            },
          });
          productId = product.id;
        }

        // Create Price if missing or price changed
        let needsNewPrice = !priceId;
        if (priceId) {
          try {
            const existing = await stripe.prices.retrieve(priceId);
            if (existing.unit_amount !== ticket.price_cents) {
              // Price changed — deactivate old, create new
              await stripe.prices.update(priceId, { active: false }).catch(() => {});
              needsNewPrice = true;
            }
          } catch {
            needsNewPrice = true;
          }
        }

        if (needsNewPrice) {
          const price = await stripe.prices.create({
            product: productId,
            unit_amount: ticket.price_cents,
            currency: 'usd',
            metadata: {
              event_id: eventId,
              ticket_type_template_id: ticket.id,
              merchant_id: event.merchant_id,
            },
          });
          priceId = price.id;
        }

        // Update template row
        await supabase
          .from('ticket_type_templates')
          .update({ stripe_product_id: productId, stripe_price_id: priceId })
          .eq('id', ticket.id);

        synced++;
      } catch (e: any) {
        errors.push(`${ticket.name}: ${e.message || String(e)}`);
      }
    }
  }

  return { synced, errors };
}
```

### API Changes

None (function is used by Phase 1D).

### UI Changes

None.

### Rollback Steps

Delete `apps/admin-web/lib/stripe/template-sync.ts`. No other files reference it until Phase 1D is deployed.

### Verification Steps

1. Call `syncTemplateStripe` for an event whose templates already have Stripe IDs (from backfill):
   - Confirm zero Stripe API calls for Products
   - Confirm zero Stripe API calls for Prices (if prices match)
   - Confirm `synced` count matches active ticket templates

2. Remove `stripe_price_id` from one template row, call sync again:
   - Confirm a new Price is created on the existing Product
   - Confirm template row is updated

3. Confirm Product names do NOT contain week dates:
   - Expected: `"Event Title – Friday – General Admission"`
   - NOT: `"Event Title – 2026-03-02 – Friday – General Admission"`

---

## Phase 1D: Admin Template UI + API

### Goal

Add a GET/PUT API for templates and a "Recurring Defaults" tab to the admin event week page.

### Production Risk Level: LOW

New endpoint and new UI tab. Does not modify any existing endpoint or UI behavior. The existing "This Week" view remains the default tab and is completely unchanged.

### File Changes

**Create**: `apps/admin-web/app/api/admin/events/[id]/templates/route.ts`
**Modify**: `apps/admin-web/app/(admin)/events/[id]/week/page.tsx` (add tab)

### Exact API Changes

#### GET `/api/admin/events/[id]/templates`

Returns all template days and ticket types for the event.

Response shape:
```json
{
  "event_id": "uuid",
  "days": [
    {
      "id": "template_day_uuid",
      "dow": 0,
      "enabled": true,
      "start_time": "22:00",
      "end_time": "02:00",
      "end_next_day": true,
      "tickets": [
        {
          "id": "template_ticket_uuid",
          "name": "General Admission",
          "category": "entry",
          "price_cents": 2000,
          "currency": "usd",
          "min_age": 21,
          "inventory_limit": null,
          "status": "active",
          "sort_order": 0,
          "stripe_product_id": "prod_xxx",
          "stripe_price_id": "price_yyy"
        }
      ]
    }
  ]
}
```

If no templates exist for the event, return empty days array. Admin UI can show a prompt: "No recurring defaults set. Configure them here."

#### PUT `/api/admin/events/[id]/templates`

Accepts the same shape as the week PUT (days with tickets), but writes to template tables.

Request body:
```json
{
  "days": {
    "0": {
      "enabled": true,
      "start_time": "22:00",
      "end_time": "02:00",
      "end_next_day": true,
      "tickets": [
        { "id": "existing_uuid", "action": "upsert", "name": "...", ... },
        { "action": "upsert", "name": "New Ticket", ... },
        { "id": "uuid_to_delete", "action": "delete" }
      ]
    }
  }
}
```

Logic:
1. Require admin auth
2. For each day (0–6): upsert `event_day_templates` (ON CONFLICT update)
3. For each ticket in day: handle upsert/delete on `ticket_type_templates`
4. Call `syncTemplateStripe(eventId)` — non-blocking on failure
5. Return updated template data + Stripe sync status

**Critical**: PUT template NEVER writes to `event_week_days` or `ticket_types_v2`. No dual-write.

### Exact UI Changes

Modify `apps/admin-web/app/(admin)/events/[id]/week/page.tsx`:

1. Add a tab bar at the top: `["This Week", "Recurring Defaults"]`
2. Default tab: "This Week" (existing functionality, completely unchanged)
3. "Recurring Defaults" tab:
   - Fetches from `GET /api/admin/events/[id]/templates`
   - Same UI structure as existing week editor (day toggles, ticket list, add/remove/edit)
   - Clear banner: "Changes here apply to all future weeks. They do not affect the current week."
   - Save calls `PUT /api/admin/events/[id]/templates`
   - After save, shows Stripe sync result (success or warning if errors)

The existing week editor code remains completely unchanged. The template editor is a separate component/section that reuses the same UI patterns but targets different API endpoints.

### Rollback Steps

1. Remove `apps/admin-web/app/api/admin/events/[id]/templates/route.ts`
2. Revert `apps/admin-web/app/(admin)/events/[id]/week/page.tsx` to remove the tab
3. Templates remain in DB but are orphaned — harmless

### Verification Steps

1. **GET templates**: Navigate to admin > event > weekly config. Switch to "Recurring Defaults" tab. Confirm template data loads and matches the backfilled data.

2. **PUT templates**: Edit a template ticket's name, save. Confirm the change is saved to `ticket_type_templates` (not to `ticket_types_v2`).

3. **No dual-write**: After saving templates, check this week's `ticket_types_v2` rows — confirm they are NOT modified.

4. **Stripe sync on template save**: Remove `stripe_price_id` from a template, save via UI. Confirm Stripe Product/Price created and template row updated.

5. **Template does not affect existing weeks**: Edit template to change a ticket's price. Navigate to "This Week" tab — confirm the current week's price is unchanged.

6. **Future week gets template values**: After editing a template, navigate to a future week. Confirm the new week is created from templates with the updated values.

---

## Phase Execution Order

| Phase | Dependency | Can Deploy Independently | Risk |
|-------|-----------|-------------------------|------|
| 1A (Schema + Backfill) | None | Yes | Zero |
| 1B (RPC Upgrade) | 1A must be deployed first | Yes (with 1A) | Low |
| 1C (Template Stripe Sync) | None (but useless without 1D) | Yes | Zero (unused until 1D) |
| 1D (Admin UI + API) | 1A, 1B, 1C must be deployed | Yes (with 1A+1B+1C) | Low |

**Recommended deployment**: Deploy 1A first, verify backfill. Then deploy 1B+1C+1D together.

**Alternative safe deployment**: Deploy 1A, wait a week to verify no regressions. Then deploy 1B (verify template-based week creation works). Then deploy 1C+1D.

---

## What Is NOT In This Plan

Explicitly excluded from Phase 1 implementation:

| Item | Reason |
|------|--------|
| Override columns on any table | Unnecessary — direct instance editing works |
| COALESCE logic in any read path | Unnecessary — instances are fully materialized |
| Changes to checkout-v2 code | Instances have all needed data |
| Changes to webhook code | Webhook reads instances, not templates |
| Changes to `increment_ticket_type_v2_sold` RPC | sold_count lives on instances |
| Changes to dashboard queries | Dashboard reads instances |
| Changes to customer-web frontend | Customer-web reads instances via existing APIs |
| Changes to `merchant_change_requests` table | Change requests target instances |
| Template-level change requests | Admin-only in Phase 1 |
| "Rebuild from template" admin action | Manual editing is sufficient |
| "Save as template" admin action | Unnecessary complexity |
| Visual diff between template and instance | Nice-to-have for Phase 2 |
| Automatic propagation to existing weeks | Dangerous — could invalidate live checkouts |
| Multi-timezone template support | Out of scope |
| Modification to `syncEventWeekStripe` | It already correctly handles instances with inherited IDs |
| Modification to `syncEventWeekStripeIfNeeded` | Same — skips when IDs present |
| Modification to publish flow | Publish calls sync which handles inherited IDs |
| Modification to approval flow | Same — approval writes to instances |

---

## Risk Summary

| Risk | Likelihood | Severity | Mitigation |
|------|-----------|----------|------------|
| Backfill picks wrong source week | Low | Low | Uses most recently updated week with enabled days. Verify post-backfill. |
| Concurrent RPC creates duplicate ticket rows | Medium (pre-fix) | Medium | ON CONFLICT + existence guard in Phase 1B eliminates this |
| Template Stripe sync fails | Low | Low | Non-blocking. Customer-web sync fills missing IDs on first read. |
| Admin accidentally edits template thinking it's the current week | Low | Low | Tabs are clearly labeled. Different API endpoints. |
| Legacy event without templates creates empty week | Low | Low | Fallback to previous-week copy (existing behavior). |

---

## Post-Phase-1 Monitoring

After deployment, monitor for 1 week:

1. **New week creation logs**: Confirm RPC is using template path (not legacy fallback) for events with templates
2. **Stripe API call volume**: Should decrease significantly (no new Products/Prices per auto-created week)
3. **Customer checkout success rate**: Should remain unchanged or improve (no missing Stripe IDs)
4. **Admin template saves**: Confirm Stripe sync completes without errors
5. **No duplicate rows**: Run weekly:
   ```sql
   SELECT event_week_id, dow, count(*) FROM event_week_days
   GROUP BY event_week_id, dow HAVING count(*) > 1;

   SELECT event_week_day_id, name, count(*) FROM ticket_types_v2
   GROUP BY event_week_day_id, name HAVING count(*) > 1;
   ```
