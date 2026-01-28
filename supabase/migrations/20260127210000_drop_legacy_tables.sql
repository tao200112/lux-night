-- Drop Foreign Keys from 'tickets' that reference legacy tables
-- We remove constraints so that we can drop the referenced tables.
-- The columns event_id and ticket_type_id will remain in 'tickets' as loose UUIDs
-- because some V2 code might still write to them for backward compatibility or simple querying.
DO $$
BEGIN
  -- tickets -> events
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tickets_event_id_fkey') THEN
    ALTER TABLE public.tickets DROP CONSTRAINT tickets_event_id_fkey;
  END IF;

  -- tickets -> ticket_types
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tickets_ticket_type_id_fkey') THEN
    ALTER TABLE public.tickets DROP CONSTRAINT tickets_ticket_type_id_fkey;
  END IF;

  -- order_items -> events
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'order_items_event_id_fkey') THEN
    ALTER TABLE public.order_items DROP CONSTRAINT order_items_event_id_fkey;
  END IF;

  -- order_items -> ticket_types
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'order_items_ticket_type_id_fkey') THEN
    ALTER TABLE public.order_items DROP CONSTRAINT order_items_ticket_type_id_fkey;
  END IF;
END $$;

-- Drop legacy tables
-- These tables are replaced by V2 architecture (events_v2, event_weeks, etc.)
DROP TABLE IF EXISTS public.request_events;
DROP TABLE IF EXISTS public.event_change_requests;
DROP TABLE IF EXISTS public.ticket_type_prices;
DROP TABLE IF EXISTS public.ticket_types;
DROP TABLE IF EXISTS public.event_weekly_rules;
DROP TABLE IF EXISTS public.events;
