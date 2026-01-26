-- =========================================================
-- AUDIT QUERIES
-- 独立审计查询，供人工运行以排查数据问题
-- =========================================================

-- =========================================================
-- 1. 列出 region_id 与 merchant 不一致的 venues
-- =========================================================
SELECT 
  v.id AS venue_id,
  v.name AS venue_name,
  v.region_id AS venue_region_id,
  r1.name AS venue_region_name,
  m.id AS merchant_id,
  m.name AS merchant_name,
  m.region_id AS merchant_region_id,
  r2.name AS merchant_region_name,
  v.created_at
FROM public.venues v
INNER JOIN public.merchants m ON v.merchant_id = m.id
LEFT JOIN public.regions r1 ON v.region_id = r1.id
LEFT JOIN public.regions r2 ON m.region_id = r2.id
WHERE v.region_id IS DISTINCT FROM m.region_id
ORDER BY v.created_at DESC;

-- =========================================================
-- 2. 列出 region_id 与 venue 不一致的 events
-- =========================================================
SELECT 
  e.id AS event_id,
  e.title,
  e.status,
  e.region_id AS event_region_id,
  r1.name AS event_region_name,
  v.id AS venue_id,
  v.name AS venue_name,
  v.region_id AS venue_region_id,
  r2.name AS venue_region_name,
  e.created_at
FROM public.events e
INNER JOIN public.venues v ON e.venue_id = v.id
LEFT JOIN public.regions r1 ON e.region_id = r1.id
LEFT JOIN public.regions r2 ON v.region_id = r2.id
WHERE e.region_id IS DISTINCT FROM v.region_id
ORDER BY e.created_at DESC;

-- =========================================================
-- 3. 列出没有 venue_id 的 events（需人工分配）
-- =========================================================
SELECT 
  e.id AS event_id,
  e.title,
  e.status,
  e.merchant_id,
  m.name AS merchant_name,
  e.region_id,
  r.name AS region_name,
  e.created_at
FROM public.events e
LEFT JOIN public.merchants m ON e.merchant_id = m.id
LEFT JOIN public.regions r ON e.region_id = r.id
WHERE e.venue_id IS NULL
ORDER BY e.created_at DESC;

-- =========================================================
-- 4. 列出没有任何 venue 的 merchants
-- =========================================================
SELECT 
  m.id AS merchant_id,
  m.name AS merchant_name,
  m.status,
  m.region_id,
  r.name AS region_name,
  m.created_at
FROM public.merchants m
LEFT JOIN public.regions r ON m.region_id = r.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.venues v WHERE v.merchant_id = m.id
)
ORDER BY m.created_at DESC;

-- =========================================================
-- 5. 列出没有 address_line1 的 venues（需补全）
-- =========================================================
SELECT 
  v.id AS venue_id,
  v.name AS venue_name,
  v.address,
  v.formatted_address,
  v.address_line1,
  v.city,
  v.state,
  v.merchant_id,
  m.name AS merchant_name,
  v.created_at
FROM public.venues v
LEFT JOIN public.merchants m ON v.merchant_id = m.id
WHERE v.address_line1 IS NULL OR TRIM(v.address_line1) = ''
ORDER BY v.created_at DESC;

-- =========================================================
-- 6. 确认一致性统计
-- =========================================================
SELECT 
  'venues' AS table_name,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE v.region_id = m.region_id) AS consistent,
  COUNT(*) FILTER (WHERE v.region_id != m.region_id OR v.region_id IS NULL) AS inconsistent
FROM public.venues v
LEFT JOIN public.merchants m ON v.merchant_id = m.id

UNION ALL

SELECT 
  'events' AS table_name,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE e.region_id = v.region_id) AS consistent,
  COUNT(*) FILTER (WHERE e.region_id != v.region_id OR e.region_id IS NULL OR e.venue_id IS NULL) AS inconsistent
FROM public.events e
LEFT JOIN public.venues v ON e.venue_id = v.id;
