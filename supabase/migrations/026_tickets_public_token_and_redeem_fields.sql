-- =========================================================
-- 026: tickets 表添加 public_token、redeemed_at、redeemed_by
-- 用于：二维码 URL /t/[token]、公开查询、核销审计
-- =========================================================

-- 1. 添加 public_token（128-bit 随机，唯一，不可枚举）
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS public_token TEXT;

-- 2. 为已存在的票回填 public_token（128-bit md5 + id 后缀保证唯一，不依赖 pgcrypto）
UPDATE public.tickets
SET public_token = md5(random()::text || id::text || clock_timestamp()::text) || substr(id::text, 1, 8)
WHERE public_token IS NULL;

-- 3. 唯一约束与非空（回填后所有行为非空）；幂等
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='tickets' AND c.column_name='public_token' AND c.is_nullable='YES') THEN
    ALTER TABLE public.tickets ALTER COLUMN public_token SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_public_token ON public.tickets(public_token);

-- 若上一步因历史数据重复失败，可先对重复项重新生成再执行：
-- DO $$ ... 略，一般 128-bit+id 前缀 不会重复

-- 4. 添加 redeemed_at、redeemed_by（核销审计）
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS redeemed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_redeemed_at ON public.tickets(redeemed_at) WHERE redeemed_at IS NOT NULL;

COMMENT ON COLUMN public.tickets.public_token IS '128-bit+ token for /t/[token] and QR; not guessable';
COMMENT ON COLUMN public.tickets.redeemed_at IS 'When the ticket was redeemed (status=used)';
COMMENT ON COLUMN public.tickets.redeemed_by IS 'User ID of staff who redeemed';

-- 完成
DO $$
BEGIN
  RAISE NOTICE '✅ 026: tickets public_token, redeemed_at, redeemed_by added';
END $$;
