-- =========================================================
-- 结构化地址字段：venues + regions
-- 用于 PlaceAutocomplete 选址后写入，顾客端按 region_id / city / state 过滤与展示
-- =========================================================

-- ---------- venues ----------
-- 若已存在则跳过（ALTER ADD COLUMN IF NOT EXISTS 需 PG 9.6+；若不可用则逐条 DO）
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS place_id TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS formatted_address TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS country TEXT;
-- lat, lng, region_id 已存在，不重复添加

-- place_id 唯一约束（允许多个 NULL）
DROP INDEX IF EXISTS uq_venues_place_id;
CREATE UNIQUE INDEX uq_venues_place_id ON public.venues(place_id) WHERE place_id IS NOT NULL;

-- ---------- regions ----------
-- 补充 slug, city, center_lat, center_lng（state, country, is_active 已存在）
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS center_lat DOUBLE PRECISION;
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS center_lng DOUBLE PRECISION;

-- slug 唯一
DROP INDEX IF EXISTS uq_regions_slug;
CREATE UNIQUE INDEX uq_regions_slug ON public.regions(slug) WHERE slug IS NOT NULL;

-- slug、center_lat/lng 由应用在新增/编辑 Region 时从 PlaceAutocomplete 写入，不做回填
