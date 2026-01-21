-- =========================================================
-- Fix Venues RLS for Event Queries
-- =========================================================
-- This migration updates the venues RLS policy to allow
-- reading venues that are associated with published events
-- even if the venue is not active (for event detail pages)

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "venues_read_public" ON public.venues;

-- Create a new policy that allows reading venues in two cases:
-- 1. Venues that are active (for general venue listings)
-- 2. Venues associated with published events (for event detail pages)
CREATE POLICY "venues_read_public"
ON public.venues FOR SELECT
TO public
USING (
  is_active = true
  OR EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.venue_id = venues.id
      AND e.status = 'published'
  )
);

-- Alternative: If you want to keep the restrictive policy for listings
-- but allow event-related queries, you can create a separate policy:
-- (Comment out the above and use this instead)

-- DROP POLICY IF EXISTS "venues_read_public" ON public.venues;
-- CREATE POLICY "venues_read_public"
-- ON public.venues FOR SELECT
-- TO public
-- USING (is_active = true);

-- DROP POLICY IF EXISTS "venues_read_via_published_events" ON public.venues;
-- CREATE POLICY "venues_read_via_published_events"
-- ON public.venues FOR SELECT
-- TO public
-- USING (
--   EXISTS (
--     SELECT 1
--     FROM public.events e
--     WHERE e.venue_id = venues.id
--       AND e.status = 'published'
--   )
-- );
