-- =========================================================
-- 034 EVENT WEEK TICKETING V2
-- 彻底重做活动与票务模型：按周配置/按天票种
-- =========================================================
-- 
-- 核心改动：
-- 1. events_v2: 活动长期模板（poster/title/description/status）
-- 2. event_weeks: 每周配置（week_start_date, timezone）
-- 3. event_week_days: 每天配置（enabled, start_time, end_time, end_next_day）
-- 4. ticket_types_v2: 每天独立票种（name, category, price, inventory, min_age）
-- 5. merchant_change_requests: 商家修改申请（审批制）
-- 6. passes/tickets 快照字段：锁定已购票价格与时间窗口
-- =========================================================

-- =========================================================
-- PART 1: 创建 events_v2 表（活动长期模板）
-- =========================================================

CREATE TABLE IF NOT EXISTS public.events_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  poster_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_v2_merchant ON public.events_v2(merchant_id);
CREATE INDEX IF NOT EXISTS idx_events_v2_status ON public.events_v2(status);

DROP TRIGGER IF EXISTS trg_events_v2_updated_at ON public.events_v2;
CREATE TRIGGER trg_events_v2_updated_at
BEFORE UPDATE ON public.events_v2
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.events_v2 IS 'Event templates: long-term event definitions (poster, title, description, status)';
COMMENT ON COLUMN public.events_v2.status IS 'active: normal, paused: Temporarily Closed (visible but not purchasable), archived: hidden';

-- =========================================================
-- PART 2: 创建 event_weeks 表（每周配置）
-- =========================================================

CREATE TABLE IF NOT EXISTS public.event_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events_v2(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL, -- Monday 00:00 in timezone
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_event_weeks_event ON public.event_weeks(event_id);
CREATE INDEX IF NOT EXISTS idx_event_weeks_week_start ON public.event_weeks(week_start_date);

DROP TRIGGER IF EXISTS trg_event_weeks_updated_at ON public.event_weeks;
CREATE TRIGGER trg_event_weeks_updated_at
BEFORE UPDATE ON public.event_weeks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.event_weeks IS 'Weekly configurations for events: each week has its own schedule and ticket types';
COMMENT ON COLUMN public.event_weeks.week_start_date IS 'Monday 00:00 in timezone (calculated from any date in that week)';

-- =========================================================
-- PART 3: 创建 event_week_days 表（每天配置）
-- =========================================================

CREATE TABLE IF NOT EXISTS public.event_week_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_week_id UUID NOT NULL REFERENCES public.event_weeks(id) ON DELETE CASCADE,
  dow INT NOT NULL CHECK (dow >= 0 AND dow <= 6), -- 0=Monday, 1=Tuesday, ..., 6=Sunday
  enabled BOOLEAN NOT NULL DEFAULT false,
  start_time TIME NOT NULL DEFAULT '16:00',
  end_time TIME NOT NULL DEFAULT '02:00',
  end_next_day BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_week_id, dow)
);

CREATE INDEX IF NOT EXISTS idx_event_week_days_week ON public.event_week_days(event_week_id);

DROP TRIGGER IF EXISTS trg_event_week_days_updated_at ON public.event_week_days;
CREATE TRIGGER trg_event_week_days_updated_at
BEFORE UPDATE ON public.event_week_days
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.event_week_days IS 'Daily configurations within a week: enabled/disabled, time windows';
COMMENT ON COLUMN public.event_week_days.dow IS 'Day of week: 0=Monday, 1=Tuesday, ..., 6=Sunday';
COMMENT ON COLUMN public.event_week_days.end_next_day IS 'If true, end_time is on the next day (e.g., 16:00-02:00)';

-- =========================================================
-- PART 4: 创建 ticket_types_v2 表（每天独立票种）
-- =========================================================

CREATE TABLE IF NOT EXISTS public.ticket_types_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_week_day_id UUID NOT NULL REFERENCES public.event_week_days(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('entry','vip','drink','skipline','other')),
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  min_age INT CHECK (min_age IN (18, 21)), -- NULL = no age requirement
  inventory_limit INT CHECK (inventory_limit >= 0), -- NULL = unlimited
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','sold_out')),
  sort_order INT NOT NULL DEFAULT 0,
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_types_v2_day ON public.ticket_types_v2(event_week_day_id);
CREATE INDEX IF NOT EXISTS idx_ticket_types_v2_status ON public.ticket_types_v2(status);

