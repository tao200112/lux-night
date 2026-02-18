-- Add sort_order to events_v2 for drag-and-drop ordering
ALTER TABLE public.events_v2 ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 1000;

-- Backfill existing events: 1000, 2000, 3000... (allows inserting between)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) * 1000 AS ord
  FROM public.events_v2
)
UPDATE public.events_v2 e
SET sort_order = ranked.ord
FROM ranked
WHERE e.id = ranked.id AND (e.sort_order IS NULL OR e.sort_order = 1000);

CREATE INDEX IF NOT EXISTS idx_events_v2_sort_order ON public.events_v2(sort_order);

COMMENT ON COLUMN public.events_v2.sort_order IS 'Display order: lower first. Used for admin drag-and-drop and customer Discover list.';
