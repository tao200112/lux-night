-- =========================================================
-- 012 UPGRADE EVENT TICKET MODEL
-- 升级活动票种数据模型，支持完整售票场景
-- =========================================================

-- =========================================================
-- 1. 扩展 events 表
-- =========================================================

-- 添加核销时间窗口
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS redeem_start_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS redeem_end_at TIMESTAMPTZ;

-- 扩展 refund_policy 支持更多选项
ALTER TABLE public.events 
DROP CONSTRAINT IF EXISTS events_refund_policy_check;

ALTER TABLE public.events 
ADD CONSTRAINT events_refund_policy_check 
CHECK (refund_policy IN ('no_refund', '24h', 'flexible', 'venue_policy', 'UNTIL_START', 'CUSTOM'));

-- 添加发布状态（更清晰的发布状态管理）
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS published_status TEXT DEFAULT 'DRAFT' 
CHECK (published_status IN ('DRAFT', 'PUBLISHED'));

-- 添加 subtitle/tags 字段
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS subtitle TEXT;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_events_published_status ON public.events(published_status);
CREATE INDEX IF NOT EXISTS idx_events_redeem_window ON public.events(redeem_start_at, redeem_end_at);

COMMENT ON COLUMN public.events.redeem_start_at IS 'Ticket redemption window start (for staff scanner)';
COMMENT ON COLUMN public.events.redeem_end_at IS 'Ticket redemption window end (for staff scanner)';
COMMENT ON COLUMN public.events.published_status IS 'Publication status: DRAFT or PUBLISHED';
COMMENT ON COLUMN public.events.subtitle IS 'Event subtitle or tags';

-- =========================================================
-- 2. 扩展 ticket_types 表
-- =========================================================

-- 添加描述
ALTER TABLE public.ticket_types 
ADD COLUMN IF NOT EXISTS description TEXT;

-- 添加年龄要求
ALTER TABLE public.ticket_types 
ADD COLUMN IF NOT EXISTS age_requirement TEXT DEFAULT 'NONE' 
CHECK (age_requirement IN ('NONE', '18_PLUS', '21_PLUS'));

-- 添加销售时间窗口
ALTER TABLE public.ticket_types 
ADD COLUMN IF NOT EXISTS sales_start_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sales_end_at TIMESTAMPTZ;

-- 添加状态（DRAFT/ACTIVE/HIDDEN）
ALTER TABLE public.ticket_types 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'DRAFT' 
CHECK (status IN ('DRAFT', 'ACTIVE', 'HIDDEN'));

-- 添加排序
ALTER TABLE public.ticket_types 
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 添加每人限购
ALTER TABLE public.ticket_types 
ADD COLUMN IF NOT EXISTS max_per_order INTEGER DEFAULT 4 
CHECK (max_per_order >= 1);

-- 重命名 inventory_limit 为 quantity_total（语义更清晰）
ALTER TABLE public.ticket_types 
ADD COLUMN IF NOT EXISTS quantity_total INTEGER;

-- 如果 inventory_limit 有数据，迁移到 quantity_total
UPDATE public.ticket_types 
SET quantity_total = inventory_limit 
WHERE quantity_total IS NULL AND inventory_limit IS NOT NULL;

-- 添加票种级别的核销时间覆盖（可选）
ALTER TABLE public.ticket_types 
ADD COLUMN IF NOT EXISTS redeem_start_at_override TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS redeem_end_at_override TIMESTAMPTZ;

-- 扩展 category 支持更多类型
ALTER TABLE public.ticket_types 
DROP CONSTRAINT IF EXISTS ticket_types_category_check;

ALTER TABLE public.ticket_types 
ADD CONSTRAINT ticket_types_category_check 
CHECK (category IN ('ENTRY', 'DRINK', 'VIP', 'SKIP_LINE'));

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_ticket_types_status ON public.ticket_types(status);
CREATE INDEX IF NOT EXISTS idx_ticket_types_sort ON public.ticket_types(event_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_ticket_types_sales_window ON public.ticket_types(sales_start_at, sales_end_at);

COMMENT ON COLUMN public.ticket_types.description IS 'Ticket type description';
COMMENT ON COLUMN public.ticket_types.age_requirement IS 'Age requirement: NONE, 18_PLUS, or 21_PLUS';
COMMENT ON COLUMN public.ticket_types.sales_start_at IS 'Sales window start time';
COMMENT ON COLUMN public.ticket_types.sales_end_at IS 'Sales window end time';
COMMENT ON COLUMN public.ticket_types.status IS 'Ticket type status: DRAFT, ACTIVE, or HIDDEN';
COMMENT ON COLUMN public.ticket_types.sort_order IS 'Display order in ticket list';
COMMENT ON COLUMN public.ticket_types.max_per_order IS 'Maximum tickets per order';
COMMENT ON COLUMN public.ticket_types.quantity_total IS 'Total available quantity (null = unlimited)';
COMMENT ON COLUMN public.ticket_types.redeem_start_at_override IS 'Override event redeem window start for this ticket type';
COMMENT ON COLUMN public.ticket_types.redeem_end_at_override IS 'Override event redeem window end for this ticket type';

-- =========================================================
-- 3. 确保 Storage bucket 存在（如果不存在则创建）
-- =========================================================

-- 注意：Storage bucket 需要通过 Supabase Dashboard 或 CLI 创建
-- 这里只添加注释说明
COMMENT ON COLUMN public.events.poster_url IS 'Poster image URL from event-posters storage bucket';

-- =========================================================
-- 完成
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Event & Ticket Model Upgrade Complete!';
  RAISE NOTICE '   - events: redeem window, published_status, subtitle';
  RAISE NOTICE '   - ticket_types: age_requirement, sales window, status, sort_order, max_per_order';
  RAISE NOTICE '   - All indexes and constraints applied';
  RAISE NOTICE '========================================';
END $$;