DROP TRIGGER IF EXISTS trg_ticket_types_v2_updated_at ON public.ticket_types_v2;
CREATE TRIGGER trg_ticket_types_v2_updated_at
BEFORE UPDATE ON public.ticket_types_v2
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.ticket_types_v2 IS 'Ticket types per day: each day can have different tickets with different prices';
COMMENT ON COLUMN public.ticket_types_v2.stripe_product_id IS 'Stripe Product ID (one per ticket type)';
COMMENT ON COLUMN public.ticket_types_v2.stripe_price_id IS 'Stripe Price ID (current active price, new price created when price changes)';

-- =========================================================
-- PART 5: 创建 merchant_change_requests 表（商家修改申请）
-- =========================================================

CREATE TABLE IF NOT EXISTS public.merchant_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events_v2(id) ON DELETE CASCADE,
  target_week_start_date DATE NOT NULL,
  payload JSONB NOT NULL, -- Patch for week/day/tickets
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by_admin UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_change_requests_event ON public.merchant_change_requests(event_id);
CREATE INDEX IF NOT EXISTS idx_merchant_change_requests_status ON public.merchant_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_merchant_change_requests_week ON public.merchant_change_requests(target_week_start_date);

DROP TRIGGER IF EXISTS trg_merchant_change_requests_updated_at ON public.merchant_change_requests;
CREATE TRIGGER trg_merchant_change_requests_updated_at
BEFORE UPDATE ON public.merchant_change_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.merchant_change_requests IS 'Merchant change requests: proposals to modify week/day/ticket configurations (requires admin approval)';
COMMENT ON COLUMN public.merchant_change_requests.payload IS 'JSON patch: { week_start_date, days: { "0": { enabled, start_time, end_time, tickets: [...] }, ... } }';

-- =========================================================
-- PART 6: 扩展 tickets/passes 表（添加快照字段）
-- =========================================================

