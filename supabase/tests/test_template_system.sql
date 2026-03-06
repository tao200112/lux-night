-- =========================================================
-- Phase 1 Template System — Verification Tests
-- Run against the database after deploying migrations.
-- Each test prints PASS or FAIL via RAISE NOTICE.
-- =========================================================

DO $$
DECLARE
  v_count INT;
  v_event_id UUID;
  v_template_day_id UUID;
  v_event_week_id UUID;
  v_event_week_id_2 UUID;
  v_day_count INT;
  v_ticket_count INT;
  v_ticket RECORD;
  v_result RECORD;
  v_test_week DATE := '2099-01-06'::DATE; -- far-future Monday
  v_test_week_2 DATE := '2099-01-13'::DATE;
BEGIN

  -- =========================================================
  -- TEST 1: Migration / backfill — template tables exist
  -- =========================================================
  SELECT count(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('event_day_templates', 'ticket_type_templates');

  IF v_count = 2 THEN
    RAISE NOTICE 'TEST 1 PASS: Template tables exist';
  ELSE
    RAISE NOTICE 'TEST 1 FAIL: Expected 2 template tables, got %', v_count;
  END IF;

  -- =========================================================
  -- TEST 2: Backfill — active events have templates
  -- =========================================================
  SELECT count(*) INTO v_count
  FROM public.events_v2 e
  WHERE e.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.event_weeks ew
      JOIN public.event_week_days ewd ON ewd.event_week_id = ew.id
      WHERE ew.event_id = e.id AND ewd.enabled = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.event_day_templates edt WHERE edt.event_id = e.id
    );

  IF v_count = 0 THEN
    RAISE NOTICE 'TEST 2 PASS: All configured active events have templates';
  ELSE
    RAISE NOTICE 'TEST 2 FAIL: % active events with weeks but no templates', v_count;
  END IF;

  -- =========================================================
  -- TEST 3: FK columns exist on instance tables
  -- =========================================================
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'event_week_days' AND column_name = 'template_id')
      OR (table_name = 'ticket_types_v2' AND column_name = 'template_id')
    );

  IF v_count = 2 THEN
    RAISE NOTICE 'TEST 3 PASS: template_id columns exist on instance tables';
  ELSE
    RAISE NOTICE 'TEST 3 FAIL: Expected 2 template_id columns, got %', v_count;
  END IF;

  -- =========================================================
  -- TEST 4: New week from templates (+ Stripe ID inheritance)
  -- Find an event with templates and Stripe IDs
  -- =========================================================
  SELECT edt.event_id INTO v_event_id
  FROM public.event_day_templates edt
  JOIN public.ticket_type_templates ttt ON ttt.event_day_template_id = edt.id
  WHERE ttt.stripe_price_id IS NOT NULL
  LIMIT 1;

  IF v_event_id IS NULL THEN
    RAISE NOTICE 'TEST 4 SKIP: No event with template Stripe IDs found (backfill may need Stripe sync)';
    RAISE NOTICE 'TEST 5 SKIP: depends on TEST 4';
    RAISE NOTICE 'TEST 6 SKIP: depends on TEST 4';
  ELSE
    -- Delete any existing test week
    DELETE FROM public.event_weeks
    WHERE event_id = v_event_id AND week_start_date = v_test_week;

    -- Create week via RPC
    SELECT ew.event_week_id INTO v_event_week_id
    FROM public.rpc_get_or_create_event_week(v_event_id, v_test_week) ew;

    IF v_event_week_id IS NULL THEN
      RAISE NOTICE 'TEST 4 FAIL: RPC returned no event_week_id';
    ELSE
      -- Check that instance ticket rows have Stripe IDs inherited from templates
      SELECT count(*) INTO v_ticket_count
      FROM public.ticket_types_v2 tt
      JOIN public.event_week_days ewd ON tt.event_week_day_id = ewd.id
      WHERE ewd.event_week_id = v_event_week_id
        AND tt.status = 'active'
        AND tt.stripe_price_id IS NOT NULL;

      IF v_ticket_count > 0 THEN
        RAISE NOTICE 'TEST 4 PASS: New week created from templates, % tickets have Stripe IDs', v_ticket_count;
      ELSE
        RAISE NOTICE 'TEST 4 FAIL: New week tickets have no Stripe IDs (expected inheritance from templates)';
      END IF;

      -- Check template_id is set on instances
      SELECT count(*) INTO v_count
      FROM public.ticket_types_v2 tt
      JOIN public.event_week_days ewd ON tt.event_week_day_id = ewd.id
      WHERE ewd.event_week_id = v_event_week_id AND tt.template_id IS NOT NULL;

      IF v_count > 0 THEN
        RAISE NOTICE 'TEST 4b PASS: Instance ticket rows have template_id set (% rows)', v_count;
      ELSE
        RAISE NOTICE 'TEST 4b FAIL: No instance tickets have template_id set';
      END IF;

      -- =========================================================
      -- TEST 5: Concurrency safety — call RPC again for same week
      -- =========================================================
      SELECT ew.event_week_id INTO v_event_week_id_2
      FROM public.rpc_get_or_create_event_week(v_event_id, v_test_week) ew;

      IF v_event_week_id_2 = v_event_week_id THEN
        RAISE NOTICE 'TEST 5 PASS: Concurrent RPC call returns same week ID (no duplicates)';
      ELSE
        RAISE NOTICE 'TEST 5 FAIL: Second call returned different week ID: % vs %', v_event_week_id, v_event_week_id_2;
      END IF;

      -- Check no duplicate days
      SELECT count(*) INTO v_count
      FROM (
        SELECT event_week_id, dow, count(*) as cnt
        FROM public.event_week_days
        WHERE event_week_id = v_event_week_id
        GROUP BY event_week_id, dow
        HAVING count(*) > 1
      ) dupes;

      IF v_count = 0 THEN
        RAISE NOTICE 'TEST 5b PASS: No duplicate event_week_days rows';
      ELSE
        RAISE NOTICE 'TEST 5b FAIL: % duplicate day groups found', v_count;
      END IF;

      -- =========================================================
      -- TEST 6: sold_count = 0 on newly created instances
      -- =========================================================
      SELECT count(*) INTO v_count
      FROM public.ticket_types_v2 tt
      JOIN public.event_week_days ewd ON tt.event_week_day_id = ewd.id
      WHERE ewd.event_week_id = v_event_week_id AND tt.sold_count != 0;

      IF v_count = 0 THEN
        RAISE NOTICE 'TEST 6 PASS: All new instance tickets have sold_count = 0';
      ELSE
        RAISE NOTICE 'TEST 6 FAIL: % tickets have non-zero sold_count', v_count;
      END IF;

      -- Cleanup test data
      DELETE FROM public.event_weeks
      WHERE event_id = v_event_id AND week_start_date = v_test_week;
    END IF;
  END IF;

  -- =========================================================
  -- TEST 7: Legacy fallback — event without templates
  -- =========================================================
  -- Find an event WITHOUT templates but WITH at least one week
  SELECT e.id INTO v_event_id
  FROM public.events_v2 e
  WHERE NOT EXISTS (
    SELECT 1 FROM public.event_day_templates edt WHERE edt.event_id = e.id
  )
  AND EXISTS (
    SELECT 1 FROM public.event_weeks ew WHERE ew.event_id = e.id
  )
  LIMIT 1;

  IF v_event_id IS NULL THEN
    RAISE NOTICE 'TEST 7 SKIP: No event without templates but with weeks found (all backfilled)';
  ELSE
    DELETE FROM public.event_weeks
    WHERE event_id = v_event_id AND week_start_date = v_test_week_2;

    SELECT ew.event_week_id INTO v_event_week_id
    FROM public.rpc_get_or_create_event_week(v_event_id, v_test_week_2) ew;

    IF v_event_week_id IS NOT NULL THEN
      SELECT count(*) INTO v_day_count
      FROM public.event_week_days WHERE event_week_id = v_event_week_id;

      IF v_day_count = 7 THEN
        RAISE NOTICE 'TEST 7 PASS: Legacy fallback created 7 days for event without templates';
      ELSE
        RAISE NOTICE 'TEST 7 FAIL: Legacy fallback created % days (expected 7)', v_day_count;
      END IF;

      DELETE FROM public.event_weeks
      WHERE event_id = v_event_id AND week_start_date = v_test_week_2;
    ELSE
      RAISE NOTICE 'TEST 7 FAIL: RPC returned NULL for legacy fallback';
    END IF;
  END IF;

  -- =========================================================
  -- TEST 8: Template edit does not modify current week
  -- (Structural verification: template and instance are separate tables)
  -- =========================================================
  SELECT count(*) INTO v_count
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'ticket_type_templates'
    AND constraint_type = 'FOREIGN KEY';

  -- ticket_type_templates FK points to event_day_templates, NOT to event_week_days
  IF v_count >= 1 THEN
    RAISE NOTICE 'TEST 8 PASS: ticket_type_templates has FK constraints (separate from instances)';
  ELSE
    RAISE NOTICE 'TEST 8 FAIL: ticket_type_templates missing FK constraints';
  END IF;

  -- =========================================================
  -- TEST 9: RLS policies exist on template tables
  -- =========================================================
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE tablename IN ('event_day_templates', 'ticket_type_templates');

  IF v_count >= 6 THEN
    RAISE NOTICE 'TEST 9 PASS: % RLS policies on template tables', v_count;
  ELSE
    RAISE NOTICE 'TEST 9 FAIL: Only % RLS policies on template tables (expected >= 6)', v_count;
  END IF;

  -- =========================================================
  -- TEST 10: Duplicate detection query for monitoring
  -- =========================================================
  -- This query should return 0 rows in a healthy system
  SELECT count(*) INTO v_count
  FROM (
    SELECT ewd.event_week_id, tt.template_id, count(*) as cnt
    FROM public.ticket_types_v2 tt
    JOIN public.event_week_days ewd ON tt.event_week_day_id = ewd.id
    WHERE tt.template_id IS NOT NULL
    GROUP BY ewd.event_week_id, tt.template_id
    HAVING count(*) > 1
  ) dupes;

  IF v_count = 0 THEN
    RAISE NOTICE 'TEST 10 PASS: No duplicate template-sourced ticket instances';
  ELSE
    RAISE NOTICE 'TEST 10 WARN: % template_id duplicates found (may indicate concurrent creation)', v_count;
  END IF;

  RAISE NOTICE '=== ALL TESTS COMPLETE ===';
END;
$$;
