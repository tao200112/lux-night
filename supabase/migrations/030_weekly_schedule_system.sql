-- =========================================================
-- 030 WEEKLY SCHEDULE TICKETING SYSTEM
-- 重构活动售票系统：从固定日期改为周期性 Weekly Schedule
-- =========================================================
-- 
-- 核心改动：
-- 1. event_weekly_rules: 每个活动的周一到周日开放规则
-- 2. ticket_type_prices: 票种按天定价
-- 3. tickets 新增 valid_start_at, valid_end_at（有效期）
-- =========================================================

-- =========================================================
-- PART 1: 创建 event_weekly_rules 表
-- =========================================================

CREATE TABLE IF NOT EXISTS public.event_weekly_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  
  -- 星期几：0=Sunday, 1=Monday, ..., 6=Saturday
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  
  -- 是否当天可售票
  is_on_sale BOOLEAN NOT NULL DEFAULT false,
  
  -- 有效时间窗口（当天的开始和结束时间）
  -- 格式：HH:MM:SS（24小时制）
  valid_from_time TIME NOT NULL DEFAULT '22:00:00', -- 默认晚上10点开始
  valid_to_time TIME NOT NULL DEFAULT '04:00:00',   -- 默认凌晨4点结束（次日）
  
  -- 是否跨天（由触发器自动计算）
  is_overnight BOOLEAN NOT NULL DEFAULT true,
  
  -- 时区
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  
  -- 特殊日期覆盖（可选）
  -- 如果设置了 specific_date，则此规则只适用于该日期，而非每周
  specific_date DATE DEFAULT NULL,
  
  -- 管理字段
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 唯一约束：每个活动每天只能有一个规则（除非是特定日期）
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_weekly_rules_event_day 
  ON public.event_weekly_rules(event_id, day_of_week) 
  WHERE specific_date IS NULL;

-- 索引
CREATE INDEX IF NOT EXISTS idx_event_weekly_rules_event_id ON public.event_weekly_rules(event_id);
CREATE INDEX IF NOT EXISTS idx_event_weekly_rules_day ON public.event_weekly_rules(day_of_week) WHERE is_on_sale = true;

-- 注释
COMMENT ON TABLE public.event_weekly_rules IS 'Weekly schedule rules for events: which days are on sale and valid time windows';
COMMENT ON COLUMN public.event_weekly_rules.day_of_week IS '0=Sunday, 1=Monday, ..., 6=Saturday';
COMMENT ON COLUMN public.event_weekly_rules.is_overnight IS 'Auto-calculated: true if valid_to_time < valid_from_time (spans to next day)';

-- =========================================================
-- PART 2: 创建 ticket_type_prices 表（按天定价）
-- =========================================================

CREATE TABLE IF NOT EXISTS public.ticket_type_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_type_id UUID NOT NULL REFERENCES public.ticket_types(id) ON DELETE CASCADE,
  
  -- 星期几：0=Sunday, 1=Monday, ..., 6=Saturday
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  
  -- 是否该天可售
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- 该天的价格（分）
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  
  -- 该天的库存限制（可选，NULL 表示无限）
  quantity_limit INTEGER DEFAULT NULL CHECK (quantity_limit IS NULL OR quantity_limit >= 0),
  
  -- 管理字段
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- 唯一约束：每个票种每天只能有一个价格
  UNIQUE(ticket_type_id, day_of_week)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_ticket_type_prices_ticket_type ON public.ticket_type_prices(ticket_type_id);
CREATE INDEX IF NOT EXISTS idx_ticket_type_prices_enabled ON public.ticket_type_prices(ticket_type_id, day_of_week) WHERE is_enabled = true;

-- 注释
COMMENT ON TABLE public.ticket_type_prices IS 'Per-day pricing for ticket types: each ticket type can have different prices for different days';

-- =========================================================
-- PART 3: 扩展 tickets 表（添加有效期）
-- =========================================================

-- 添加票的有效期字段
ALTER TABLE public.tickets 
  ADD COLUMN IF NOT EXISTS valid_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valid_end_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valid_for_date DATE, -- 该票适用的日期
  ADD COLUMN IF NOT EXISTS purchased_day_of_week SMALLINT; -- 购买时选择的星期几