-- 添加快照字段到 tickets 表（如果还没有）
DO $$
BEGIN
  -- event_id (events_v2.id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'event_id_v2'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN event_id_v2 UUID REFERENCES public.events_v2(id) ON DELETE SET NULL;
  END IF;

  -- event_week_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'event_week_id'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN event_week_id UUID REFERENCES public.event_weeks(id) ON DELETE SET NULL;
  END IF;

  -- event_week_day_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'event_week_day_id'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN event_week_day_id UUID REFERENCES public.event_week_days(id) ON DELETE SET NULL;
  END IF;

  -- ticket_type_id (ticket_types_v2.id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'ticket_type_id_v2'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN ticket_type_id_v2 UUID REFERENCES public.ticket_types_v2(id) ON DELETE SET NULL;
  END IF;

  -- 快照字段（如果还没有 valid_start_at/valid_end_at，则添加）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'valid_start_at'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN valid_start_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'valid_end_at'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN valid_end_at TIMESTAMPTZ;
  END IF;

  -- 价格与名称快照
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'ticket_name_snapshot'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN ticket_name_snapshot TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'price_paid_cents_snapshot'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN price_paid_cents_snapshot INT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'currency_snapshot'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN currency_snapshot TEXT DEFAULT 'usd';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'min_age_snapshot'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN min_age_snapshot INT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'policy_snapshot'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN policy_snapshot JSONB;
  END IF;
END $$;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_tickets_event_v2 ON public.tickets(event_id_v2) WHERE event_id_v2 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_week ON public.tickets(event_week_id) WHERE event_week_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_validity_v2 ON public.tickets(valid_start_at, valid_end_at) WHERE status = 'active';

COMMENT ON COLUMN public.tickets.event_id_v2 IS 'Snapshot: event_id from events_v2 (for v2 tickets)';
COMMENT ON COLUMN public.tickets.event_week_id IS 'Snapshot: week configuration when ticket was purchased';
COMMENT ON COLUMN public.tickets.event_week_day_id IS 'Snapshot: day configuration when ticket was purchased';
COMMENT ON COLUMN public.tickets.ticket_type_id_v2 IS 'Snapshot: ticket_type_id from ticket_types_v2 (for v2 tickets)';
COMMENT ON COLUMN public.tickets.ticket_name_snapshot IS 'Snapshot: ticket name at purchase time';
COMMENT ON COLUMN public.tickets.price_paid_cents_snapshot IS 'Snapshot: price paid at purchase time (locked)';
COMMENT ON COLUMN public.tickets.currency_snapshot IS 'Snapshot: currency at purchase time';
COMMENT ON COLUMN public.tickets.min_age_snapshot IS 'Snapshot: min_age requirement at purchase time';
COMMENT ON COLUMN public.tickets.policy_snapshot IS 'Snapshot: additional policy data at purchase time';

-- =========================================================
-- PART 7: RPC 函数 - 获取或创建本周配置
-- =========================================================

CREATE OR REPLACE FUNCTION public.rpc_get_or_create_event_week(
  p_event_id UUID,
  p_for_date DATE,
  p_timezone TEXT DEFAULT 'America/New_York'
)
RETURNS TABLE (
  event_week_id UUID,
  week_start_date DATE,
  days JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_week_start_date DATE;
  v_event_week_id UUID;
  v_prev_week_start DATE;
  v_days JSONB := '[]'::JSONB;
  v_day_record RECORD;
  v_ticket_record RECORD;
  v_day_json JSONB;
  v_tickets_json JSONB;
BEGIN
  -- 计算 week_start_date（周一 00:00）
  -- EXTRACT(DOW FROM date) 返回 0=Sunday, 1=Monday, ..., 6=Saturday
  -- 我们需要转换为 0=Monday, 1=Tuesday, ..., 6=Sunday
  v_week_start_date := p_for_date - (EXTRACT(DOW FROM p_for_date)::INT - 1 + 7) % 7;

  -- 检查是否已存在
  SELECT id INTO v_event_week_id
  FROM public.event_weeks
  WHERE event_id = p_event_id AND week_start_date = v_week_start_date;

  IF v_event_week_id IS NOT NULL THEN
    -- 已存在，返回现有配置
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', ewd.id,
        'dow', ewd.dow,
        'enabled', ewd.enabled,
        'start_time', ewd.start_time::TEXT,
        'end_time', ewd.end_time::TEXT,
        'end_next_day', ewd.end_next_day,
        'tickets', COALESCE(
          (SELECT jsonb_agg(
            jsonb_build_object(
              'id', tt.id,
              'name', tt.name,
              'category', tt.category,
              'price_cents', tt.price_cents,
              'currency', tt.currency,
              'min_age', tt.min_age,
              'inventory_limit', tt.inventory_limit,
              'status', tt.status,
              'sort_order', tt.sort_order,
              'stripe_product_id', tt.stripe_product_id,
              'stripe_price_id', tt.stripe_price_id
            ) ORDER BY tt.sort_order
          )
          FROM public.ticket_types_v2 tt
          WHERE tt.event_week_day_id = ewd.id),
          '[]'::JSONB
        )
      ) ORDER BY ewd.dow
    ) INTO v_days
    FROM public.event_week_days ewd
    WHERE ewd.event_week_id = v_event_week_id;

    RETURN QUERY SELECT v_event_week_id, v_week_start_date, v_days;
    RETURN;
  END IF;

  -- 不存在，需要创建
  -- 1. 创建 event_week
  INSERT INTO public.event_weeks (event_id, week_start_date, timezone, status)
  VALUES (p_event_id, v_week_start_date, p_timezone, 'active')
  RETURNING id INTO v_event_week_id;

  -- 2. 查找上周配置（用于复制）
  v_prev_week_start := v_week_start_date - INTERVAL '7 days';
  SELECT id INTO v_prev_week_start
  FROM public.event_weeks
  WHERE event_id = p_event_id AND week_start_date = v_prev_week_start
  LIMIT 1;

  -- 3. 创建 7 个 event_week_days（默认 disabled，默认时间 16:00-02:00）
  -- 如果有上周配置，则复制上周的 enabled/time
  FOR i IN 0..6 LOOP
    DECLARE
      v_enabled BOOLEAN := false;
      v_start_time TIME := '16:00';
      v_end_time TIME := '02:00';
      v_end_next_day BOOLEAN := true;
    BEGIN
      -- 如果有上周配置，复制上周的设置
      IF v_prev_week_start IS NOT NULL THEN
        SELECT enabled, start_time, end_time, end_next_day
        INTO v_enabled, v_start_time, v_end_time, v_end_next_day
        FROM public.event_week_days
        WHERE event_week_id = v_prev_week_start AND dow = i
        LIMIT 1;
      END IF;

      -- 创建 day
      INSERT INTO public.event_week_days (
        event_week_id, dow, enabled, start_time, end_time, end_next_day
      )
      VALUES (v_event_week_id, i, v_enabled, v_start_time, v_end_time, v_end_next_day)
      RETURNING id INTO v_day_record.id;

      -- 如果有上周配置，复制上周的 ticket_types（但创建新的 ticket_types_v2，不复用 stripe_price_id）
      IF v_prev_week_start IS NOT NULL THEN
        FOR v_ticket_record IN
          SELECT * FROM public.ticket_types_v2 tt
          INNER JOIN public.event_week_days ewd ON tt.event_week_day_id = ewd.id
          WHERE ewd.event_week_id = v_prev_week_start AND ewd.dow = i
          ORDER BY tt.sort_order
        LOOP
          INSERT INTO public.ticket_types_v2 (
            event_week_day_id, name, category, price_cents, currency,
            min_age, inventory_limit, status, sort_order
            -- 注意：不复制 stripe_product_id 和 stripe_price_id，需要重新创建
          )
          VALUES (
            v_day_record.id, v_ticket_record.name, v_ticket_record.category,
            v_ticket_record.price_cents, v_ticket_record.currency,
            v_ticket_record.min_age, v_ticket_record.inventory_limit,
            v_ticket_record.status, v_ticket_record.sort_order
          );
        END LOOP;
      END IF;
    END;
  END LOOP;

  -- 4. 返回新创建的配置
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ewd.id,
      'dow', ewd.dow,
      'enabled', ewd.enabled,
      'start_time', ewd.start_time::TEXT,
      'end_time', ewd.end_time::TEXT,
      'end_next_day', ewd.end_next_day,
      'tickets', COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'id', tt.id,
            'name', tt.name,
            'category', tt.category,
            'price_cents', tt.price_cents,
            'currency', tt.currency,
            'min_age', tt.min_age,
            'inventory_limit', tt.inventory_limit,
            'status', tt.status,
            'sort_order', tt.sort_order,
            'stripe_product_id', tt.stripe_product_id,
            'stripe_price_id', tt.stripe_price_id
          ) ORDER BY tt.sort_order
        )
        FROM public.ticket_types_v2 tt
        WHERE tt.event_week_day_id = ewd.id),
        '[]'::JSONB
      )
    ) ORDER BY ewd.dow
  ) INTO v_days
  FROM public.event_week_days ewd
  WHERE ewd.event_week_id = v_event_week_id;

  RETURN QUERY SELECT v_event_week_id, v_week_start_date, v_days;
