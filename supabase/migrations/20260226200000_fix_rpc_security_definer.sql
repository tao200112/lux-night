-- Fix rpc_get_or_create_event_week: SECURITY DEFINER + improved previous week lookup
--
-- Root cause: The RPC runs as SECURITY INVOKER (default), so customer/internal
-- API calls cannot INSERT into event_weeks/event_week_days/ticket_types_v2
-- (RLS only allows admin). This causes "No tickets available" every new week
-- until an admin manually visits the admin dashboard.
--
-- Fix:
-- 1. SECURITY DEFINER: allows all callers to create weeks
-- 2. Event existence validation: prevents abuse
-- 3. Most recent week lookup: handles gaps > 7 days

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
BEGIN
  -- Security: validate event exists before any writes
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
    -- Week exists — return existing config
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

  -- Week does not exist — create it
  INSERT INTO public.event_weeks (event_id, week_start_date, timezone, status)
  VALUES (p_event_id, v_week_start_date, p_timezone, 'active')
  RETURNING id INTO v_event_week_id;

  -- Find MOST RECENT previous week (not just exactly -7 days)
  SELECT id INTO v_prev_week_id
  FROM public.event_weeks ew
  WHERE ew.event_id = p_event_id
    AND ew.week_start_date < v_week_start_date
    AND ew.id != v_event_week_id
  ORDER BY ew.week_start_date DESC
  LIMIT 1;

  -- Create 7 event_week_days, copying from previous week if available
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
      )
      VALUES (v_event_week_id, i, v_enabled, v_start_time, v_end_time, v_end_next_day)
      RETURNING id INTO v_new_day_id;

      -- Copy ticket types from previous week (without Stripe IDs — sync handles those)
      IF v_prev_week_id IS NOT NULL THEN
        FOR v_ticket_record IN
          SELECT * FROM public.ticket_types_v2 tt
          INNER JOIN public.event_week_days ewd ON tt.event_week_day_id = ewd.id
          WHERE ewd.event_week_id = v_prev_week_id AND ewd.dow = i
          ORDER BY tt.sort_order
        LOOP
          INSERT INTO public.ticket_types_v2 (
            event_week_day_id, name, category, price_cents, currency,
            min_age, inventory_limit, status, sort_order
          )
          VALUES (
            v_new_day_id, v_ticket_record.name, v_ticket_record.category,
            v_ticket_record.price_cents, v_ticket_record.currency,
            v_ticket_record.min_age, v_ticket_record.inventory_limit,
            v_ticket_record.status, v_ticket_record.sort_order
          );
        END LOOP;
      END IF;
    END;
  END LOOP;

  -- Return newly created config
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
  'Get or create event week configuration. SECURITY DEFINER to allow customer/internal '
  'callers to auto-create weeks. Copies from most recent previous week (handles gaps). '
  'Stripe sync runs separately via syncEventWeekStripeIfNeeded.';