-- 索引
CREATE INDEX IF NOT EXISTS idx_tickets_validity 
  ON public.tickets(valid_start_at, valid_end_at) 
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_tickets_valid_for_date 
  ON public.tickets(valid_for_date) 
  WHERE status = 'active';

-- 注释
COMMENT ON COLUMN public.tickets.valid_start_at IS 'Ticket validity start time (calculated from weekly rules + timezone)';
COMMENT ON COLUMN public.tickets.valid_end_at IS 'Ticket validity end time (calculated from weekly rules + timezone)';
COMMENT ON COLUMN public.tickets.valid_for_date IS 'The specific date this ticket is valid for';
COMMENT ON COLUMN public.tickets.purchased_day_of_week IS 'The day of week selected when purchasing (0=Sun, 6=Sat)';

-- =========================================================
-- PART 4: 扩展 events 表（添加 schedule 模式标志）
-- =========================================================

-- 添加活动的调度模式
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'schedule_mode'
  ) THEN
    ALTER TABLE public.events ADD COLUMN schedule_mode TEXT NOT NULL DEFAULT 'single';
    ALTER TABLE public.events ADD CONSTRAINT chk_events_schedule_mode 
      CHECK (schedule_mode IN ('single', 'weekly', 'custom'));
    RAISE NOTICE 'Added schedule_mode column to events';
  END IF;
END $$;

-- 添加活动的默认时区
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'timezone'
  ) THEN
    ALTER TABLE public.events ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles';
    RAISE NOTICE 'Added timezone column to events';
  END IF;
END $$;

-- 注释
COMMENT ON COLUMN public.events.schedule_mode IS 'single=one-time event with start/end, weekly=recurring weekly schedule, custom=special dates';
COMMENT ON COLUMN public.events.timezone IS 'Default timezone for this event (affects weekly rules)';

-- =========================================================
-- PART 5: 创建辅助函数
-- =========================================================

-- 5.1 计算票的有效期（基于 weekly_rules）
CREATE OR REPLACE FUNCTION public.calculate_ticket_validity(
  p_event_id UUID,
  p_target_date DATE,
  p_day_of_week SMALLINT
)
RETURNS TABLE(valid_start_at TIMESTAMPTZ, valid_end_at TIMESTAMPTZ)
LANGUAGE plpgsql
AS $$
DECLARE
  v_rule RECORD;
  v_from_ts TIMESTAMPTZ;
  v_to_ts TIMESTAMPTZ;
BEGIN
  -- 查找该天的规则
  SELECT * INTO v_rule
  FROM public.event_weekly_rules
  WHERE event_id = p_event_id
    AND day_of_week = p_day_of_week
    AND is_on_sale = true
    AND (specific_date IS NULL OR specific_date = p_target_date)
  ORDER BY specific_date DESC NULLS LAST -- 优先使用特定日期的规则
  LIMIT 1;
  
  IF NOT FOUND THEN
    -- 没有规则，返回 NULL
    RETURN QUERY SELECT NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  
  -- 计算开始时间（目标日期 + 开始时间 + 时区）
  v_from_ts := (p_target_date + v_rule.valid_from_time) AT TIME ZONE v_rule.timezone;
  
  -- 计算结束时间
  IF v_rule.is_overnight THEN
    -- 跨天：结束时间是次日
    v_to_ts := ((p_target_date + INTERVAL '1 day') + v_rule.valid_to_time) AT TIME ZONE v_rule.timezone;
  ELSE
    -- 不跨天
    v_to_ts := (p_target_date + v_rule.valid_to_time) AT TIME ZONE v_rule.timezone;
  END IF;
  
  RETURN QUERY SELECT v_from_ts, v_to_ts;
END;
$$;

