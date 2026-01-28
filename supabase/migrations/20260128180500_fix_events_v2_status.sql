-- 20260128180500_fix_events_v2_status.sql
-- Fix events_v2 status check constraint to include 'draft'
-- V2 Skill Requirements: draft -> active -> archived

ALTER TABLE public.events_v2 DROP CONSTRAINT IF EXISTS events_v2_status_check;

ALTER TABLE public.events_v2 ADD CONSTRAINT events_v2_status_check 
  CHECK (status IN ('draft', 'active', 'paused', 'archived', 'temp_closed', 'hidden', 'sold_out'));

-- Update default to 'draft' just in case, or keep 'active'
ALTER TABLE public.events_v2 ALTER COLUMN status SET DEFAULT 'draft';
