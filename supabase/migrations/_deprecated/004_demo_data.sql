-- =========================================================
-- Demo Data for Lux Night
-- =========================================================
-- This script inserts demo data for regions, merchants, venues, events, and ticket types
-- Run this after the initial schema migrations

-- =========================================================
-- 1. Check existing data (optional - for verification)
-- =========================================================
-- SELECT COUNT(*) as region_count FROM public.regions;
-- SELECT COUNT(*) as merchant_count FROM public.merchants;
-- SELECT COUNT(*) as venue_count FROM public.venues;
-- SELECT COUNT(*) as event_count FROM public.events;
-- SELECT COUNT(*) as ticket_type_count FROM public.ticket_types;

-- =========================================================
-- 2. Clear existing demo data (optional - uncomment to reset)
-- =========================================================
-- DELETE FROM public.ticket_types WHERE event_id IN (SELECT id FROM public.events WHERE title LIKE '%Gala%' OR title LIKE '%Nights%');
-- DELETE FROM public.events WHERE title LIKE '%Gala%' OR title LIKE '%Nights%';
-- DELETE FROM public.venues WHERE name IN ('The Obsidian Lounge', 'Velvet Room', 'The Grand Onyx', 'M1NT');
-- DELETE FROM public.merchants WHERE name IN ('Lux Nightlife Group', 'Elite Entertainment');
-- DELETE FROM public.regions WHERE name IN ('New York', 'Los Angeles', 'Shanghai', 'Tokyo', 'Singapore', 'London');

-- =========================================================
-- 3. Insert Demo Data
-- =========================================================

-- 3.1 Regions
INSERT INTO public.regions (name, state, country, lat, lng, is_active) VALUES
  ('New York', 'NY', 'US', 40.7128, -74.0060, true),
  ('Los Angeles', 'CA', 'US', 34.0522, -118.2437, true),
  ('Shanghai', NULL, 'CN', 31.2304, 121.4737, true),
  ('Tokyo', NULL, 'JP', 35.6762, 139.6503, true),
  ('Singapore', NULL, 'SG', 1.3521, 103.8198, true),
  ('London', NULL, 'GB', 51.5074, -0.1278, true)
ON CONFLICT (name, state, country) DO NOTHING;

-- 3.2 Get region IDs (for reference in subsequent inserts)
-- Note: We'll use subqueries to get IDs dynamically

-- 3.3 Merchants
INSERT INTO public.merchants (region_id, name, status)
SELECT 
  r.id,
  'Lux Nightlife Group',
  'active'
FROM public.regions r
WHERE r.name = 'New York'
ON CONFLICT (region_id, name) DO NOTHING;

INSERT INTO public.merchants (region_id, name, status)
SELECT 
  r.id,
  'Elite Entertainment',
  'active'
FROM public.regions r
WHERE r.name = 'New York'
ON CONFLICT (region_id, name) DO NOTHING;

INSERT INTO public.merchants (region_id, name, status)
SELECT 
  r.id,
  'Lux Nightlife Group',
  'active'
FROM public.regions r
WHERE r.name = 'Shanghai'
ON CONFLICT (region_id, name) DO NOTHING;

-- 3.4 Venues
INSERT INTO public.venues (merchant_id, region_id, name, address, lat, lng, timezone, is_active)
SELECT 
  m.id,
  r.id,
  'The Obsidian Lounge',
  '123 Broadway, New York, NY 10001',
  40.7505,
  -73.9934,
  'America/New_York',
  true
FROM public.merchants m
JOIN public.regions r ON m.region_id = r.id
WHERE m.name = 'Lux Nightlife Group' AND r.name = 'New York'
ON CONFLICT (merchant_id, name) DO NOTHING;

INSERT INTO public.venues (merchant_id, region_id, name, address, lat, lng, timezone, is_active)
SELECT 
  m.id,
  r.id,
  'Velvet Room',
  '456 5th Ave, New York, NY 10010',
  40.7489,
  -73.9857,
  'America/New_York',
  true
FROM public.merchants m
JOIN public.regions r ON m.region_id = r.id
WHERE m.name = 'Elite Entertainment' AND r.name = 'New York'
ON CONFLICT (merchant_id, name) DO NOTHING;

INSERT INTO public.venues (merchant_id, region_id, name, address, lat, lng, timezone, is_active)
SELECT 
  m.id,
  r.id,
  'The Grand Onyx',
  '789 Park Ave, New York, NY 10021',
  40.7685,
  -73.9654,
  'America/New_York',
  true
FROM public.merchants m
JOIN public.regions r ON m.region_id = r.id
WHERE m.name = 'Lux Nightlife Group' AND r.name = 'New York'
ON CONFLICT (merchant_id, name) DO NOTHING;

INSERT INTO public.venues (merchant_id, region_id, name, address, lat, lng, timezone, is_active)
SELECT 
  m.id,
  r.id,
  'M1NT',
  '120 Nanjing Rd, Shanghai, China',
  31.2304,
  121.4737,
  'Asia/Shanghai',
  true