END;
$$;

COMMENT ON FUNCTION public.rpc_get_or_create_event_week IS 'Get or create event week configuration: calculates week_start_date (Monday), creates 7 days with default settings, optionally copies from previous week';

-- =========================================================
-- PART 8: 时间窗口计算函数（统一算法）
-- =========================================================

CREATE OR REPLACE FUNCTION public.calculate_day_validity_window(
  p_week_start_date DATE,
  p_dow INT,
  p_start_time TIME,
  p_end_time TIME,
  p_end_next_day BOOLEAN,
  p_timezone TEXT DEFAULT 'America/New_York'
)
RETURNS TABLE(valid_start_at TIMESTAMPTZ, valid_end_at TIMESTAMPTZ)
LANGUAGE plpgsql
AS $$
DECLARE
  v_target_date DATE;
  v_start_ts TIMESTAMPTZ;
  v_end_ts TIMESTAMPTZ;
BEGIN
  -- 计算目标日期（week_start_date + dow days）
  v_target_date := p_week_start_date + (p_dow || ' days')::INTERVAL;

  -- 计算 valid_start_at: (target_date + start_time) in timezone -> timestamptz
  v_start_ts := (v_target_date + p_start_time) AT TIME ZONE p_timezone;

  -- 计算 valid_end_at
  IF p_end_next_day THEN
    -- 跨天：结束时间是次日
    v_end_ts := ((v_target_date + INTERVAL '1 day') + p_end_time) AT TIME ZONE p_timezone;
  ELSE
    -- 不跨天
    v_end_ts := (v_target_date + p_end_time) AT TIME ZONE p_timezone;
  END IF;

  RETURN QUERY SELECT v_start_ts, v_end_ts;
