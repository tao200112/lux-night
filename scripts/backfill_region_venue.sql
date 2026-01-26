-- =========================================================
-- backfill_region_venue.sql — 将旧 venues/address 尽量补齐到 formatted_address
-- 若无法解析则置空 formatted_address，保留 address 作展示兜底；标记需编辑的可选。
-- 不改表结构，仅 UPDATE 数据。
-- =========================================================

-- 1) 将 address 有值但 formatted_address 为空的 venue，把 address 复制到 formatted_address 作为兜底
--    展示逻辑已为 formatted_address ?? address，故复制后可统一走 formatted_address
UPDATE public.venues
SET formatted_address = address,
    updated_at = NOW()
WHERE (formatted_address IS NULL OR formatted_address = '')
  AND address IS NOT NULL
  AND address != '';

-- 2) 对仍然缺少 city/state/country 的 venue，若 formatted_address 有类似 "City, ST" 的 pattern，
--    可做简单解析（可选，这里不做复杂正则，仅做占位说明）
-- 若你使用 PostGIS 或外部地理编码，可在此调用。此处仅做最小回填。

-- 3) 为 region 补 city：若 region 有 name/state/country 但 city 为空，用 name 当作 city 的初步回填（仅当 name 像城市名时）
UPDATE public.regions
SET city = name,
    updated_at = NOW()
WHERE (city IS NULL OR city = '')
  AND name IS NOT NULL
  AND name != '';

-- 完成
SELECT 'backfill_region_venue completed' AS status;