-- 5.2 检查票是否在有效期内
CREATE OR REPLACE FUNCTION public.is_ticket_valid_now(p_ticket_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket RECORD;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT valid_start_at, valid_end_at, status INTO v_ticket
  FROM public.tickets
  WHERE id = p_ticket_id;
  
  IF NOT FOUND OR v_ticket.status != 'active' THEN
    RETURN false;
  END IF;
  
  -- 如果没有设置有效期，使用旧逻辑（检查 event 的 redeem window）
  IF v_ticket.valid_start_at IS NULL AND v_ticket.valid_end_at IS NULL THEN
    RETURN true; -- 兼容旧票
  END IF;
  
  RETURN v_now >= v_ticket.valid_start_at AND v_now <= v_ticket.valid_end_at;
END;
$$;

-- 5.3 获取活动下一个可售日期
CREATE OR REPLACE FUNCTION public.get_next_sale_date(p_event_id UUID)
RETURNS DATE
LANGUAGE plpgsql
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_check_date DATE;
  v_day_of_week SMALLINT;
  v_max_days INT := 14; -- 最多查14天
BEGIN
  FOR i IN 0..v_max_days LOOP
    v_check_date := v_today + i;
    v_day_of_week := EXTRACT(DOW FROM v_check_date)::SMALLINT;
    
    IF EXISTS (
      SELECT 1 FROM public.event_weekly_rules
      WHERE event_id = p_event_id
        AND day_of_week = v_day_of_week
        AND is_on_sale = true
        AND (specific_date IS NULL OR specific_date = v_check_date)
    ) THEN
      RETURN v_check_date;
    END IF;
  END LOOP;
  
  RETURN NULL; -- 未来14天内无可售日期
END;
$$;

-- =========================================================
-- PART 6: 更新时间戳触发器
-- =========================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_weekly_rules_updated_at ON public.event_weekly_rules;
CREATE TRIGGER trg_event_weekly_rules_updated_at
BEFORE UPDATE ON public.event_weekly_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_ticket_type_prices_updated_at ON public.ticket_type_prices;
CREATE TRIGGER trg_ticket_type_prices_updated_at
BEFORE UPDATE ON public.ticket_type_prices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 自动计算 is_overnight
CREATE OR REPLACE FUNCTION public.calc_is_overnight()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_overnight := NEW.valid_to_time < NEW.valid_from_time;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_weekly_rules_calc_overnight ON public.event_weekly_rules;
CREATE TRIGGER trg_event_weekly_rules_calc_overnight
BEFORE INSERT OR UPDATE ON public.event_weekly_rules
FOR EACH ROW EXECUTE FUNCTION public.calc_is_overnight();

-- =========================================================
-- PART 7: RLS 策略
-- =========================================================

-- event_weekly_rules
ALTER TABLE public.event_weekly_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_weekly_rules_select_published" ON public.event_weekly_rules;
CREATE POLICY "event_weekly_rules_select_published" ON public.event_weekly_rules
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status = 'published')
  );

DROP POLICY IF EXISTS "event_weekly_rules_admin_all" ON public.event_weekly_rules;
CREATE POLICY "event_weekly_rules_admin_all" ON public.event_weekly_rules
  FOR ALL USING (
    public.is_admin()
  );

-- ticket_type_prices
ALTER TABLE public.ticket_type_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_type_prices_select_public" ON public.ticket_type_prices;
CREATE POLICY "ticket_type_prices_select_public" ON public.ticket_type_prices
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "ticket_type_prices_admin_all" ON public.ticket_type_prices;
CREATE POLICY "ticket_type_prices_admin_all" ON public.ticket_type_prices
  FOR ALL USING (
    public.is_admin()
  );

-- =========================================================
-- PART 8: 完成提示
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Weekly Schedule Ticketing System migration complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'New Tables:';
  RAISE NOTICE '  - event_weekly_rules: Weekly schedule per event';
  RAISE NOTICE '  - ticket_type_prices: Per-day pricing';
  RAISE NOTICE '';
  RAISE NOTICE 'New Columns:';
  RAISE NOTICE '  - events.schedule_mode: single/weekly/custom';
  RAISE NOTICE '  - events.timezone: Default timezone';
  RAISE NOTICE '  - tickets.valid_start_at/valid_end_at: Validity window';
  RAISE NOTICE '  - tickets.valid_for_date: Target date';
  RAISE NOTICE '';
  RAISE NOTICE 'New Functions:';
  RAISE NOTICE '  - calculate_ticket_validity(event_id, date, dow)';
  RAISE NOTICE '  - is_ticket_valid_now(ticket_id)';
  RAISE NOTICE '  - get_next_sale_date(event_id)';
  RAISE NOTICE '========================================';
END $$;