END;
$$;

COMMENT ON FUNCTION public.calculate_day_validity_window IS 'Calculate validity window for a day: unified algorithm used by admin save, customer checkout, and staff validation';

-- =========================================================
-- PART 9: RLS 策略（权限隔离）
-- =========================================================

-- events_v2
ALTER TABLE public.events_v2 ENABLE ROW LEVEL SECURITY;

-- Admin: 完全读写
DROP POLICY IF EXISTS "events_v2_admin_all" ON public.events_v2;
CREATE POLICY "events_v2_admin_all" ON public.events_v2
  FOR ALL USING (public.is_admin());

-- Internal: 只读（自己 merchant 的）
DROP POLICY IF EXISTS "events_v2_internal_select" ON public.events_v2;
CREATE POLICY "events_v2_internal_select" ON public.events_v2
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.merchant_members mm
      WHERE mm.user_id = auth.uid() AND mm.merchant_id = events_v2.merchant_id
    )
  );

-- Customer: 只读（仅 active/paused）
DROP POLICY IF EXISTS "events_v2_customer_select" ON public.events_v2;
CREATE POLICY "events_v2_customer_select" ON public.events_v2
  FOR SELECT USING (status IN ('active', 'paused'));

-- event_weeks
ALTER TABLE public.event_weeks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_weeks_admin_all" ON public.event_weeks;
CREATE POLICY "event_weeks_admin_all" ON public.event_weeks
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "event_weeks_internal_select" ON public.event_weeks;
CREATE POLICY "event_weeks_internal_select" ON public.event_weeks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.events_v2 e
      INNER JOIN public.merchant_members mm ON mm.merchant_id = e.merchant_id
      WHERE mm.user_id = auth.uid() AND e.id = event_weeks.event_id
    )
  );

DROP POLICY IF EXISTS "event_weeks_customer_select" ON public.event_weeks;
CREATE POLICY "event_weeks_customer_select" ON public.event_weeks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.events_v2 e
      WHERE e.id = event_weeks.event_id AND e.status IN ('active', 'paused')
    )
  );

-- event_week_days
ALTER TABLE public.event_week_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_week_days_admin_all" ON public.event_week_days;
CREATE POLICY "event_week_days_admin_all" ON public.event_week_days
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "event_week_days_internal_select" ON public.event_week_days;
CREATE POLICY "event_week_days_internal_select" ON public.event_week_days
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.event_weeks ew
      INNER JOIN public.events_v2 e ON e.id = ew.event_id
      INNER JOIN public.merchant_members mm ON mm.merchant_id = e.merchant_id
      WHERE mm.user_id = auth.uid() AND ew.id = event_week_days.event_week_id
    )
  );

DROP POLICY IF EXISTS "event_week_days_customer_select" ON public.event_week_days;
CREATE POLICY "event_week_days_customer_select" ON public.event_week_days
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.event_weeks ew
      INNER JOIN public.events_v2 e ON e.id = ew.event_id
      WHERE e.status IN ('active', 'paused') AND ew.id = event_week_days.event_week_id
    )
  );