FROM public.merchants m
JOIN public.regions r ON m.region_id = r.id
WHERE m.name = 'Lux Nightlife Group' AND r.name = 'Shanghai'
ON CONFLICT (merchant_id, name) DO NOTHING;

-- 3.5 Events (published events for demo)
-- Event 1: Midnight Gold Gala (Tonight)
INSERT INTO public.events (
  region_id, merchant_id, venue_id,
  status, title, description, poster_url,
  start_at, end_at, age_policy, refund_policy, publish_at
)
SELECT 
  r.id,
  m.id,
  v.id,
  'published',
  'Midnight Gold Gala',
  'Experience the most exclusive New Year''s Eve celebration in New York City. The Grand Onyx transforms into a haven of luxury with world-class entertainment, bespoke cocktails, and an atmosphere that defines the night.',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBhXkjDV4Jrs5YGXi-v_0TlLMMXIU1w1P6S-9df-NN88cWVgm-Z8BU1aa5oTpfNFwouMt9JrhSEsNWH4IFnDWfCoAFadKJN53IhpyGdFSlOVnt5zIDcd8tmWivbYYAQfgV5Pn7GaPo7N8e8SBXoHuoZP0erRXhQ3bSDkSh4jCPjXd9wd-bf3eflbV3oYH2f-F-GWPJqzpYVWdpzUe9jJpXVfgwLkRsMOX4i1TFz8CLlqP2UtVNQnP-a6GKN926E6mw5rkT05JyK_8U0',
  NOW() + INTERVAL '2 hours',  -- Starts in 2 hours (tonight)
  NOW() + INTERVAL '6 hours',  -- Ends in 6 hours
  '21+',
  '24h',
  NOW() - INTERVAL '1 day'
FROM public.venues v
JOIN public.merchants m ON v.merchant_id = m.id
JOIN public.regions r ON v.region_id = r.id
WHERE v.name = 'The Grand Onyx' AND r.name = 'New York'
LIMIT 1;

-- Event 2: Neon Nights: Deep House (Upcoming)
INSERT INTO public.events (
  region_id, merchant_id, venue_id,
  status, title, description, poster_url,
  start_at, end_at, age_policy, refund_policy, publish_at
)
SELECT 
  r.id,
  m.id,
  v.id,
  'published',
  'Neon Nights: Deep House',
  'An electrifying night of deep house music featuring world-renowned DJs. Get ready for an immersive audio-visual experience with state-of-the-art sound and lighting systems.',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDtzwPTFmG482WX9iO9Hbtf82KC7kOLZGkHS1y8uUnB3cCRj-ieYtLQ713KnDUUA8GiI7FYwYGhZlhIG_YlGaqQrIIPN2MuMpfEaJ5k-ucLgRjUAMLD-sEC7MBBZcLSSDaoi1qFDKpir9jRs6OAVIIBnFMUTSfKN7hq5PRsF0zMZHOWiK1wLFrY8QqGvrowsbyuszFzOSaxyjpgStKAzpFnRVerT0t1pVnhX_QCvDggIqdia6mTRaUKS84WBbR8sIye_XYqiAzEoC-n',
  NOW() + INTERVAL '3 days',  -- Starts in 3 days
  NOW() + INTERVAL '3 days' + INTERVAL '5 hours',  -- Ends 5 hours later
  '21+',
  'no_refund',
  NOW() - INTERVAL '2 days'
FROM public.venues v
JOIN public.merchants m ON v.merchant_id = m.id
JOIN public.regions r ON v.region_id = r.id
WHERE v.name = 'M1NT' AND r.name = 'Shanghai'
LIMIT 1;

-- Event 3: The Obsidian Lounge Tonight Event
INSERT INTO public.events (
  region_id, merchant_id, venue_id,
  status, title, description, poster_url,
  start_at, end_at, age_policy, refund_policy, publish_at
)
SELECT 
  r.id,
  m.id,
  v.id,
  'published',
  'Tonight at The Obsidian Lounge',
  'Dimly lit luxurious bar interior with gold accents. Jazz & Cocktails night featuring live performances and premium mixology.',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBhXkjDV4Jrs5YGXi-v_0TlLMMXIU1w1P6S-9df-NN88cWVgm-Z8BU1aa5oTpfNFwouMt9JrhSEsNWH4IFnDWfCoAFadKJN53IhpyGdFSlOVnt5zIDcd8tmWivbYYAQfgV5Pn7GaPo7N8e8SBXoHuoZP0erRXhQ3bSDkSh4jCPjXd9wd-bf3eflbV3oYH2f-F-GWPJqzpYVWdpzUe9jJpXVfgwLkRsMOX4i1TFz8CLlqP2UtVNQnP-a6GKN926E6mw5rkT05JyK_8U0',
  NOW() + INTERVAL '1 hour',  -- Starts in 1 hour
  NOW() + INTERVAL '5 hours',  -- Ends in 5 hours
  '21+',
  'flexible',
  NOW() - INTERVAL '3 days'
