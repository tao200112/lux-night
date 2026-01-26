-- =========================================================
-- 恢复并配置三处地址（仅 UPDATE/INSERT 数据，不改表结构）
-- - Los Angeles region: 补全 slug, city, center_lat/lng
-- - Blacksburg, VA region: 不存在则 INSERT，存在则 UPDATE
-- - Test Venue: 写入真实 place_id 与结构化地址（洛杉矶市政厅）
-- =========================================================

-- ---------- 1. Los Angeles region ----------
UPDATE public.regions
SET
  slug = 'los-angeles',
  city = 'Los Angeles',
  center_lat = COALESCE(lat, 34.0522),
  center_lng = COALESCE(lng, -118.2437),
  lat = COALESCE(lat, 34.0522),
  lng = COALESCE(lng, -118.2437),
  updated_at = NOW()
WHERE name = 'Los Angeles'
  AND state = 'CA'
  AND country = 'US';

-- ---------- 2. Blacksburg, VA region ----------
INSERT INTO public.regions (
  name,
  state,
  country,
  slug,
  city,
  lat,
  lng,
  center_lat,
  center_lng,
  is_active
)
VALUES (
  'Blacksburg',
  'VA',
  'US',
  'blacksburg',
  'Blacksburg',
  37.2296,
  -80.4139,
  37.2296,
  -80.4139,
  true
)
ON CONFLICT (name, state, country)
DO UPDATE SET
  slug = EXCLUDED.slug,
  city = EXCLUDED.city,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  center_lat = EXCLUDED.center_lat,
  center_lng = EXCLUDED.center_lng,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ---------- 3. Test Venue（Test Merchant (Invite 1461) 下的 Test Venue）----------
-- 洛杉矶市政厅：place_id ChIJ1-4rtgE0woARw3t2-2P6aA
-- 200 N Spring St, Los Angeles, CA 90012, USA
-- 坐标约 34.0537, -118.2427
UPDATE public.venues v
SET
  place_id = 'ChIJ1-4rtgE0woARw3t2-2P6aA',
  formatted_address = '200 N Spring St, Los Angeles, CA 90012, USA',
  address = '200 N Spring St, Los Angeles, CA 90012, USA',
  address_line1 = '200 N Spring St',
  address_line2 = NULL,
  city = 'Los Angeles',
  state = 'CA',
  postal_code = '90012',
  country = 'US',
  lat = 34.0537,
  lng = -118.2427,
  updated_at = NOW()
FROM public.merchants m
WHERE v.merchant_id = m.id
  AND m.name = 'Test Merchant (Invite 1461)'
  AND v.name = 'Test Venue';