-- ticket_types_v2
ALTER TABLE public.ticket_types_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_types_v2_admin_all" ON public.ticket_types_v2;
CREATE POLICY "ticket_types_v2_admin_all" ON public.ticket_types_v2
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "ticket_types_v2_internal_select" ON public.ticket_types_v2;
CREATE POLICY "ticket_types_v2_internal_select" ON public.ticket_types_v2
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.event_week_days ewd
      INNER JOIN public.event_weeks ew ON ew.id = ewd.event_week_id
      INNER JOIN public.events_v2 e ON e.id = ew.event_id
      INNER JOIN public.merchant_members mm ON mm.merchant_id = e.merchant_id
      WHERE mm.user_id = auth.uid() AND ewd.id = ticket_types_v2.event_week_day_id
    )
  );

DROP POLICY IF EXISTS "ticket_types_v2_customer_select" ON public.ticket_types_v2;
CREATE POLICY "ticket_types_v2_customer_select" ON public.ticket_types_v2
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.event_week_days ewd
      INNER JOIN public.event_weeks ew ON ew.id = ewd.event_week_id
      INNER JOIN public.events_v2 e ON e.id = ew.event_id
      WHERE e.status IN ('active', 'paused') AND ewd.id = ticket_types_v2.event_week_day_id
    )
  );

-- merchant_change_requests
ALTER TABLE public.merchant_change_requests ENABLE ROW LEVEL SECURITY;

-- Internal: 仅能创建、读取自己 merchant_id 的记录，不能改 status 为 approved/rejected
DROP POLICY IF EXISTS "merchant_change_requests_internal_insert" ON public.merchant_change_requests;
CREATE POLICY "merchant_change_requests_internal_insert" ON public.merchant_change_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.merchant_members mm
      WHERE mm.user_id = auth.uid() AND mm.merchant_id = merchant_change_requests.merchant_id
    )
  );

DROP POLICY IF EXISTS "merchant_change_requests_internal_select" ON public.merchant_change_requests;
CREATE POLICY "merchant_change_requests_internal_select" ON public.merchant_change_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.merchant_members mm
      WHERE mm.user_id = auth.uid() AND mm.merchant_id = merchant_change_requests.merchant_id
    )
  );

DROP POLICY IF EXISTS "merchant_change_requests_internal_update" ON public.merchant_change_requests;
CREATE POLICY "merchant_change_requests_internal_update" ON public.merchant_change_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.merchant_members mm
      WHERE mm.user_id = auth.uid() AND mm.merchant_id = merchant_change_requests.merchant_id
    )
    AND status != 'approved' AND status != 'rejected' -- 不能直接改状态为 approved/rejected
  );

-- Admin: 可读写并审批
DROP POLICY IF EXISTS "merchant_change_requests_admin_all" ON public.merchant_change_requests;
CREATE POLICY "merchant_change_requests_admin_all" ON public.merchant_change_requests
  FOR ALL USING (public.is_admin());

-- =========================================================
-- PART 10: 完成提示
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Event Week Ticketing V2 migration complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'New Tables:';
  RAISE NOTICE '  - events_v2: Event templates (poster, title, description, status)';
  RAISE NOTICE '  - event_weeks: Weekly configurations';
  RAISE NOTICE '  - event_week_days: Daily configurations (enabled, time windows)';
  RAISE NOTICE '  - ticket_types_v2: Per-day ticket types with prices';
  RAISE NOTICE '  - merchant_change_requests: Merchant change proposals (approval required)';
  RAISE NOTICE '';
  RAISE NOTICE 'New Functions:';
  RAISE NOTICE '  - rpc_get_or_create_event_week(event_id, for_date, timezone)';
  RAISE NOTICE '  - calculate_day_validity_window(...)';
  RAISE NOTICE '';
  RAISE NOTICE 'Extended Tables:';
  RAISE NOTICE '  - tickets: Added snapshot fields (event_id_v2, event_week_id, etc.)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS Policies:';
  RAISE NOTICE '  - Admin: Full read/write';
  RAISE NOTICE '  - Internal: Read-only (own merchant)';
  RAISE NOTICE '  - Customer: Read-only (active/paused events)';
  RAISE NOTICE '========================================';
END $$;
