-- Fix timezone defaults: standardize on America/New_York
-- All business operations use ET (handles EST/EDT automatically)
-- Only alter tables that exist (event_weekly_rules/events may have been dropped in legacy cleanup)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_weekly_rules') THEN
    ALTER TABLE public.event_weekly_rules ALTER COLUMN timezone SET DEFAULT 'America/New_York';
    UPDATE public.event_weekly_rules SET timezone = 'America/New_York' WHERE timezone = 'America/Los_Angeles';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events') THEN
    ALTER TABLE public.events ALTER COLUMN timezone SET DEFAULT 'America/New_York';
    UPDATE public.events SET timezone = 'America/New_York' WHERE timezone = 'America/Los_Angeles';
  END IF;
END $$;
