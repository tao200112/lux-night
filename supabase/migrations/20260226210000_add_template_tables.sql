-- =========================================================
-- Phase 1A: Template tables, FK columns, RLS, backfill
-- =========================================================

-- =========================================================
-- 1. event_day_templates
-- =========================================================

CREATE TABLE IF NOT EXISTS public.event_day_templates (
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

CREATE INDEX IF NOT EXISTS idx_event_day_templates_event
  ON public.event_day_templates(event_id);

DROP TRIGGER IF EXISTS trg_event_day_templates_updated_at ON public.event_day_templates;
CREATE TRIGGER trg_event_day_templates_updated_at
  BEFORE UPDATE ON public.event_day_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.event_day_templates IS
  'Recurring day-of-week templates per event. Source of truth for weekly auto-generation.';
COMMENT ON COLUMN public.event_day_templates.dow IS
  'Day of week: 0=Sunday, 1=Monday, ..., 6=Saturday (JS/PG convention)';

-- =========================================================
-- 2. ticket_type_templates
-- =========================================================

CREATE TABLE IF NOT EXISTS public.ticket_type_templates (
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

CREATE INDEX IF NOT EXISTS idx_ticket_type_templates_day
  ON public.ticket_type_templates(event_day_template_id);

DROP TRIGGER IF EXISTS trg_ticket_type_templates_updated_at ON public.ticket_type_templates;
CREATE TRIGGER trg_ticket_type_templates_updated_at
  BEFORE UPDATE ON public.ticket_type_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.ticket_type_templates IS
  'Recurring ticket type templates per day template. Materialized into ticket_types_v2 at week creation.';

-- =========================================================
-- 3. FK columns on instance tables
-- =========================================================

ALTER TABLE public.event_week_days
  ADD COLUMN IF NOT EXISTS template_id UUID
    REFERENCES public.event_day_templates(id) ON DELETE SET NULL;

ALTER TABLE public.ticket_types_v2
  ADD COLUMN IF NOT EXISTS template_id UUID
    REFERENCES public.ticket_type_templates(id) ON DELETE SET NULL;

-- =========================================================
-- 4. RLS — mirror existing security model exactly
-- =========================================================

ALTER TABLE public.event_day_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_type_templates ENABLE ROW LEVEL SECURITY;

-- event_day_templates: admin full access via is_admin()
DROP POLICY IF EXISTS "event_day_templates_admin_all" ON public.event_day_templates;
CREATE POLICY "event_day_templates_admin_all" ON public.event_day_templates
  FOR ALL USING (public.is_admin());

-- event_day_templates: internal read own merchant's events
DROP POLICY IF EXISTS "event_day_templates_internal_select" ON public.event_day_templates;
CREATE POLICY "event_day_templates_internal_select" ON public.event_day_templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.events_v2 e
      INNER JOIN public.merchant_members mm ON mm.merchant_id = e.merchant_id
      WHERE mm.user_id = auth.uid() AND e.id = event_day_templates.event_id
    )
  );

-- event_day_templates: customer read active/paused events only
DROP POLICY IF EXISTS "event_day_templates_customer_select" ON public.event_day_templates;
CREATE POLICY "event_day_templates_customer_select" ON public.event_day_templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.events_v2 e
      WHERE e.id = event_day_templates.event_id AND e.status IN ('active', 'paused')
    )
  );

-- ticket_type_templates: admin full access via is_admin()
DROP POLICY IF EXISTS "ticket_type_templates_admin_all" ON public.ticket_type_templates;
CREATE POLICY "ticket_type_templates_admin_all" ON public.ticket_type_templates
  FOR ALL USING (public.is_admin());

-- ticket_type_templates: internal read own merchant's events
DROP POLICY IF EXISTS "ticket_type_templates_internal_select" ON public.ticket_type_templates;
CREATE POLICY "ticket_type_templates_internal_select" ON public.ticket_type_templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.event_day_templates edt
      INNER JOIN public.events_v2 e ON e.id = edt.event_id
      INNER JOIN public.merchant_members mm ON mm.merchant_id = e.merchant_id
      WHERE mm.user_id = auth.uid() AND edt.id = ticket_type_templates.event_day_template_id
    )
  );

-- ticket_type_templates: customer read active/paused events only
DROP POLICY IF EXISTS "ticket_type_templates_customer_select" ON public.ticket_type_templates;
CREATE POLICY "ticket_type_templates_customer_select" ON public.ticket_type_templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.event_day_templates edt
      INNER JOIN public.events_v2 e ON e.id = edt.event_id
      WHERE e.status IN ('active', 'paused')
        AND edt.id = ticket_type_templates.event_day_template_id
    )
  );

-- =========================================================
-- 5. Backfill: copy from most recently updated configured week
--    Idempotent: skips events that already have templates
--    Per-day duplicate guard: checks template_day ticket count
-- =========================================================

DO $$
DECLARE
  v_event RECORD;
  v_source_week_id UUID;
  v_template_day_id UUID;
  v_day RECORD;
  v_ticket RECORD;
  v_existing_ticket_count INT;
BEGIN
  FOR v_event IN SELECT id FROM public.events_v2 LOOP

    -- Skip if templates already exist for this event
    IF EXISTS (
      SELECT 1 FROM public.event_day_templates WHERE event_id = v_event.id
    ) THEN
      CONTINUE;
    END IF;

    -- Find best source: most recently updated week with at least one enabled day
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

      -- Handle ON CONFLICT: fetch existing row ID
      IF v_template_day_id IS NULL THEN
        SELECT id INTO v_template_day_id
        FROM public.event_day_templates
        WHERE event_id = v_event.id AND dow = v_day.dow;
      END IF;

      -- Per-day duplicate guard: only insert tickets if none exist yet
      SELECT count(*) INTO v_existing_ticket_count
      FROM public.ticket_type_templates
      WHERE event_day_template_id = v_template_day_id;

      IF v_existing_ticket_count > 0 THEN
        CONTINUE;
      END IF;

      -- Copy ticket types (including Stripe IDs for reuse)
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

  RAISE NOTICE 'Template backfill complete';
END;
$$;
