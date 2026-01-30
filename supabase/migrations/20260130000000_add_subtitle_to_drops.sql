-- Add subtitle column to drops table
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS subtitle TEXT;
