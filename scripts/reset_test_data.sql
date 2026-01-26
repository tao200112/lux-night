-- =========================================================
-- reset_test_data.sql — 仅测试环境：删除测试标识的 merchant/venue/event/order
-- 执行前请确认非生产环境。匹配：名称含 "Test" 或特定 Test Merchant。
-- =========================================================

-- 1) 删除 Test Merchant 下的 orders（通过 event -> orders）
DELETE FROM public.orders
WHERE event_id IN (
  SELECT e.id FROM public.events e
  JOIN public.merchants m ON e.merchant_id = m.id
  WHERE m.name ILIKE '%Test%'
);

-- 2) 删除 Test 相关的 event_change_requests
DELETE FROM public.event_change_requests
WHERE event_id IN (
  SELECT e.id FROM public.events e
  JOIN public.merchants m ON e.merchant_id = m.id
  WHERE m.name ILIKE '%Test%'
);

-- 3) 删除 Test Merchant 下的 events
DELETE FROM public.events
WHERE merchant_id IN (SELECT id FROM public.merchants WHERE name ILIKE '%Test%');

-- 4) 解除 invites 对 Test merchant/venue 的引用（置空或删除，按你策略）
UPDATE public.invites SET merchant_id = NULL, venue_id = NULL
WHERE merchant_id IN (SELECT id FROM public.merchants WHERE name ILIKE '%Test%');

-- 5) 删除 member_venues / merchant_members 等（依赖 venues / merchants）
DELETE FROM public.member_venues
WHERE venue_id IN (SELECT v.id FROM public.venues v JOIN public.merchants m ON v.merchant_id = m.id WHERE m.name ILIKE '%Test%');

DELETE FROM public.merchant_members
WHERE merchant_id IN (SELECT id FROM public.merchants WHERE name ILIKE '%Test%');

-- 6) 清除 merchants.default_venue_id 对即将删除的 venue 的引用
UPDATE public.merchants SET default_venue_id = NULL
WHERE default_venue_id IN (SELECT v.id FROM public.venues v JOIN public.merchants m ON v.merchant_id = m.id WHERE m.name ILIKE '%Test%');

-- 7) 删除 Test Merchant 下的 venues
DELETE FROM public.venues
WHERE merchant_id IN (SELECT id FROM public.merchants WHERE name ILIKE '%Test%');

-- 8) 删除 Test merchants
DELETE FROM public.merchants WHERE name ILIKE '%Test%';

-- 9) 可选：删除名含 "Test" 的 region（若你希望连 Region 一起清空）
-- DELETE FROM public.regions WHERE name ILIKE '%Test%';

-- 完成
SELECT 'reset_test_data completed' AS status;
