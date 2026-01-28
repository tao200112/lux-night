-- PATCH: 补全 Orders 和 Tickets 表字段
-- 由于本地 Migration 历史冲突，如果 npx supabase db push 失败，请直接在 Supabase SQL Editor 执行此脚本

-- 1. 补全 Orders 表字段 (适配 Checkout API)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS event_id UUID;

CREATE INDEX IF NOT EXISTS idx_orders_event ON public.orders(event_id);

-- 2. 补全 Tickets 表字段 (适配 Webhook logic)
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS ticket_type_id_v2 UUID,
ADD COLUMN IF NOT EXISTS event_week_id UUID;

CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_v2 ON public.tickets(ticket_type_id_v2);
