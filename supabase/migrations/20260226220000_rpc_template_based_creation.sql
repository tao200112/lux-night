-- =========================================================
-- Phase 1B: RPC upgrade — template-first creation + ON CONFLICT
-- =========================================================
--
-- Behavioral changes from Approach A:
-- 1. New weeks are created from event_day_templates + ticket_type_templates
--    (instead of copying from the previous week)
-- 2. Stripe IDs are inherited from templates (no Stripe API calls at creation)
-- 3. ON CONFLICT safety for event_weeks and event_week_days
-- 4. Existence guard for ticket_types_v2 to prevent duplicate ticket rows
-- 5. Legacy fallback: if no templates exist, copies from most recent week
--
-- Return type and shape are UNCHANGED — no consumer code changes needed.

CREATE OR REPLACE FUNCTION public.rpc_get_or_create_event_week(
  p_event_id UUID,
  p_for_date DATE,
  p_timezone TEXT DEFAULT 'America/New_York'
)
RETURNS TABLE (
  event_week_id UUID,
  week_start_date DATE,
  days JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start_date DATE;
  v_event_week_id UUID;
  v_prev_week_id UUID;
  v_days JSONB := '[]'::JSONB;
  v_new_day_id UUID;
  v_ticket_record RECORD;
  v_event_exists BOOLEAN;
  v_has_templates BOOLEAN;
  v_template_day RECORD;
  v_template_ticket RECORD;
  v_existing_day_count INT;
BEGIN
  -- Validate event exists
  SELECT EXISTS(
    SELECT 1 FROM public.events_v2 WHERE id = p_event_id
  ) INTO v_event_exists;

  IF NOT v_event_exists THEN
    RAISE EXCEPTION 'Event not found: %', p_event_id;
  END IF;

  -- Calculate week_start_date (Monday 00:00)
  v_week_start_date := p_for_date - (EXTRACT(DOW FROM p_for_date)::INT - 1 + 7) % 7;

  -- Check if week already exists
  SELECT id INTO v_event_week_id
  FROM public.event_weeks ew
  WHERE ew.event_id = p_event_id AND ew.week_start_date = v_week_start_date;

  IF v_event_week_id IS NOT NULL THEN
    -- Week exists — return existing config (unchanged from Approach A)
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', ewd.id,
        'dow', ewd.dow,
        'enabled', ewd.enabled,
        'start_time', ewd.start_time::TEXT,
        'end_time', ewd.end_time::TEXT,
        'end_next_day', ewd.end_next_day,
        'tickets', COALESCE(
          (SELECT jsonb_agg(
            jsonb_build_object(
              'id', tt.id,
              'name', tt.name,
              'category', tt.category,
              'price_cents', tt.price_cents,
              'currency', tt.currency,
              'min_age', tt.min_age,
              'inventory_limit', tt.inventory_limit,
              'sold_count', COALESCE(tt.sold_count, 0),
              'status', tt.status,
              'sort_order', tt.sort_order,
              'stripe_product_id', tt.stripe_product_id,
              'stripe_price_id', tt.stripe_price_id
            ) ORDER BY tt.sort_order
          )
          FROM public.ticket_types_v2 tt
          WHERE tt.event_week_day_id = ewd.id),
          '[]'::JSONB
        )
      ) ORDER BY ewd.dow
    ) INTO v_days
    FROM public.event_week_days ewd
    WHERE ewd.event_week_id = v_event_week_id;

    RETURN QUERY SELECT v_event_week_id, v_week_start_date, v_days;
    RETURN;
  END IF;

  -- ======================================================
  -- Week does not exist — create it (concurrency-safe)
  -- ======================================================

  -- ON CONFLICT: another concurrent call may have inserted already
  INSERT INTO public.event_weeks (event_id, week_start_date, timezone, status)
  VALUES (p_event_id, v_week_start_date, p_timezone, 'active')
  ON CONFLICT (event_id, week_start_date) DO NOTHING;

  -- Fetch the ID (whether we just inserted or another call did)
  SELECT id INTO v_event_week_id
  FROM public.event_weeks
  WHERE event_id = p_event_id AND week_start_date = v_week_start_date;

  -- Guard: if days already exist (another concurrent call populated them), return
  SELECT count(*) INTO v_existing_day_count
  FROM public.event_week_days
  WHERE event_week_id = v_event_week_id;

  IF v_existing_day_count > 0 THEN
    -- Another concurrent request already populated — return the result
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', ewd.id,
        'dow', ewd.dow,
        'enabled', ewd.enabled,
        'start_time', ewd.start_time::TEXT,
        'end_time', ewd.end_time::TEXT,
        'end_next_day', ewd.end_next_day,
        'tickets', COALESCE(
          (SELECT jsonb_agg(
            jsonb_build_object(
              'id', tt.id,
              'name', tt.name,
              'category', tt.category,
              'price_cents', tt.price_cents,
              'currency', tt.currency,
              'min_age', tt.min_age,
              'inventory_limit', tt.inventory_limit,
              'sold_count', COALESCE(tt.sold_count, 0),
              'status', tt.status,
              'sort_order', tt.sort_order,
              'stripe_product_id', tt.stripe_product_id,
              'stripe_price_id', tt.stripe_price_id
            ) ORDER BY tt.sort_order
          )
          FROM public.ticket_types_v2 tt
          WHERE tt.event_week_day_id = ewd.id),
          '[]'::JSONB
        )
      ) ORDER BY ewd.dow
    ) INTO v_days
    FROM public.event_week_days ewd
    WHERE ewd.event_week_id = v_event_week_id;

    RETURN QUERY SELECT v_event_week_id, v_week_start_date, v_days;
    RETURN;
  END IF;

  -- ======================================================
  -- Determine creation source: templates or legacy fallback
  -- ======================================================

  SELECT EXISTS(
    SELECT 1 FROM public.event_day_templates WHERE event_id = p_event_id
  ) INTO v_has_templates;

  IF v_has_templates THEN
    -- ====================================================
    -- TEMPLATE PATH: create from event_day_templates
    -- ====================================================
    FOR v_template_day IN
      SELECT * FROM public.event_day_templates
      WHERE event_id = p_event_id
      ORDER BY dow
    LOOP
      INSERT INTO public.event_week_days (
        event_week_id, dow, enabled, start_time, end_time, end_next_day, template_id
      ) VALUES (
        v_event_week_id, v_template_day.dow, v_template_day.enabled,
        v_template_day.start_time, v_template_day.end_time,
        v_template_day.end_next_day, v_template_day.id
      )
      ON CONFLICT (event_week_id, dow) DO NOTHING
      RETURNING id INTO v_new_day_id;

      IF v_new_day_id IS NULL THEN
        SELECT id INTO v_new_day_id
        FROM public.event_week_days
        WHERE event_week_id = v_event_week_id AND dow = v_template_day.dow;
      END IF;

      -- Guard: only insert tickets if this day has none yet
      IF NOT EXISTS (
        SELECT 1 FROM public.ticket_types_v2 WHERE event_week_day_id = v_new_day_id
      ) THEN
        FOR v_template_ticket IN
          SELECT * FROM public.ticket_type_templates
          WHERE event_day_template_id = v_template_day.id
          ORDER BY sort_order
        LOOP
          INSERT INTO public.ticket_types_v2 (
            event_week_day_id, name, category, price_cents, currency,
            min_age, inventory_limit, status, sort_order,
            stripe_product_id, stripe_price_id, template_id, sold_count
          ) VALUES (
            v_new_day_id, v_template_ticket.name, v_template_ticket.category,
            v_template_ticket.price_cents, v_template_ticket.currency,
            v_template_ticket.min_age, v_template_ticket.inventory_limit,
            v_template_ticket.status, v_template_ticket.sort_order,
            v_template_ticket.stripe_product_id, v_template_ticket.stripe_price_id,
            v_template_ticket.id, 0
          );
        END LOOP;
      END IF;
    END LOOP;

  ELSE
    -- ====================================================
    -- LEGACY PATH: copy from most recent previous week
    -- ====================================================
    SELECT id INTO v_prev_week_id
    FROM public.event_weeks ew
    WHERE ew.event_id = p_event_id
      AND ew.week_start_date < v_week_start_date
      AND ew.id != v_event_week_id
    ORDER BY ew.week_start_date DESC
    LIMIT 1;

    FOR i IN 0..6 LOOP
      DECLARE
        v_enabled BOOLEAN := false;
        v_start_time TIME := '16:00';
        v_end_time TIME := '02:00';
        v_end_next_day BOOLEAN := true;
      BEGIN
        IF v_prev_week_id IS NOT NULL THEN
          SELECT enabled, start_time, end_time, end_next_day
          INTO v_enabled, v_start_time, v_end_time, v_end_next_day
          FROM public.event_week_days ewd
          WHERE ewd.event_week_id = v_prev_week_id AND ewd.dow = i
          LIMIT 1;
        END IF;

        INSERT INTO public.event_week_days (
          event_week_id, dow, enabled, start_time, end_time, end_next_day
        ) VALUES (v_event_week_id, i, v_enabled, v_start_time, v_end_time, v_end_next_day)
        ON CONFLICT (event_week_id, dow) DO NOTHING
        RETURNING id INTO v_new_day_id;

        IF v_new_day_id IS NULL THEN
          SELECT id INTO v_new_day_id
          FROM public.event_week_days
          WHERE event_week_id = v_event_week_id AND dow = i;
        END IF;

        IF v_prev_week_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.ticket_types_v2 WHERE event_week_day_id = v_new_day_id
        ) THEN
          FOR v_ticket_record IN
            SELECT * FROM public.ticket_types_v2 tt
            INNER JOIN public.event_week_days ewd ON tt.event_week_day_id = ewd.id
            WHERE ewd.event_week_id = v_prev_week_id AND ewd.dow = i
            ORDER BY tt.sort_order
          LOOP
            INSERT INTO public.ticket_types_v2 (
              event_week_day_id, name, category, price_cents, currency,
              min_age, inventory_limit, status, sort_order, sold_count
            ) VALUES (
              v_new_day_id, v_ticket_record.name, v_ticket_record.category,
              v_ticket_record.price_cents, v_ticket_record.currency,
              v_ticket_record.min_age, v_ticket_record.inventory_limit,
              v_ticket_record.status, v_ticket_record.sort_order, 0
            );
          END LOOP;
        END IF;
      END;
    END LOOP;
  END IF;

  -- ======================================================
  -- Return newly created config
  -- ======================================================
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ewd.id,
      'dow', ewd.dow,
      'enabled', ewd.enabled,
      'start_time', ewd.start_time::TEXT,
      'end_time', ewd.end_time::TEXT,
      'end_next_day', ewd.end_next_day,
      'tickets', COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'id', tt.id,
            'name', tt.name,
            'category', tt.category,
            'price_cents', tt.price_cents,
            'currency', tt.currency,
            'min_age', tt.min_age,
            'inventory_limit', tt.inventory_limit,
            'sold_count', COALESCE(tt.sold_count, 0),
            'status', tt.status,
            'sort_order', tt.sort_order,
            'stripe_product_id', tt.stripe_product_id,
            'stripe_price_id', tt.stripe_price_id
          ) ORDER BY tt.sort_order
        )
        FROM public.ticket_types_v2 tt
        WHERE tt.event_week_day_id = ewd.id),
        '[]'::JSONB
      )
    ) ORDER BY ewd.dow
  ) INTO v_days
  FROM public.event_week_days ewd
  WHERE ewd.event_week_id = v_event_week_id;

  RETURN QUERY SELECT v_event_week_id, v_week_start_date, v_days;
END;
$$;

COMMENT ON FUNCTION public.rpc_get_or_create_event_week IS
  'Get or create event week. SECURITY DEFINER. '
  'Creates from templates if available, falls back to previous week copy. '
  'Concurrency-safe via ON CONFLICT + existence guards. '
  'Stripe IDs inherited from templates — no Stripe API calls at creation.';