FROM public.venues v
JOIN public.merchants m ON v.merchant_id = m.id
JOIN public.regions r ON v.region_id = r.id
WHERE v.name = 'The Obsidian Lounge' AND r.name = 'New York'
LIMIT 1;

-- 3.6 Ticket Types for each event

-- Ticket Types for Midnight Gold Gala
INSERT INTO public.ticket_types (event_id, name, category, price_cents, currency, inventory_limit, sold_count, redeem_limit, is_active)
SELECT 
  e.id,
  'General Admission',
  'ENTRY',
  4000,  -- $40.00
  'usd',
  100,  -- Limited inventory
  5,  -- Already sold 5
  1,
  true
FROM public.events e
WHERE e.title = 'Midnight Gold Gala'
ON CONFLICT (event_id, name) DO NOTHING;

INSERT INTO public.ticket_types (event_id, name, category, price_cents, currency, inventory_limit, sold_count, redeem_limit, is_active)
SELECT 
  e.id,
  'VIP Table',
  'ENTRY',
  50000,  -- $500.00
  'usd',
  10,  -- Limited inventory
  2,  -- Already sold 2
  1,
  true
FROM public.events e
WHERE e.title = 'Midnight Gold Gala'
ON CONFLICT (event_id, name) DO NOTHING;

-- Ticket Types for Neon Nights: Deep House
INSERT INTO public.ticket_types (event_id, name, category, price_cents, currency, inventory_limit, sold_count, redeem_limit, is_active)
SELECT 
  e.id,
  'General Admission',
  'ENTRY',
  3500,  -- $35.00
  'usd',
  200,  -- Limited inventory
  12,  -- Already sold 12
  1,
  true
FROM public.events e
WHERE e.title = 'Neon Nights: Deep House'
ON CONFLICT (event_id, name) DO NOTHING;

INSERT INTO public.ticket_types (event_id, name, category, price_cents, currency, inventory_limit, sold_count, redeem_limit, is_active)
SELECT 
  e.id,
  'VIP Entry',
  'ENTRY',
  8000,  -- $80.00
  'usd',
  50,  -- Limited inventory
  3,  -- Already sold 3
  1,
  true
FROM public.events e
WHERE e.title = 'Neon Nights: Deep House'
ON CONFLICT (event_id, name) DO NOTHING;

INSERT INTO public.ticket_types (event_id, name, category, price_cents, currency, inventory_limit, sold_count, redeem_limit, is_active)
SELECT 
  e.id,
  'Drink Pass',
  'DRINK',
  2500,  -- $25.00
  'usd',
  NULL,  -- Unlimited
  8,  -- Already sold 8
  3,  -- Can redeem 3 times
  true
FROM public.events e
WHERE e.title = 'Neon Nights: Deep House'
ON CONFLICT (event_id, name) DO NOTHING;

-- Ticket Types for The Obsidian Lounge Tonight Event
INSERT INTO public.ticket_types (event_id, name, category, price_cents, currency, inventory_limit, sold_count, redeem_limit, is_active)
SELECT 
  e.id,
  'Entry 21+',
  'ENTRY',
  3000,  -- $30.00
  'usd',
  NULL,  -- Unlimited
  15,  -- Already sold 15
  1,
  true
FROM public.events e
WHERE e.title = 'Tonight at The Obsidian Lounge'
ON CONFLICT (event_id, name) DO NOTHING;

INSERT INTO public.ticket_types (event_id, name, category, price_cents, currency, inventory_limit, sold_count, redeem_limit, is_active)
SELECT 
  e.id,
  'Combo Entry + Drink',
  'ENTRY',
  4500,  -- $45.00
  'usd',
  80,  -- Limited inventory
  20,  -- Already sold 20
  2,  -- Can redeem 2 times (entry + drink)
  true
FROM public.events e
WHERE e.title = 'Tonight at The Obsidian Lounge'
ON CONFLICT (event_id, name) DO NOTHING;

-- =========================================================
-- 4. Verification Queries (run these to check the data)
-- =========================================================
-- SELECT 'Regions' as table_name, COUNT(*) as count FROM public.regions
-- UNION ALL
-- SELECT 'Merchants', COUNT(*) FROM public.merchants
-- UNION ALL
-- SELECT 'Venues', COUNT(*) FROM public.venues
-- UNION ALL
-- SELECT 'Events', COUNT(*) FROM public.events WHERE status = 'published'
-- UNION ALL
-- SELECT 'Ticket Types', COUNT(*) FROM public.ticket_types WHERE is_active = true;

-- SELECT e.title, e.start_at, v.name as venue, COUNT(tt.id) as ticket_types_count
-- FROM public.events e
-- JOIN public.venues v ON e.venue_id = v.id
-- LEFT JOIN public.ticket_types tt ON e.id = tt.event_id
-- WHERE e.status = 'published'
-- GROUP BY e.id, e.title, e.start_at, v.name
-- ORDER BY e.start_at;
