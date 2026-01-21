-- =========================================================
-- Debug Event Query
-- =========================================================
-- Use this query to debug event loading issues
-- Replace 'YOUR_EVENT_ID' with the actual event ID

-- Check if event exists
SELECT 
  e.id,
  e.title,
  e.status,
  e.venue_id,
  v.id as venue_exists,
  v.name as venue_name,
  v.address as venue_address
FROM public.events e
LEFT JOIN public.venues v ON e.venue_id = v.id
WHERE e.id = '66dca6c2-971a-413f-9c32-8c1c0729f310'  -- Replace with your event ID
LIMIT 1;

-- Check all events with their venues
SELECT 
  e.id as event_id,
  e.title,
  e.status,
  e.venue_id,
  CASE WHEN v.id IS NULL THEN 'MISSING VENUE' ELSE 'HAS VENUE' END as venue_status,
  v.name as venue_name,
  v.address as venue_address
FROM public.events e
LEFT JOIN public.venues v ON e.venue_id = v.id
WHERE e.status = 'published'
ORDER BY e.created_at DESC
LIMIT 10;

-- Check RLS policies for events
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('events', 'venues')
ORDER BY tablename, policyname;
