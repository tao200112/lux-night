-- =========================================================
-- Check Demo Data in Supabase
-- =========================================================
-- Run this query to check if demo data exists

-- Check Regions
SELECT 'Regions' as table_name, COUNT(*) as count, 
  STRING_AGG(name, ', ') as names
FROM public.regions
WHERE is_active = true;

-- Check Merchants
SELECT 'Merchants' as table_name, COUNT(*) as count,
  STRING_AGG(DISTINCT name, ', ') as names
FROM public.merchants
WHERE status = 'active';

-- Check Venues
SELECT 'Venues' as table_name, COUNT(*) as count,
  STRING_AGG(DISTINCT name, ', ') as names
FROM public.venues
WHERE is_active = true;

-- Check Published Events
SELECT 'Events (Published)' as table_name, COUNT(*) as count,
  STRING_AGG(title, ', ') as titles
FROM public.events
WHERE status = 'published';

-- Check Active Ticket Types
SELECT 'Ticket Types (Active)' as table_name, COUNT(*) as count
FROM public.ticket_types
WHERE is_active = true;

-- Detailed Event View with Ticket Types
SELECT 
  e.id as event_id,
  e.title as event_title,
  e.status,
  e.start_at,
  e.end_at,
  v.name as venue_name,
  r.name as region_name,
  COUNT(tt.id) as ticket_type_count,
  MIN(tt.price_cents)::float / 100.0 as min_price,
  MAX(tt.price_cents)::float / 100.0 as max_price
FROM public.events e
LEFT JOIN public.venues v ON e.venue_id = v.id
LEFT JOIN public.regions r ON e.region_id = r.id
LEFT JOIN public.ticket_types tt ON e.id = tt.event_id AND tt.is_active = true
GROUP BY e.id, e.title, e.status, e.start_at, e.end_at, v.name, r.name
ORDER BY e.start_at;
